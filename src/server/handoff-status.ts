/**
 * Durable, read-only view of the most recent handoff attempt for a task.
 *
 * The finalization itself already streams progress to the transcript and the
 * task log, but an engineer that requested handoff and ended its turn has no
 * way to ask "did it pass?" without running the blocking `repoos review`
 * (a call of up to 25 minutes that races the server-owned handoff, #1028).
 * This store answers that question immediately, and is also the record the
 * outcome message is deduplicated against so a retry or resume of the same
 * attempt never queues a second message.
 *
 * It lives under `<cacheDir>/handoff-status/` — gitignored bookkeeping, never
 * part of the task file, so writing it can never dirty main or a task branch.
 * All writes are best-effort: a status write must never fail a handoff.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Agent, RepoOSConfig } from "../core/types.js";
import type { AgentRunner } from "./agents.js";

export type HandoffStatusState = "not_requested" | "running" | "passed" | "failed" | "deferred";

export interface HandoffStatus {
  taskId: string;
  state: HandoffStatusState;
  /** Finalization step the attempt reached (validate/check/…), or the step a deferral stopped at. */
  step: string | null;
  /** Human-readable failure/deferral reason, already truncated for display. */
  reason: string | null;
  /** How the attempt was started (agent signal, UI review, API, …). */
  origin: string | null;
  /** Monotonic attempt number for this task, for diagnostics. */
  attempt: number;
  /** Identity of the attempt; outcome messaging is deduplicated on this. */
  attemptKey: string | null;
  /** True once the outcome message was queued for this attempt. */
  outcomeQueued: boolean;
  /** ISO timestamp of the last state change, or null when never requested. */
  updatedAt: string | null;
}

/** Maximum characters of a failure reason surfaced in a status read or message. */
export const HANDOFF_STATUS_REASON_LIMIT = 500;

const OUTCOME_STATES: ReadonlySet<HandoffStatusState> = new Set(["passed", "failed", "deferred"]);

export function emptyHandoffStatus(taskId: string): HandoffStatus {
  return {
    taskId,
    state: "not_requested",
    step: null,
    reason: null,
    origin: null,
    attempt: 0,
    attemptKey: null,
    outcomeQueued: false,
    updatedAt: null,
  };
}

function statusDir(config: RepoOSConfig): string {
  return join(config.root, config.cacheDir ?? ".repoos", "handoff-status");
}

function safeTaskId(taskId: string): string {
  return taskId.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function handoffStatusPath(config: RepoOSConfig, taskId: string): string {
  return join(statusDir(config), `${safeTaskId(taskId)}.json`);
}

/** Collapse whitespace and cap the reason so status reads and messages stay readable. */
export function truncateHandoffReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const flat = reason.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > HANDOFF_STATUS_REASON_LIMIT
    ? `${flat.slice(0, HANDOFF_STATUS_REASON_LIMIT)}… (truncated)`
    : flat;
}

export function readHandoffStatus(config: RepoOSConfig, taskId: string): HandoffStatus {
  const path = handoffStatusPath(config, taskId);
  if (!existsSync(path)) return emptyHandoffStatus(taskId);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<HandoffStatus>;
    const state: HandoffStatusState =
      parsed.state === "running" ||
      parsed.state === "passed" ||
      parsed.state === "failed" ||
      parsed.state === "deferred"
        ? parsed.state
        : "not_requested";
    return {
      taskId,
      state,
      step: typeof parsed.step === "string" ? parsed.step : null,
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
      origin: typeof parsed.origin === "string" ? parsed.origin : null,
      attempt: typeof parsed.attempt === "number" ? parsed.attempt : 0,
      attemptKey: typeof parsed.attemptKey === "string" ? parsed.attemptKey : null,
      outcomeQueued: parsed.outcomeQueued === true,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    // A corrupt status file must never break the handoff path.
    return emptyHandoffStatus(taskId);
  }
}

