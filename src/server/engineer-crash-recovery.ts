/**
 * Applies the bounded engineer crash-recovery policy from
 * `src/core/engineer-crash-recovery.ts` (#0869).
 *
 * A crashed turn never becomes a handoff on its own: the runner reports the
 * crash here, this module records it, resumes the same engineer below the
 * threshold, and after N crashes for the same agent+model switches to the next
 * unpaused budget-allowlist pair. A human-set override is never replaced —
 * that case (and a destination-less allowlist, or an already-attempted switch)
 * is surfaced for a human instead of silently retrying.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { commitTaskFile } from "../core/git.js";
import { parseTask, recordChange, serializeTask } from "../core/task.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  DEFAULT_ENGINEER_CRASH_FAILOVER_THRESHOLD,
  DEFAULT_ENGINEER_CRASH_FAILOVER_WINDOW_MS,
  DEFAULT_ENGINEER_STALL_RESUME_LIMIT,
  DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS,
  ENGINEER_CRASH_LOG_KEY,
  ENGINEER_FAILOVER_KEY,
  ENGINEER_STALL_RESUME_LOG_KEY,
  failoverMarker,
  parseEngineerCrashLog,
  parseEngineerStallResumeLog,
  planEngineerCrashRecovery,
  planEngineerStallResume,
  readEngineerCleanExitSignal,
  recordEngineerCrash,
  recordEngineerStallResume,
  serializeEngineerCrashLog,
  serializeEngineerStallResumeLog,
  type EngineerCrashPlan,
  type EngineerPair,
  type EngineerTurnExitKind,
} from "../core/engineer-crash-recovery.js";
import type { Logger } from "../core/logger.js";
import { resolveAgentForTask, type AgentRunner, type EngineerCrashInfo } from "./agents.js";
import { isTaskClosingOut } from "./close-out-lock.js";
import { relaunchEngineerOnActiveTask, type EngineerLaunchResult } from "./engineer-launch.js";
import type { LiveIndex } from "./live-index.js";

export type { EngineerCrashInfo } from "./agents.js";

export interface EngineerCrashRecoveryDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  logger: Logger;
  /** Test seam; production uses the shared engineer relaunch path. */
  launch?: typeof relaunchEngineerOnActiveTask;
}

