/**
 * Background watchdog for `active` tasks whose agent session is dead or
 * stalled (#0180). Detects a task sitting silently in `active` — no live agent
 * process, no recent activity — records WHY it stopped in the task transcript
 * (agent crashed / exited without a handoff / never started), and surfaces it
 * by auto-transitioning it to a visible state.
 *
 * A task is considered stuck when:
 * - status === 'active'
 * - No agent process is running (`runner.isRunning(id)` === false) and no
 *   server-side handoff is finalizing
 * - Not already flagged `needsInput` (the human is on it)
 * - Not deliberately paused (0070) — `runner.isPaused(id)` is true
 * - No activity since the most recent `status →active` transition (or no
 *   activity at all) for longer than the staleness threshold
 *
 * On detection the watchdog:
 * 1. Classifies the failure reason — `never-started` (no session ever began),
 *    `crashed` (the persisted handoff log shows an interrupted turn), or
 *    `exited-without-handoff` (a session ran, its process ended, but no clean
 *    handoff signal followed).
 * 2. Records that reason in the task's Activity log.
 * 3. Surfaces the task by auto-transitioning it out of the silent `active`
 *    state (`watchdog.autoTransition`, default on): to `review` when the
 *    worktree holds work (committed or uncommitted — reviewable, never to be
 *    silently discarded, the #0172 lesson), else back to `ready` where it can
 *    be picked up again. The write goes through the live index, so the board
 *    updates and the existing ntfy status-change notification fires. When
 *    auto-transition is disabled it falls back to `needsInput` (the #0156
 *    escalation), which fires the existing needs-input notification.
 *
 * Guards:
 * - Never fires while the server is mid-reload (`canRun` is observed every
 *   scan — the reload manager reports `isReloading()` during handover).
 * - Never marks a task whose agent is legitimately paused.
 * - Bounded: a task is surfaced at most once (persisted Activity marker, so
 *   the bound survives reloads; the in-memory set is only a fast path).
 */