function writeHandoffStatus(config: RepoOSConfig, status: HandoffStatus): void {
  try {
    const path = handoffStatusPath(config, status.taskId);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(status, null, 2)}\n`);
    renameSync(tmp, path);
  } catch {
    // Best-effort only: the handoff is the important operation.
  }
}

/**
 * Mark a new attempt as running. Repeating the SAME attempt key (a resumed
 * server replaying the same request, or a caller that finalizes twice) keeps
 * the existing record so its outcome/message dedupe survives.
 */
export function beginHandoffStatus(
  config: RepoOSConfig,
  taskId: string,
  opts: { attemptKey: string; origin?: string | null; step?: string },
): HandoffStatus {
  const existing = readHandoffStatus(config, taskId);
  if (
    opts.attemptKey &&
    existing.attemptKey === opts.attemptKey &&
    existing.state !== "not_requested"
  ) {
    return existing;
  }
  const next: HandoffStatus = {
    taskId,
    state: "running",
    step: opts.step ?? "validate",
    reason: null,
    origin: opts.origin ?? existing.origin,
    attempt: existing.attempt + 1,
    attemptKey: opts.attemptKey,
    outcomeQueued: false,
    updatedAt: new Date().toISOString(),
  };
  writeHandoffStatus(config, next);
  return next;
}

/** Advance the current step while the attempt is still running. Never resurrects a finished attempt. */
export function updateHandoffStatusStep(
  config: RepoOSConfig,
  taskId: string,
  attemptKey: string,
  step: string,
): void {
  const current = readHandoffStatus(config, taskId);
  if (current.state !== "running" || current.attemptKey !== attemptKey) return;
  writeHandoffStatus(config, { ...current, step, updatedAt: new Date().toISOString() });
}

/** Record the terminal pass/fail result of an attempt. */
export function finishHandoffStatus(
  config: RepoOSConfig,
  taskId: string,
  attemptKey: string,
  result: { ok: boolean; step: string; detail?: string },
): HandoffStatus {
  const current = readHandoffStatus(config, taskId);
  // A finished attempt whose identity moved on (a newer request began) must not
  // be overwritten by this one's late result.
  if (current.attemptKey && current.attemptKey !== attemptKey) return current;
  const next: HandoffStatus = {
    ...current,
    taskId,
    state: result.ok ? "passed" : "failed",
    step: result.step,
    reason: result.ok ? null : truncateHandoffReason(result.detail),
    attemptKey,
    updatedAt: new Date().toISOString(),
  };
  writeHandoffStatus(config, next);
  return next;
}

/** Record that a requested handoff was deferred (queued messages must be read first). */
export function deferHandoffStatus(
  config: RepoOSConfig,
  taskId: string,
  attemptKey: string,
  reason: string,
): HandoffStatus {
  const existing = readHandoffStatus(config, taskId);
  if (existing.attemptKey === attemptKey && existing.state === "deferred") return existing;
  const next: HandoffStatus = {
    taskId,
    state: "deferred",
    step: "review",
    reason: truncateHandoffReason(reason),
    origin: existing.origin,
    attempt: existing.attemptKey === attemptKey ? existing.attempt : existing.attempt + 1,
    attemptKey,
    outcomeQueued: false,
    updatedAt: new Date().toISOString(),
  };
  writeHandoffStatus(config, next);
  return next;
}

/** Mark the outcome message as queued, so retries/resumes do not queue it again. */
export function markHandoffOutcomeQueued(
  config: RepoOSConfig,
  taskId: string,
  attemptKey: string,
): HandoffStatus {
  const current = readHandoffStatus(config, taskId);
  if (current.attemptKey !== attemptKey) return current;
  const next = { ...current, outcomeQueued: true };
  writeHandoffStatus(config, next);
  return next;
}

/** The one message an engineer receives on its next turn after a handoff attempt. */
export function formatHandoffOutcomeMessage(status: HandoffStatus): string | null {
  if (!OUTCOME_STATES.has(status.state)) return null;
  if (status.state === "passed") {
    return [
      `handoff passed — task #${status.taskId} is now in review.`,
      "Nothing further is needed from you.",
    ].join(" ");
  }
  if (status.state === "deferred") {
    return [
      `handoff deferred for task #${status.taskId}: ${status.reason ?? "the handoff could not start yet"}.`,
      "Read the queued message(s) first, then request handoff again",
      `(\`repoos mv ${status.taskId} review\` or \`::repoos-handoff-ready::\`).`,
    ].join(" ");
  }
  return [
    `handoff failed at step ${status.step ?? "unknown"}: ${status.reason ?? "unknown error"}.`,
    "Fix the failure, run `repoos check`, then request handoff again",
    `(\`repoos mv ${status.taskId} review\` or \`::repoos-handoff-ready::\`).`,
  ].join(" ");
}

/**
 * Queue the outcome message exactly once per attempt. Uses the existing
 * queued-message delivery, so it never starts a turn of its own: the message is
 * prepended to the engineer's next turn. Returns true when a message was
 * queued by this call.
 */
export function deliverHandoffOutcome(
  config: RepoOSConfig,
  taskId: string,
  status: HandoffStatus,
  runner: Pick<AgentRunner, "queueTaskMessage">,
  agent: Agent | null,
): boolean {
  if (!agent) return false;
  if (!OUTCOME_STATES.has(status.state)) return false;
  if (status.outcomeQueued) return false;
  const text = formatHandoffOutcomeMessage(status);
  if (!text) return false;
  const result = runner.queueTaskMessage(taskId, text, agent);
  if (!result.ok) return false;
  markHandoffOutcomeQueued(config, taskId, status.attemptKey ?? "");
  return true;
}