export interface EngineerCrashRecoveryOutcome {
  action: "skipped" | "handoff" | "resumed" | "failed-over" | "surfaced" | "launch-failed";
  detail: string;
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

function writeTask(
  config: RepoOSConfig,
  task: Task,
  entry: string,
  commitMessage = `docs(${task.id}): engineer crash recovery`,
): void {
  recordChange(task, entry);
  writeFileSync(task.absPath, serializeTask(task));
  commitTaskFile(config.root, task.absPath, commitMessage);
}

function thresholdFor(config: RepoOSConfig): number {
  const value = config.watchdog?.engineerCrashFailoverThreshold;
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : DEFAULT_ENGINEER_CRASH_FAILOVER_THRESHOLD;
}

function windowFor(config: RepoOSConfig): number {
  const value = config.watchdog?.engineerCrashFailoverWindowMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 60_000
    ? value
    : DEFAULT_ENGINEER_CRASH_FAILOVER_WINDOW_MS;
}

function minutes(windowMs: number): string {
  const value = windowMs / 60_000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function condense(reason: string): string {
  const oneLine = reason.replace(/\s+/g, " ").trim();
  return oneLine.length > 240 ? `${oneLine.slice(0, 237)}…` : oneLine || "no failure detail";
}

function crashPair(info: EngineerCrashInfo, task: Task, config: RepoOSConfig): EngineerPair | null {
  const resolved = resolveAgentForTask(config, task);
  const cli = info.cli?.trim() || resolved?.cli;
  if (!cli) return null;
  const rawModel = info.model?.trim();
  const model =
    rawModel && rawModel !== "default" ? rawModel : (resolved?.model ?? rawModel ?? "default");
  return { cli, model };
}

function resumeInstruction(
  plan: Extract<EngineerCrashPlan, { action: "resume" }>,
  reason: string,
): string {
  return [
    `Automatic crash recovery: the previous turn on this task ended with an error before any handoff (${condense(reason)}).`,
    `The task is still active and nothing has been handed off. Resume from the current worktree state and finish it.`,
    `Run \`repoos check\` and emit the handoff signal only when the work is complete and the check passes.`,
  ].join("\n");
}

function failoverInstruction(
  plan: Extract<EngineerCrashPlan, { action: "failover" }>,
  reason: string,
): string {
  return [
    `Automatic crash recovery: ${plan.from.cli} + ${plan.from.model} crashed ${plan.crashes} times in the last ${minutes(plan.windowMs)} minutes (${condense(reason)}).`,
    `RepoOS switched this task to ${plan.to.cli} + ${plan.to.model}. The worktree and task history are unchanged.`,
    `Resume from the current state and finish the task. Run \`repoos check\` and emit the handoff signal only when the work is complete and the check passes.`,
  ].join("\n");
}

/**
 * Record a crashed engineer turn and carry out the bounded recovery plan.
 *
 * Never throws: a recovery failure must leave the task active with the crash
 * reason visible, not take the server down.
 */
export async function recoverEngineerAfterCrash(
  deps: EngineerCrashRecoveryDeps,
  taskId: string,
  info: EngineerCrashInfo,
  opts: { now?: number } = {},
): Promise<EngineerCrashRecoveryOutcome> {
  const { config, index, runner, logger } = deps;
  try {
    const indexed = index.getTask(taskId);
    if (!indexed || indexed.isArchived || indexed.status !== "active") {
      return { action: "skipped", detail: "task is not active" };
    }
    if (
      runner.isRunning(taskId) ||
      runner.isHandoffInFlight(taskId) ||
      runner.hasPendingHandoff(taskId) ||
      runner.isPaused(taskId)
    ) {
      return { action: "skipped", detail: "a turn or handoff already owns the task" };
    }
    const task = parseFresh(config, indexed);
    if (task.status !== "active" || task.isArchived) {
      return { action: "skipped", detail: "task left active" };
    }
    const pair = crashPair(info, task, config);
    if (!pair) {
      return { action: "skipped", detail: "no engineer pair to recover" };
    }

    const now = opts.now ?? Date.now();
    const nowIso = new Date(now).toISOString();
    const threshold = thresholdFor(config);
    const windowMs = windowFor(config);
    const crashes = recordEngineerCrash(
      parseEngineerCrashLog(task.extra?.[ENGINEER_CRASH_LOG_KEY]),
      pair,
      info.kind,
      nowIso,
      windowMs,
    );
    task.extra = { ...task.extra, [ENGINEER_CRASH_LOG_KEY]: serializeEngineerCrashLog(crashes) };
    const plan = planEngineerCrashRecovery({
      task,
      pair,
      crashes,
      threshold,
      windowMs,
      now,
      allowlist: config.budget?.allowlist ?? [],
    });
    if (plan.action === "handoff") {
      return { action: "handoff", detail: "the engineer requested its own handoff" };
    }

    if (plan.action === "surface") {
      const why =
        plan.reason === "human-override"
          ? `a human-set task override (${plan.detail}) is pinned, so RepoOS did not replace it`
          : plan.reason === "already-failed-over"
            ? `RepoOS already switched this task once (${plan.detail}); it will not chain another automatic switch`
            : plan.detail;
      const detail =
        `engineer keeps crashing (${plan.crashes} in ${minutes(plan.windowMs)}m): ${why}. ` +
        `Review the crash detail and either fix the environment, change the override, or resume manually.`;
      task.needsInput = true;
      task.needsInputReason = task.needsInputReason ?? "dev-error";
      task.needsInputDetail = detail;
      writeTask(
        config,
        task,
        `engineer crash recovery: surfaced instead of switching — ${why} (${plan.crashes}/${plan.threshold} crashes in ${minutes(plan.windowMs)}m)`,
      );
      index.applyFileChange(task.absPath, { guarded: true });
      logger.task(taskId, "warn", "engineer crash recovery surfaced for a human", { detail });
      return { action: "surfaced", detail };
    }

    const launch = deps.launch ?? relaunchEngineerOnActiveTask;
    const instruction =
      plan.action === "failover"
        ? failoverInstruction(plan, info.reason)
        : resumeInstruction(plan, info.reason);

    if (plan.action === "failover") {
      task.cliOverride = plan.to.cli;
      task.modelOverride = plan.to.model;
      task.extra = {
        ...task.extra,
        [ENGINEER_FAILOVER_KEY]: failoverMarker(plan.to),
      };
      writeTask(
        config,
        task,
        `engineer crash recovery: switched ${plan.from.cli} + ${plan.from.model} → ${plan.to.cli} + ${plan.to.model} after ${plan.crashes}/${plan.threshold} crashes in ${minutes(plan.windowMs)}m · ${condense(info.reason)}`,
      );
    } else {
      writeTask(
        config,
        task,
        `engineer crash recovery: resuming ${plan.pair.cli} + ${plan.pair.model} (${plan.crashes}/${plan.threshold} crashes in ${minutes(plan.windowMs)}m) · ${condense(info.reason)}`,
      );
    }
    index.applyFileChange(task.absPath, { guarded: true });

    const result: EngineerLaunchResult = await launch(
      { config, index, runner, logger },
      task,
      instruction,
      {
        freshSession: plan.action === "failover",
        fromCrashRecovery: true,
      },
    );
    if (!result.ok) {
      const detail = `crash recovery could not start the engineer: ${result.reason}`;
      const current = parseFresh(config, task);
      current.needsInput = true;
      current.needsInputReason = current.needsInputReason ?? "dev-error";
      current.needsInputDetail = `${detail}. The task stayed active with its worktree intact.`;
      writeTask(config, current, `engineer crash recovery: start failed — ${result.reason}`);
      index.applyFileChange(current.absPath, { guarded: true });
      logger.task(taskId, "warn", "engineer crash recovery could not start", {
        reason: result.reason,
      });
      return { action: "launch-failed", detail };
    }
    if (plan.action === "failover") {
      logger.task(taskId, "info", "engineer failed over after repeated crashes", {
        from: `${plan.from.cli} + ${plan.from.model}`,
        to: `${plan.to.cli} + ${plan.to.model}`,
        crashes: plan.crashes,
      });
      return {
        action: "failed-over",
        detail: `${plan.from.cli} + ${plan.from.model} → ${plan.to.cli} + ${plan.to.model}`,
      };
    }
    logger.task(taskId, "info", "engineer resumed after a crash", {
      pair: `${plan.pair.cli} + ${plan.pair.model}`,
      crashes: plan.crashes,
    });
    return {
      action: "resumed",
      detail: `${plan.pair.cli} + ${plan.pair.model}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.task(taskId, "warn", "engineer crash recovery failed", { error: message });
    return { action: "skipped", detail: `recovery error: ${message}` };
  }
}

/**
 * Server-side application of the stalled-clean-exit policy (#0888).
 *
 * The runner records `engineer turn ended without a handoff` when a clean turn
 * finishes without asking for review; TaskWatchdog reads that durable signal,
 * applies {@link planEngineerStallResume}, and calls this module to resume the
 * same engineer with the normal resume preamble. This deliberately reuses the
 * #0869 launch path so a clean exit and a crash cannot become two parallel
 * recovery mechanisms (ADR 0008).
 */
export interface EngineerStallRecoveryDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  logger?: Pick<Logger, "task">;
  /** Test seam; production uses the shared engineer relaunch path. */
  launch?: typeof relaunchEngineerOnActiveTask;
}

export interface EngineerStallRecoveryContext {
  /** How the last engineer turn ended. */
  exitKind: EngineerTurnExitKind;
  /** The handoff was deferred because queued message(s) had to be read first. */
  handoffDeferred?: boolean;
  /** Queued messages the deferred handoff was waiting for. */
  queuedMessages?: number;
  /** A handoff completed after the branch's last commit — nothing to resume. */
  handoffSinceLastCommit?: boolean;
}

export interface EngineerStallRecoveryOutcome {
  action: "skipped" | "resumed" | "surfaced" | "launch-failed";
  detail: string;
}

function stallResumeInstruction(context: EngineerStallRecoveryContext): string {
  if (context.handoffDeferred) {
    return [
      "Automatic recovery: your previous turn requested a handoff while message(s) were still queued, so RepoOS deferred the review.",
      "Read the queued message(s) now (they are included in this turn) and continue from the current worktree state.",
      "When the work is complete and `repoos check` passes, request review again.",
    ].join("\n");
  }
  return [
    "Automatic recovery: your previous turn on this task ended cleanly without requesting a handoff.",
    "The task is still active and nothing has been handed off. Read any queued message(s), then resume from the current worktree state and finish the task.",
    "Run `repoos check` and emit the handoff signal only when the work is complete and the check passes.",
  ].join("\n");
}

/**
 * Resume (or surface) an `active` task whose engineer turn ended cleanly without
 * a handoff. Never throws: a recovery failure leaves the task active with the
 * reason visible rather than taking the server down.
 */
export async function recoverEngineerAfterStalledCleanExit(
  deps: EngineerStallRecoveryDeps,
  taskId: string,
  context: EngineerStallRecoveryContext,
  opts: { now?: number } = {},
): Promise<EngineerStallRecoveryOutcome> {
  const { config, index, runner, logger } = deps;
  try {
    const indexed = index.getTask(taskId);
    if (!indexed || indexed.isArchived || indexed.status !== "active") {
      return { action: "skipped", detail: "task is not active" };
    }
    if (
      runner.isRunning(taskId) ||
      (typeof runner.isQueued === "function" && runner.isQueued(taskId)) ||
      runner.isHandoffInFlight(taskId) ||
      runner.hasPendingHandoff(taskId) ||
      runner.isPaused(taskId)
    ) {
      return { action: "skipped", detail: "a turn or handoff already owns the task" };
    }
    if (isTaskClosingOut(config.root, config.cacheDir, taskId)) {
      return { action: "skipped", detail: "the task is being closed out" };
    }
    const task = parseFresh(config, indexed);
    if (task.status !== "active" || task.isArchived) {
      return { action: "skipped", detail: "task left active" };
    }
    // Re-read the durable signal from the fresh task file: between the
    // watchdog's scan and this call a person may have stopped the turn, which
    // must cancel the resume.
    const signal = readEngineerCleanExitSignal(task.body);

    const now = opts.now ?? Date.now();
    const resumes = parseEngineerStallResumeLog(task.extra?.[ENGINEER_STALL_RESUME_LOG_KEY]);
    const plan = planEngineerStallResume({
      status: task.status,
      isArchived: task.isArchived,
      needsInput: task.needsInput,
      assignedToHuman:
        task.assignee === "human" || task.assignedTo.trim().toLowerCase() === "human",
      paused: false,
      stoppedByPerson: signal.stoppedByPerson,
      running: false,
      handoffInFlight: false,
      pendingHandoff: false,
      closingOut: false,
      handoffRequested: false,
      exitKind: context.exitKind,
      handoffDeferred: context.handoffDeferred,
      queuedMessages: context.queuedMessages,
      handoffSinceLastCommit: context.handoffSinceLastCommit,
      resumes,
      now,
      limit: DEFAULT_ENGINEER_STALL_RESUME_LIMIT,
      windowMs: DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS,
    });
    if (plan.action === "skip") return { action: "skipped", detail: plan.reason };

    if (plan.action === "surface") {
      const detail =
        `${plan.resumes} automatic resume(s) in the last ${minutes(plan.windowMs)} did not ` +
        `produce a handoff — the engineer keeps ending its turn without one. ` +
        `Review the transcript and resume it manually, or fix why it stops before handing off.`;
      task.needsInput = true;
      task.needsInputReason = "watchdog-stuck";
      task.needsInputDetail = detail;
      writeTask(
        config,
        task,
        `watchdog: escalated to needs_input · ${plan.resumes} automatic resume(s) in ${minutes(plan.windowMs)}m produced no handoff`,
        `docs(${task.id}): surface stalled engineer`,
      );
      index.applyFileChange(task.absPath, { guarded: true });
      logger?.task(
        taskId,
        "warn",
        "stalled engineer surfaced for a human after automatic resumes",
        {
          resumes: plan.resumes,
          windowMs: plan.windowMs,
        },
      );
      return { action: "surfaced", detail };
    }

    const nowIso = new Date(now).toISOString();
    const attempt = plan.resumes + 1;
    task.extra = {
      ...task.extra,
      [ENGINEER_STALL_RESUME_LOG_KEY]: serializeEngineerStallResumeLog(
        recordEngineerStallResume(resumes, nowIso, plan.reason, plan.windowMs),
      ),
    };
    const note = context.handoffDeferred
      ? `watchdog: auto-resumed engineer to read a deferred handoff message · resume ${attempt}/${plan.limit} in ${minutes(plan.windowMs)}m`
      : `watchdog: auto-resumed engineer after a clean exit without a handoff · resume ${attempt}/${plan.limit} in ${minutes(plan.windowMs)}m`;
    writeTask(config, task, note, `docs(${task.id}): resume stalled engineer`);
    index.applyFileChange(task.absPath, { guarded: true });

    const launch = deps.launch ?? relaunchEngineerOnActiveTask;
    const result: EngineerLaunchResult = await launch(
      {
        config,
        index,
        runner,
        logger: (logger ?? { task: () => {} }) as unknown as Logger,
      },
      task,
      stallResumeInstruction(context),
    );
    if (!result.ok) {
      const detail = `automatic resume could not start the engineer: ${result.reason}`;
      const current = parseFresh(config, task);
      current.needsInput = true;
      current.needsInputReason = current.needsInputReason ?? "dev-error";
      current.needsInputDetail = `${detail}. The task stayed active with its worktree intact.`;
      writeTask(
        config,
        current,
        `watchdog: automatic resume failed — ${result.reason}`,
        `docs(${current.id}): resume stalled engineer`,
      );
      index.applyFileChange(current.absPath, { guarded: true });
      logger?.task(taskId, "warn", "automatic resume could not start the engineer", {
        reason: result.reason,
      });
      return { action: "launch-failed", detail };
    }
    logger?.task(taskId, "info", "engineer resumed after a clean exit without a handoff", {
      reason: plan.reason,
      attempt,
      limit: plan.limit,
    });
    return { action: "resumed", detail: `${plan.reason} (${attempt}/${plan.limit})` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.task(taskId, "warn", "stalled engineer recovery failed", { error: message });
    return { action: "skipped", detail: `recovery error: ${message}` };
  }
}

/**
 * A clean turn made progress: forget the crash window so an occasional crash
 * over days never accumulates into a failover (#0869). An automatic failover
 * pair stays in place — it is now this task's deliberate selection, so the
 * task is not bounced back to the crash-prone pair; a later crash series on it
 * surfaces for a human instead of chaining another switch (ADR 0008). Never
 * throws.
 */
export function clearEngineerCrashRecoveryState(
  deps: Pick<EngineerCrashRecoveryDeps, "config" | "index" | "logger">,
  taskId: string,
): void {
  const { config, index, logger } = deps;
  try {
    const indexed = index.getTask(taskId);
    if (!indexed) return;
    const task = parseFresh(config, indexed);
    if (!(ENGINEER_CRASH_LOG_KEY in task.extra)) return;
    const extra = { ...task.extra };
    delete extra[ENGINEER_CRASH_LOG_KEY];
    task.extra = extra;
    writeFileSync(task.absPath, serializeTask(task));
    commitTaskFile(config.root, task.absPath, `docs(${task.id}): clear engineer crash window`);
    index.applyFileChange(task.absPath, { guarded: true });
  } catch (err) {
    logger.task(taskId, "warn", "could not clear engineer crash window", {
      error: (err as Error).message,
    });
  }
}