import { writeFileSync, readFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import { parseTask, serializeTask, recordChange } from "../core/task.js";
import { commitTaskFile, worktreeStatus } from "../core/git.js";

const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const WATCHDOG_INTERVAL_MS = 60 * 1000; // Check every 1 minute

/** Activity-log marker the watchdog writes/reads to bound surfacing once. */
const SURFACED_ACTIVITY = /watchdog: auto-surfaced stuck task/;
const ESCALATED_ACTIVITY = /watchdog: escalated to needs_input/;
const HANDOFF_FAILURE_ACTIVITY = /handoff failed · (.+)$/m;

/** Why a dead/stalled active task's agent session stopped. */
export type DeadAgentReason = "never-started" | "crashed" | "exited-without-handoff";

/** The dead-session classification plus the exact transcript reason string. */
export interface DeadAgentClassification {
  kind: DeadAgentReason;
  reason: string;
}

/**
 * Best-effort next-step suggestion for an escalation note, matched from the
 * captured failure reason. A generic fallback beats a wrong diagnosis.
 */
export function suggestNextStep(reason: string): string {
  const r = reason.toLowerCase();
  if (/permission|approval|allowed|confirm|prompt/.test(r)) {
    return (
      "check the transcript for an unanswered permission/approval prompt — see " +
      "docs/adr/0005-agents-use-repoos-apis-for-privileged-operations.md"
    );
  }
  if (/signal|handoff|rendered|ansi|kiro/.test(r)) {
    return (
      "the handoff signal may not have been emitted on its own line — the agent's " +
      "final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for " +
      "signal-line rendering bugs)"
    );
  }
  if (/interrupted|stopped|killed|crash|exit/.test(r)) {
    return "the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off";
  }
  if (/timeout|stall|hung|hang|busy/.test(r)) {
    return "the agent stalled or timed out — see DEFAULT_STALL_TIMEOUT_MS in src/server/agents.ts";
  }
  return "resume the session manually from the task's worktree and check for uncommitted work";
}

/**
 * Pure stuck-detection over a task's Activity log. True when the log has a
 * `status →active` transition and no Activity entry after it for at least
 * `stalenessMs` (a task with zero entries after going active is the purest
 * stuck shape — its clock runs from the transition itself).
 */
export function isStuckActiveTask(body: string, stalenessMs: number, now: number): boolean {
  const transitionAt = lastStatusTransitionTime(body, "active");
  if (transitionAt === null) return false;
  return now - lastActivityTime(body, transitionAt) >= stalenessMs;
}

/**
 * Classify why an active task's agent session is dead. The `task` is the
 * freshly-parsed on-disk Task (its Activity log may carry a persisted
 * `handoff failed · …` entry); `runner.output(id)` reveals whether the task
 * ever had a session (in-memory or persisted) at all.
 */
export function classifyDeadAgentReason(
  task: Task,
  runner: AgentRunner,
): DeadAgentClassification {
  // A persisted handoff failure is the strongest signal: the turn reached the
  // handoff boundary but its process ended uncleanly (or the task could not be
  // resolved) — the "killed mid-turn" shape.
  const failed = extractHandoffFailure(task.body);
  if (failed) {
    return {
      kind: "crashed",
      reason: `agent crashed or was interrupted mid-turn — ${failed}`,
    };
  }
  // No session ever existed: the task went active but no agent process was
  // ever launched (or its session was never persisted).
  if (!runner.output(task.id)) {
    return {
      kind: "never-started",
      reason: "agent never started — no session exists for this task",
    };
  }
  // A session ran and ended, but the agent never emitted a clean handoff.
  return {
    kind: "exited-without-handoff",
    reason: "agent exited without emitting the handoff signal",
  };
}

/**
 * Where a stuck task lands when surfaced: `review` whenever its worktree holds
 * any work (committed branch commits OR uncommitted changes — either way it is
 * reviewable, and moving it to `ready` could discard it on a clean restart),
 * else `ready` to go back in the pile. Without a branch/worktree there is no
 * work to look at, so `ready`.
 */
export function autoTransitionTarget(config: RepoOSConfig, task: Task): "ready" | "review" {
  if (!task.branch) return "ready";
  const status = worktreeStatus(config.root, task.branch);
  return status.dirty ? "review" : "ready";
}

/** The most recent persisted handoff-failure reason in an Activity log, if any. */
function extractHandoffFailure(body: string): string | null {
  const match = body.match(HANDOFF_FAILURE_ACTIVITY);
  return match?.[1]?.trim() || null;
}

/** Whether the task's Activity log already shows a watchdog surface/escalation. */
function alreadySurfaced(body: string): boolean {
  return SURFACED_ACTIVITY.test(body) || ESCALATED_ACTIVITY.test(body);
}

export interface TaskWatchdogOptions {
  /**
   * Observerd each scan; when it returns false the scan is skipped entirely.
   * The server uses this to make the watchdog never fire mid-reload (#0180).
   */
  canRun?: () => boolean;
  /**
   * When true (default), a stuck task is auto-transitioned to a visible state
   * (`review`/`ready`). When false, the #0156 fallback applies instead: the
   * task is escalated to `needsInput` and left `active`.
   */
  autoTransition?: boolean;
}

export class TaskWatchdog {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private runner: AgentRunner;
  private readonly autoTransition: boolean;
  private readonly canRun?: () => boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stalenessThresholdMs: number;

  constructor(
    config: RepoOSConfig,
    index: LiveIndex,
    runner: AgentRunner,
    stalenessThresholdMs: number = DEFAULT_STALENESS_THRESHOLD_MS,
    opts: TaskWatchdogOptions = {},
  ) {
    this.config = config;
    this.index = index;
    this.runner = runner;
    this.stalenessThresholdMs = stalenessThresholdMs;
    this.autoTransition = opts.autoTransition !== false;
    this.canRun = opts.canRun;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.checkNow();
    }, WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run one full scan now (used by the timer and by tests). */
  async checkNow(): Promise<void> {
    if (this.canRun && !this.canRun()) return;
    for (const task of this.index.getTasks("active")) {
      if (this.isStuck(task)) {
        await this.handleStuck(task);
      }
    }
  }

  private isStuck(task: Task): boolean {
    // A task the human is already flagged on is not stuck-but-unnoticed: don't
    // auto-surface or re-escalate it.
    if (task.needsInput) return false;
    // An agent process is running, or a server-side handoff is finalizing.
    if (this.runner.isRunning(task.id)) return false;
    if (this.runner.isHandoffInFlight(task.id)) return false;
    // A deliberately paused agent is legitimate — never disturb it (#0180).
    if (this.runner.isPaused(task.id)) return false;
    // Bounded: never surface a task the watchdog already surfaced.
    if (alreadySurfaced(task.body)) return false;
    return isStuckActiveTask(task.body, this.stalenessThresholdMs, Date.now());
  }

  private async handleStuck(task: Task): Promise<void> {
    // Re-read fresh from disk (the index copy can lag the canonical board) and
    // re-check the guards against the on-disk reality.
    const current = this.readCurrent(task);
    if (current.status !== "active") return;
    if (alreadySurfaced(current.body)) return;

    const { reason } = classifyDeadAgentReason(current, this.runner);
    if (this.autoTransition) {
      this.surfaceTask(current, autoTransitionTarget(this.config, current), reason);
      return;
    }
    // Fallback (#0156): keep the task active but flag it for the human.
    this.escalateToNeedsInput(current, reason);
  }

  /**
   * Move a stuck task out of the silent `active` state: write the status +
   * reason in one Activity entry, then commit so main stays mergeable and the
   * indexing write surfaces the change to the board + ntfy notification.
   */
  private surfaceTask(task: Task, target: "ready" | "review", reason: string): void {
    const current = this.readCurrent(task);
    if (current.status !== "active") return;
    if (alreadySurfaced(current.body)) return;
    try {
      const note = `watchdog: auto-surfaced stuck task · status active→${target} · ${reason} · next step: ${suggestNextStep(reason)}`;
      current.status = target;
      current.needsInput = false;
      recordChange(current, note);
      this.writeTask(current);
      commitTaskFile(this.config.root, current.absPath, `docs(${current.id}): update task`);
    } catch (err) {
      console.error(`[repoos] watchdog: failed to surface #${task.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Escalate a stuck task (#0156 fallback): set `needsInput: true` (which
   * surfaces on the board and fires the existing `notifyNeedsInput`
   * notification) and append an Activity entry with the failure reason and a
   * suggested next step. The task stays `active` — visible, not silent.
   */
  private escalateToNeedsInput(task: Task, failureReason?: string): void {
    let current: Task;
    try {
      current = this.readCurrent(task);
    } catch (err) {
      console.error(`[repoos] watchdog: failed to escalate #${task.id}: ${(err as Error).message}`);
      return;
    }
    if (current.needsInput || alreadySurfaced(current.body)) return;

    const reason =
      failureReason ??
      extractHandoffFailure(current.body) ??
      "handoff signal was not detected";

    const note = `watchdog: escalated to needs_input · ${reason} · next step: ${suggestNextStep(reason)}`;
    try {
      current.needsInput = true;
      recordChange(current, note);
      this.writeTask(current);
    } catch (err) {
      console.error(`[repoos] watchdog: failed to write escalation for #${task.id}: ${(err as Error).message}`);
    }
  }

  private readCurrent(task: Task): Task {
    return parseTask({
      content: readFileSync(task.absPath, "utf8"),
      absPath: task.absPath,
      root: this.config.root,
      defaultStatus: this.config.defaultStatus,
      defaultAssignee: this.config.defaultAssignee,
    });
  }

  private writeTask(task: Task): void {
    writeFileSync(task.absPath, serializeTask(task));
    // Surface the change to the live index so the board updates and the
    // existing status-change/needs-input notification subscribers fire.
    this.index.applyFileChange(task.absPath);
  }
}

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

/**
 * The timestamp of the most recent Activity entry after the `status →active`
 * transition. Falls back to the transition time itself when there is none.
 */
function lastActivityTime(body: string, afterTime: number): number {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return afterTime;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("-")) continue;
    const match = line.match(/^- (\d{4}-\d{2}-\d{2}T[^\s]+) · /);
    if (!match) continue;
    const t = Date.parse(match[1]);
    if (Number.isNaN(t)) continue;
    if (t > afterTime) return t;
    // Entries are append-only, so the first one at-or-before the transition
    // means nothing newer exists.
    return afterTime;
  }
  return afterTime;
}