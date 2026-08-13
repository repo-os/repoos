/**
 * Background watchdog for tasks stuck in `active` status with no running agent
 * (#0156). Detects stalled tasks, attempts one automatic resume, and escalates
 * to a human via the existing `needsInput` flag + notification.
 *
 * A task is considered stuck when:
 * - status === 'active'
 * - No agent process is running (`runner.isRunning(id)` === false) and no
 *   server-side handoff is finalizing
 * - Not already escalated (`needsInput` false)
 * - No activity since the most recent `status →active` transition (or no
 *   activity at all) for longer than the staleness threshold
 *
 * On detection the watchdog:
 * 1. Sends exactly one automatic resume/nudge message (the same path
 *    `POST /api/tasks/:id/message` uses), asking the agent to finish and emit
 *    the handoff signal or explain the blocker.
 * 2. If that resume also ends without a clean handoff, it stops retrying
 *    (bounded — never re-spawns the same agent forever) and sets
 *    `needsInput: true` on the task, which fires the existing
 *    `notifyNeedsInput` notification.
 * 3. The escalation Activity entry includes the captured failure reason and a
 *    best-effort suggested next step (a generic "stuck, needs a look" beats a
 *    wrong diagnosis).
 *
 * Retry attempts are persisted to the task's Activity log (`watchdog:
 * automatic resume attempted`) so the one-attempt bound survives server
 * reloads — the in-memory set is only a fast path, not the source of truth.
 */
import { writeFileSync, readFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import { resolveAgentForTask } from "./agents.js";
import { recordChange, parseTask, serializeTask } from "../core/task.js";
import { resumePreamble } from "../core/context-pack.js";
import { worktreePathForBranch } from "../core/git.js";

const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const WATCHDOG_INTERVAL_MS = 60 * 1000; // Check every 1 minute

/** How many automatic resume attempts before escalation (1–2 per spec). */
const MAX_RESUME_ATTEMPTS = 1;

/** Activity-log markers the watchdog writes/reads to bound its own retries. */
const RESUME_ACTIVITY = /watchdog: automatic resume attempted/;
const ESCALATED_ACTIVITY = /watchdog: escalated to needs_input/;
const HANDOFF_FAILURE_ACTIVITY = /handoff failed · (.+)$/m;

/** The nudge message sent on a task's one automatic resume attempt. */
export const WATCHDOG_NUDGE_MESSAGE =
  "I noticed your previous turn ended without emitting the handoff signal. " +
  "Please finish up and emit `::repoos-handoff-ready::` when ready, or explain what's blocking you.";

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

/** The most recent persisted handoff-failure reason in an Activity log, if any. */
function extractHandoffFailure(body: string): string | null {
  const match = body.match(HANDOFF_FAILURE_ACTIVITY);
  return match?.[1]?.trim() || null;
}

/** How many `watchdog: automatic resume attempted` entries are in the log. */
function resumeAttemptCount(body: string): number {
  return body.split("\n").filter((line) => RESUME_ACTIVITY.test(line)).length;
}

/** Whether the task's Activity log already shows a watchdog escalation. */
function alreadyEscalated(body: string): boolean {
  return ESCALATED_ACTIVITY.test(body);
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

export class TaskWatchdog {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private runner: AgentRunner;
  /** Fast-path retry bound; the Activity log is the cross-reload source of truth. */
  private retriedTasks = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stalenessThresholdMs: number;

  constructor(
    config: RepoOSConfig,
    index: LiveIndex,
    runner: AgentRunner,
    stalenessThresholdMs: number = DEFAULT_STALENESS_THRESHOLD_MS,
  ) {
    this.config = config;
    this.index = index;
    this.runner = runner;
    this.stalenessThresholdMs = stalenessThresholdMs;
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
    for (const task of this.index.getTasks("active")) {
      if (this.isStuck(task)) {
        await this.handleStuck(task);
      }
    }
  }

  private isStuck(task: Task): boolean {
    // A task the human is already flagged on is not stuck-but-unnoticed: don't
    // auto-nudge or re-escalate it.
    if (task.needsInput) return false;
    // An agent process is running, or a server-side handoff is finalizing.
    if (this.runner.isRunning(task.id)) return false;
    if (this.runner.isHandoffInFlight(task.id)) return false;
    return isStuckActiveTask(task.body, this.stalenessThresholdMs, Date.now());
  }

  private async handleStuck(task: Task): Promise<void> {
    const taskId = task.id;

    // The persisted Activity log is authoritative for how many resumes we've
    // already fired — it survives reloads. Escalate once the cap is reached.
    if (this.retriedTasks.has(taskId) || resumeAttemptCount(task.body) >= MAX_RESUME_ATTEMPTS) {
      this.escalateToNeedsInput(task);
      return;
    }

    const agent = resolveAgentForTask(this.config, task);
    if (!agent) {
      this.escalateToNeedsInput(task, "no enabled engineer agent is configured");
      return;
    }

    // Resume the task's own session in its existing worktree, reusing the exact
    // path POST /api/tasks/:id/message takes — including the resume preamble so
    // the agent sees its partial worktree changes without rediscovering them.
    let preamble: string | undefined;
    if (task.branch) {
      const wtPath = worktreePathForBranch(this.config.root, task.branch);
      if (wtPath) {
        preamble = resumePreamble(this.config, task, task.branch, wtPath) || undefined;
      }
    }

    const sendRes = this.runner.send(taskId, WATCHDOG_NUDGE_MESSAGE, agent, { resumePreamble: preamble });
    if (!sendRes.ok) {
      // A busy runner (e.g. a handoff still finalizing) is transient — don't
      // burn the retry or escalate; the next scan will re-evaluate.
      if (sendRes.busy) return;
      this.escalateToNeedsInput(task, `could not resume agent: ${sendRes.reason ?? "unknown error"}`);
      return;
    }

    // Persist the attempt (source of truth) and remember it in memory. The next
    // scan that finds the task stuck again — resume finished without a clean
    // handoff — escalates instead of re-spawning.
    this.retriedTasks.add(taskId);
    this.persistResumeAttempt(task);
  }

  /** Append a `watchdog: automatic resume attempted` Activity entry. */
  private persistResumeAttempt(task: Task): void {
    try {
      const current = this.readCurrent(task);
      if (RESUME_ACTIVITY.test(current.body)) return;
      recordChange(current, "watchdog: automatic resume attempted");
      this.writeTask(current);
    } catch (err) {
      console.error(`[repoos] watchdog: failed to record resume attempt for #${task.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Escalate a stuck task: set `needsInput: true` (which surfaces on the board
   * and fires the existing `notifyNeedsInput` notification) and append an
   * Activity entry with the failure reason and a suggested next step.
   */
  private escalateToNeedsInput(task: Task, failureReason?: string): void {
    let current: Task;
    try {
      current = this.readCurrent(task);
    } catch (err) {
      console.error(`[repoos] watchdog: failed to escalate #${task.id}: ${(err as Error).message}`);
      return;
    }
    if (current.needsInput || alreadyEscalated(current.body)) return;

    const reason =
      failureReason ??
      extractHandoffFailure(current.body) ??
      "handoff signal was not detected after the automatic resume";

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
    // existing needs-input notification subscriber fires.
    this.index.applyFileChange(task.absPath);
  }
}
