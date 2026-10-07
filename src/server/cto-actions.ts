/**
 * CTO safe actions (#0688): allowlisted, rate-limited, audited server functions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  CTO_ACTION_LABELS,
  ctoActionRateLimitExceeded,
  countCtoRestartsThisEpisode,
  decideRestartStrategy,
  isCtoActionAllowlisted,
  isCtoSafeActionId,
  type CtoSafeActionId,
} from "../core/cto-actions.js";
import { refreshMainDependencyInstall } from "../core/dependency-install.js";
import { parseTask, recordChange, serializeTask } from "../core/task.js";
import { commitTaskFile } from "../core/git.js";
import type { AttentionEventStore } from "./attention-events.js";
import type { CtoActionRateStore } from "./cto-action-rates.js";
import type { AgentRunner } from "./agents.js";
import type { LiveIndex } from "./live-index.js";
import type { JobCoordinator } from "./integration-job.js";
import type { Logger } from "../core/logger.js";
import { requeueCloseOutAfterEnvFix } from "./close-out-requeue.js";
import { relaunchEngineerOnActiveTask } from "./engineer-launch.js";
import {
  classifyDeadAgentReason,
  hasRecentWorktreeActivity,
  isStuckActiveTask,
} from "./task-watchdog.js";
import { buildIntegrationSnapshot } from "./integration-status.js";
import { resolvePipelineCheckPlan } from "./check-plan-info.js";
import type { RepoEvent } from "./live-index.js";
import type { DoneStep } from "./done.js";

const STALENESS_MS = 5 * 60 * 1000;

export type CtoActionActor = "cto" | "human" | "api";

export type CtoActionResult =
  | { ok: true; detail: string }
  | { ok: false; reason: string; rateLimited?: boolean };

export interface CtoActionDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  jobCoordinator: JobCoordinator;
  attentionEvents: AttentionEventStore;
  rates: CtoActionRateStore;
  logger: Logger;
  emitEvent: (e: RepoEvent) => void;
  triggerJobProcessing: () => void;
  reportedStages: Record<string, DoneStep>;
}

function auditAction(
  deps: CtoActionDeps,
  action: CtoSafeActionId,
  actor: CtoActionActor,
  detail: string,
  taskId: string | null,
): void {
  const at = new Date().toISOString();
  const label = CTO_ACTION_LABELS[action];
  const message =
    actor === "cto" ? `CTO: ${label}` : actor === "human" ? `You ran: ${label}` : label;
  deps.attentionEvents.record({
    kind: "ctoAction",
    taskId,
    message,
    detail,
    at,
  });
  deps.emitEvent({ type: "attention.updated", at });
}

function checkAllowlistAndRate(
  deps: CtoActionDeps,
  action: CtoSafeActionId,
  taskId: string | null,
): CtoActionResult | null {
  if (!isCtoActionAllowlisted(deps.config, action)) {
    return { ok: false, reason: `Action "${action}" is not allowlisted in cto.actions` };
  }
  const recent = deps.rates.countRecent(action, taskId);
  if (ctoActionRateLimitExceeded(action, recent)) {
    return {
      ok: false,
      reason: `Rate limit reached for "${action}" — try again later`,
      rateLimited: true,
    };
  }
  return null;
}

function recordRate(deps: CtoActionDeps, action: CtoSafeActionId, taskId: string | null): void {
  deps.rates.record(action, taskId);
}

function taskFromIndex(deps: CtoActionDeps, taskId: string): Task | null {
  return deps.index.getTask(taskId) ?? null;
}

function isRestartCandidate(deps: CtoActionDeps, task: Task): string | null {
  if (task.status !== "active") return "task is not active";
  if (task.needsInput) return "task needs human input";
  if (deps.runner.isRunning(task.id)) return "agent is running";
  if (deps.runner.isPaused(task.id)) return "task is paused";
  if (deps.runner.isHandoffInFlight(task.id) || deps.runner.hasPendingHandoff(task.id)) {
    return "handoff is in progress";
  }
  const now = Date.now();
  if (hasRecentWorktreeActivity(deps.config.root, task.branch, STALENESS_MS, now)) {
    return "worktree still has recent activity";
  }
  if (!isStuckActiveTask(task.body, STALENESS_MS, now)) {
    return "task does not look stalled yet";
  }
  return null;
}

export async function runCtoSafeAction(
  deps: CtoActionDeps,
  actionId: string,
  opts: { taskId?: string | null; actor?: CtoActionActor },
): Promise<CtoActionResult> {
  if (!isCtoSafeActionId(actionId)) {
    return { ok: false, reason: `Unknown CTO action "${actionId}"` };
  }
  const action = actionId;
  const actor = opts.actor ?? "api";
  const taskId = opts.taskId ?? null;

  // Master kill switch (#0727): halt automatic actions, but a human asking for
  // one explicitly (UI button or API call) still runs.
  if (actor === "cto" && deps.config.automation?.paused === true) {
    return { ok: false, reason: "Automatic actions are paused (automation.paused)" };
  }

  const gate = checkAllowlistAndRate(deps, action, taskId);
  if (gate) return gate;

  if (action === "refresh-main-install") {
    const install = await refreshMainDependencyInstall(deps.config);
    if (!install.ok) {
      return {
        ok: false,
        reason: install.reason ?? "could not refresh dependencies in main",
      };
    }
    recordRate(deps, action, null);
    const detail = "Refreshed the primary checkout install.";
    auditAction(deps, action, actor, detail, null);
    return { ok: true, detail };
  }

  if (!taskId) {
    return { ok: false, reason: `Task id is required for "${action}"` };
  }

  const task = taskFromIndex(deps, taskId);
  if (!task) {
    return { ok: false, reason: `Task #${taskId} not found` };
  }

  if (action === "restart-stalled-agent") {
    const block = isRestartCandidate(deps, task);
    if (block) {
      return { ok: false, reason: `Cannot restart engineer: ${block}` };
    }
    const { kind, reason } = classifyDeadAgentReason(task, deps.runner);
    const priorRestarts = countCtoRestartsThisEpisode(task.body);
    const strategy = decideRestartStrategy({ kind, reason }, priorRestarts);
    const instruction = [
      "The board monitor restarted this engineer session because the previous run ended without progress.",
      `Last session signal (${kind}): ${reason}`,
      strategy === "fresh"
        ? "The previous conversation was reset because it kept ending without progress — start the task again from the worktree's current state."
        : "Continue the work from where the previous session left off.",
      "Read the failure, fix the root cause, run verification, then hand off when ready.",
    ].join("\n");

    const launch = await relaunchEngineerOnActiveTask(deps, task, instruction, {
      freshSession: strategy === "fresh",
    });
    if (!launch.ok) {
      return { ok: false, reason: launch.reason };
    }

    try {
      const current = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: deps.config.root,
        defaultStatus: deps.config.defaultStatus,
        defaultAssignee: deps.config.defaultAssignee,
      });
      const note = `CTO action: restart-stalled-agent (${strategy}) · ${reason}`;
      recordChange(current, note);
      writeFileSync(task.absPath, serializeTask(current));
      commitTaskFile(deps.config.root, task.absPath, `docs(${current.id}): CTO restart engineer`);
      deps.index.applyFileChange(task.absPath, { guarded: true });
    } catch (err) {
      deps.logger.task(taskId, "warn", "CTO restart recorded agent but activity write failed", {
        error: (err as Error).message,
      });
    }

    recordRate(deps, action, taskId);
    const detail = `Restarted engineer for #${taskId} (${strategy} session).`;
    auditAction(deps, action, actor, detail, taskId);
    return { ok: true, detail };
  }

  if (action === "requeue-closeout-after-env-fix") {
    const result = await requeueCloseOutAfterEnvFix(deps.config, deps.jobCoordinator, task);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    deps.triggerJobProcessing();
    deps.emitEvent({
      type: "integration",
      pipeline: buildIntegrationSnapshot(
        deps.jobCoordinator,
        deps.reportedStages,
        resolvePipelineCheckPlan(deps.config),
      ),
    });
    recordRate(deps, action, taskId);
    const detail = result.refreshed
      ? `Refreshed main install and re-queued close-out for #${taskId}.`
      : `Re-queued close-out for #${taskId}.`;
    auditAction(deps, action, actor, detail, taskId);
    return { ok: true, detail };
  }

  return { ok: false, reason: "Unhandled action" };
}

/** Deterministic recovery pass for the CTO monitor tick. */
export async function runCtoMonitorSafeActions(deps: CtoActionDeps): Promise<void> {
  const allowed = new Set(
    (deps.config.cto?.actions ?? []).filter((a): a is CtoSafeActionId => isCtoSafeActionId(a)),
  );
  if (!allowed.size) return;

  if (allowed.has("restart-stalled-agent")) {
    for (const task of deps.index.getTasks("active")) {
      if (task.isArchived || task.needsInput) continue;
      if (isRestartCandidate(deps, task) !== null) continue;
      const gate = checkAllowlistAndRate(deps, "restart-stalled-agent", task.id);
      if (gate) continue;
      const result = await runCtoSafeAction(deps, "restart-stalled-agent", {
        taskId: task.id,
        actor: "cto",
      });
      if (result.ok) {
        deps.logger.agent("cto", "info", "safe action restart-stalled-agent", {
          taskId: task.id,
        });
      }
    }
  }

  if (allowed.has("requeue-closeout-after-env-fix")) {
    for (const job of deps.jobCoordinator.allJobs()) {
      if (job.phase !== "failed") continue;
      const task = deps.index.getTask(job.taskId);
      if (!task) continue;
      const gate = checkAllowlistAndRate(deps, "requeue-closeout-after-env-fix", task.id);
      if (gate) continue;
      const result = await runCtoSafeAction(deps, "requeue-closeout-after-env-fix", {
        taskId: task.id,
        actor: "cto",
      });
      if (result.ok) {
        deps.logger.agent("cto", "info", "safe action requeue-closeout-after-env-fix", {
          taskId: task.id,
        });
      }
    }
  }
}
