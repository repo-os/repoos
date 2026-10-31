/**
 * Restart active tasks whose engineer has been gone longer than the configured
 * window (#0993).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { commitTaskFile } from "../core/git.js";
import {
  activeWithoutEngineerWindowMs,
  planActiveWithoutEngineerRecovery,
} from "../core/active-without-engineer-recovery.js";
import { readEngineerCleanExitSignal } from "../core/engineer-crash-recovery.js";
import { parseTask, recordChange, serializeTask } from "../core/task.js";
import { isHoldActive } from "../core/task-selection.js";
import type { Logger } from "../core/logger.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { notifyAttentionEngineerRecoveryFailed } from "./attention-notify.js";
import { isTaskClosingOut } from "./close-out-lock.js";
import type { AgentRunner } from "./agents.js";
import { resolveAgentForTask } from "./agents.js";
import { hasRecentWorktreeActivity } from "./task-watchdog.js";
import { relaunchEngineerOnActiveTask, type EngineerLaunchResult } from "./engineer-launch.js";
import { assessHandoffFailureLoop, readTaskBranchHead } from "./handoff-failure-loop.js";
import type { LiveIndex } from "./live-index.js";

function lastStatusTransitionTime(body: string, status: string): number | null {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return null;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const match = lines[i].match(/^- (\d{4}-\d{2}-\d{2}T[^\s]+) · status [a-z_]+→(\w+)/);
    if (match && match[2] === status) {
      const t = Date.parse(match[1]);
      return Number.isNaN(t) ? null : t;
    }
  }
  return null;
}

export interface ActiveWithoutEngineerRecoveryDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  logger: Logger;
  launch?: typeof relaunchEngineerOnActiveTask;
}

function parseFresh(config: RepoOSConfig, task: Task): Task {
  return parseTask({
    content: readFileSync(task.absPath, "utf8"),
    absPath: task.absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
}

function lastActivityAfterActive(body: string): number {
  const activeAt = lastStatusTransitionTime(body, "active");
  if (activeAt === null) return 0;
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return activeAt;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("-")) continue;
    const match = line.match(/^- (\d{4}-\d{2}-\d{2}T[^\s]+) · /);
    if (!match) continue;
    const t = Date.parse(match[1]);
    if (Number.isNaN(t)) continue;
    if (t > activeAt) return t;
    return activeAt;
  }
  return activeAt;
}

function writeTask(
  config: RepoOSConfig,
  task: Task,
  entry: string,
  commitMessage = `docs(${task.id}): active without engineer recovery`,
): void {
  if (process.env.REPOOS_PREVIEW_CHILD === "1") return;
  recordChange(task, entry);
  writeFileSync(task.absPath, serializeTask(task));
  commitTaskFile(config.root, task.absPath, commitMessage);
}

const RECOVERY_INSTRUCTION = [
  "Automatic recovery: this task has been active with no engineer running for longer than the configured window.",
  "Resume from the current worktree state. Read any queued message(s), then finish the task.",
  "Run `repoos check` and emit the handoff signal only when the work is complete and the check passes.",
].join("\n");

export async function recoverActiveTasksWithoutEngineer(
  deps: ActiveWithoutEngineerRecoveryDeps,
  opts: { now?: number } = {},
): Promise<void> {
  const { config, index, runner, logger } = deps;
  const now = opts.now ?? Date.now();
  const windowMs = activeWithoutEngineerWindowMs(config.watchdog?.activeWithoutEngineerRecoverMs);
  const launch = deps.launch ?? relaunchEngineerOnActiveTask;

  for (const indexed of index.getTasks("active")) {
    if (indexed.isArchived || isHoldActive(indexed)) continue;
    const humanAssigned =
      indexed.assignee === "human" || indexed.assignedTo.trim().toLowerCase() === "human";
    const task = parseFresh(config, indexed);
    const signal = readEngineerCleanExitSignal(task.body);
    const idleMs = now - lastActivityAfterActive(task.body);
    const plan = planActiveWithoutEngineerRecovery({
      task,
      now,
      windowMs,
      running: runner.isRunning(task.id),
      queued: typeof runner.isQueued === "function" ? runner.isQueued(task.id) : false,
      handoffInFlight: runner.isHandoffInFlight(task.id),
      pendingHandoff: runner.hasPendingHandoff(task.id),
      paused: runner.isPaused(task.id),
      held: isHoldActive(task),
      humanAssigned,
      closingOut: isTaskClosingOut(config.root, config.cacheDir, task.id),
      stoppedByPerson: signal.stoppedByPerson,
      idleMs,
    });
    if (plan.action === "skip") continue;

    const branchHead = await readTaskBranchHead(config, task);
    const handoffLoop = assessHandoffFailureLoop(task, branchHead);
    if (handoffLoop.lastFailureIsCheck && handoffLoop.branchUnchanged) {
      continue;
    }

    if (task.branch && (await hasRecentWorktreeActivity(config.root, task.branch, windowMs, now))) {
      continue;
    }

    const agent = resolveAgentForTask(config, task);
    if (!agent) {
      await surfaceRecoveryFailure(deps, task, noAgentAvailableReason(config));
      continue;
    }

    task.needsInput = false;
    task.needsInputReason = undefined;
    task.needsInputDetail = undefined;
    writeTask(
      config,
      task,
      `watchdog: restarting engineer after ${Math.round(idleMs / 60_000)}m with no live process`,
    );
    index.applyFileChange(task.absPath, { guarded: true });

    const result: EngineerLaunchResult = await launch(
      { config, index, runner, logger },
      task,
      RECOVERY_INSTRUCTION,
      { fromCrashRecovery: true },
    );
    if (result.ok) {
      logger.task(task.id, "info", "restarted engineer after active-without-engineer window", {
        idleMs,
        windowMs,
      });
      continue;
    }
    await surfaceRecoveryFailure(deps, task, result.reason);
  }
}

function noAgentAvailableReason(config: RepoOSConfig): string {
  return "no allowlisted, non-paused engineer pair is available";
}

async function surfaceRecoveryFailure(
  deps: ActiveWithoutEngineerRecoveryDeps,
  task: Task,
  reason: string,
): Promise<void> {
  const { config, index, logger } = deps;
  const detail = `Automatic recovery could not restart the engineer: ${reason}`;
  const current = parseFresh(config, task);
  current.needsInput = true;
  current.needsInputReason = current.needsInputReason ?? "dev-error";
  current.needsInputDetail = detail;
  writeTask(
    config,
    current,
    `watchdog: active-without-engineer recovery failed — ${reason}`,
    `docs(${current.id}): recovery failed`,
  );
  index.applyFileChange(current.absPath, { guarded: true });
  notifyAttentionEngineerRecoveryFailed(current.id, current.title, reason);
  logger.task(current.id, "warn", "active-without-engineer recovery failed", { reason });
}
