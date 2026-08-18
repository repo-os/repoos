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
import { writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import { parseTask, serializeTask, recordChange } from "../core/task.js";
import { commitTaskFile, worktreeStatus, worktreePathForBranch } from "../core/git.js";

const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const WATCHDOG_INTERVAL_MS = 60 * 1000; // Check every 1 minute

/** Activity-log marker the watchdog writes/reads to bound surfacing once. */
const SURFACED_ACTIVITY = /watchdog: auto-surfaced stuck task/;
const ESCALATED_ACTIVITY = /watchdog: escalated to needs_input/;
const HANDOFF_FAILURE_ACTIVITY = /handoff failed · (.+)$/m;
const HANDOFF_RETAINED = /handoff retained for recovery/;
const HANDOFF_RECOVERY_ATTEMPTED = /handoff recovery attempted/;

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
  if (/retained for recovery/.test(r)) {
    return "the handoff request was retained for recovery — it will be finalized automatically on the next server start";
  }
  if (/recovery attempted.*finalization failed/.test(r)) {
    return "handoff recovery was attempted but failed — open the task and resume the session manually to finish and hand off";
  }
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

/** Directories never worth scanning for agent activity: irrelevant or huge. */
const ACTIVITY_SCAN_SKIP = new Set([".git", "node_modules"]);
/** Bound on files inspected per scan — a stuck-check must never become slow. */
const ACTIVITY_SCAN_FILE_LIMIT = 2000;

/**
 * True when any file in `dir` was modified within `withinMs` of `now`.
 * Depth-first, bounded by `ACTIVITY_SCAN_FILE_LIMIT`, returns at the first
 * qualifying file found rather than walking the whole tree.
 */
function hasRecentMtime(dir: string, withinMs: number, now: number, budget: { left: number }): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (budget.left <= 0) return false;
    if (ACTIVITY_SCAN_SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (hasRecentMtime(full, withinMs, now, budget)) return true;
      continue;
    }
    if (!e.isFile()) continue;
    budget.left--;
    try {
      if (now - statSync(full).mtimeMs <= withinMs) return true;
    } catch {
      /* file vanished mid-scan — not evidence either way */
    }
  }
  return false;
}

/**
 * True when a task's worktree has a file modified within `stalenessMs` of
 * `now` — evidence of a genuinely live agent independent of the in-memory
 * runner registry.
 *
 * The registry (`AgentRunner.isRunning`) is a plain in-memory Map: it goes
 * empty on every server restart, with no record of which PID belonged to
 * which task (#0214). During this repo's own reload-churn-heavy sessions that
 * makes `isRunning()` report false for a still-working agent constantly, not
 * as a rare edge case — the exact false-positive #0203 was filed against
 * ("the agent was never dead: it kept running... and kept writing source
 * files"). The registry cannot be trusted alone; the worktree's own file
 * mtimes are a signal that survives a restart because they live on disk, not
 * in server memory.
 */
export function hasRecentWorktreeActivity(
  root: string,
  branch: string | undefined,
  stalenessMs: number,
  now: number,
): boolean {
  if (!branch) return false;
  const path = worktreePathForBranch(root, branch);
  if (!path) return false;
  return hasRecentMtime(path, stalenessMs, now, { left: ACTIVITY_SCAN_FILE_LIMIT });
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
    // Recovery was attempted but finalization failed — surface that outcome,
    // not the original "retained for recovery" which is now stale (#0235).
    if (HANDOFF_RECOVERY_ATTEMPTED.test(task.body)) {
      return {
        kind: "crashed",
        reason: "handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed",
      };
    }
    // A "retained for recovery" failure means the request was persisted and
    // will be re-fired on the next server boot — not truly crashed (#0235).
    if (HANDOFF_RETAINED.test(failed)) {
      return {
        kind: "crashed",
        reason: "agent turn was interrupted with a pending handoff — retained for recovery on next server start",
      };
    }
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
  if (task.hotfix) {
    try {
      const out = require("node:child_process").execFileSync("git", ["status", "--porcelain"], {
        cwd: config.root,
        encoding: "utf8",
        timeout: 4000,
      });
      return out.trim() ? "review" : "ready";
    } catch {
      return "ready";
    }
  }
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
    // A task whose handoff was retained for recovery (#0235) is not stuck —
    // the recovery is in progress or will fire on the next boot.  But only
    // when no recovery attempt has already been recorded: if recoverPending-
    // Handoffs fired and finalization failed, the Activity log will contain a
    // "handoff recovery attempted" entry and the watchdog must be free to
    // surface/escalate the task again.
    if (HANDOFF_RETAINED.test(task.body) && !HANDOFF_RECOVERY_ATTEMPTED.test(task.body)) return false;
    const now = Date.now();
    if (!isStuckActiveTask(task.body, this.stalenessThresholdMs, now)) return false;
    // The Activity log looks stale, but `isRunning()` above only reflects the
    // in-memory registry, which is empty after every server restart with no
    // memory of which PID belonged to this task (#0214). Before surfacing,
    // check the worktree's own file mtimes — durable, on-disk evidence a
    // registry reset can't erase. Skips the scan entirely once the log
    // already proves recent activity, so the common case pays nothing extra.
    if (hasRecentWorktreeActivity(this.config.root, task.branch, this.stalenessThresholdMs, now)) {
      return false;
    }
    return true;
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