/**
 * Bounded engineer recovery policy (#0869, #0888).
 *
 * Two shapes share this module so they cannot drift into parallel mechanisms:
 *
 * - Crash recovery (#0869). A crash is not a handoff. When an engineer turn
 *   exits with an error, RepoOS keeps the task `active` and resumes the
 *   engineer; only after a threshold of crashes (or usage/auth failures) for
 *   the SAME agent+model inside a window does it switch to the next unpaused
 *   budget-allowlist pair. A human-set override is never replaced: when one is
 *   pinned the crash is surfaced to the human instead.
 * - Stalled clean exit (#0888). A turn that ends cleanly without ever
 *   requesting a handoff leaves the task silently `active`. The watchdog
 *   resumes it with the normal resume preamble, bounded by a per-task resume
 *   window; at the cap it surfaces `needs_input` instead of looping.
 *
 * This module is pure and Node-free so the planning rules are table-testable:
 * `src/server/engineer-crash-recovery.ts` applies the plan (writes the task,
 * starts the engineer) and the runner only reports the turn's outcome.
 *
 * Fits ADR 0008 (centralized agent recovery): a destination is treated as a
 * deliberate selection for this task, failures are classified, and a paid
 * cross-CLI retry is bounded rather than a generic global fallback.
 */
import type { AgentModelAllowRow, Task } from "./types.js";
import { availableAllowPairs } from "./budget-allowlist.js";

/** Crashes for one agent+model before an automatic failover. */
export const DEFAULT_ENGINEER_CRASH_FAILOVER_THRESHOLD = 3;

/** Window those crashes are counted in (30 minutes). */
export const DEFAULT_ENGINEER_CRASH_FAILOVER_WINDOW_MS = 30 * 60 * 1000;

/** Extra key holding the bounded crash history (JSON string). */
export const ENGINEER_CRASH_LOG_KEY = "engineer_crash_log";

/** Extra key marking a CLI/model pair RepoOS switched to automatically. */
export const ENGINEER_FAILOVER_KEY = "engineer_failover";

/** Never let a runaway task grow the frontmatter without bound. */
const MAX_CRASH_RECORDS = 50;

/** The smallest meaningful window a caller may configure. */
export const MIN_ENGINEER_CRASH_FAILOVER_WINDOW_MS = 60_000;

export interface EngineerPair {
  cli: string;
  model: string;
}

/** One crash attributed to an agent+model pair. */
export interface EngineerCrashRecord extends EngineerPair {
  /** ISO timestamp of the failed turn's end. */
  at: string;
  /** `dev-error`, `provider-failure`, or `degenerate-output`. */
  kind: string;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseIso(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/** Parse the persisted crash log, dropping malformed rows (fail-soft). */
export function parseEngineerCrashLog(value: unknown): EngineerCrashRecord[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: EngineerCrashRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const cli = nonEmpty(row.cli);
    const model = nonEmpty(row.model);
    const at = nonEmpty(row.at);
    if (!cli || !model || !at || parseIso(at) === null) continue;
    out.push({
      cli,
      model,
      at,
      kind: nonEmpty(row.kind) ?? "dev-error",
    });
  }
  return out.slice(-MAX_CRASH_RECORDS);
}

/** Serialize the crash log for the task frontmatter. */
export function serializeEngineerCrashLog(records: readonly EngineerCrashRecord[]): string {
  return JSON.stringify(records.slice(-MAX_CRASH_RECORDS));
}

/**
 * Append one crash and prune records older than the window. Pruning at write
 * time keeps the frontmatter bounded even across long-lived tasks.
 */
export function recordEngineerCrash(
  records: readonly EngineerCrashRecord[],
  pair: EngineerPair,
  kind: string,
  atIso: string,
  windowMs: number,
): EngineerCrashRecord[] {
  const at = parseIso(atIso) ?? Date.now();
  const window = Number.isFinite(windowMs) ? Math.max(0, windowMs) : 0;
  const cutoff = at - window;
  const kept = records.filter((record) => (parseIso(record.at) ?? 0) >= cutoff);
  kept.push({ cli: pair.cli, model: pair.model, at: new Date(at).toISOString(), kind });
  return kept.slice(-MAX_CRASH_RECORDS);
}

/** Crashes for `pair` inside the window ending at `nowIso`. */
export function countEngineerCrashes(
  records: readonly EngineerCrashRecord[],
  pair: EngineerPair,
  nowIso: string,
  windowMs: number,
): number {
  const now = parseIso(nowIso) ?? Date.now();
  const window = Number.isFinite(windowMs) ? Math.max(0, windowMs) : 0;
  const cutoff = now - window;
  return records.filter(
    (record) =>
      record.cli === pair.cli &&
      record.model === pair.model &&
      (parseIso(record.at) ?? 0) >= cutoff,
  ).length;
}

/** Marker written when RepoOS (not a human) chose the current pair. */
export function failoverMarker(pair: EngineerPair): string {
  return JSON.stringify({ cli: pair.cli, model: pair.model });
}

/** Parse an automatic-failover marker, or null when absent/malformed. */
export function parseFailoverMarker(value: unknown): EngineerPair | null {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const cli = nonEmpty(row.cli);
  const model = nonEmpty(row.model);
  return cli && model ? { cli, model } : null;
}

export interface FailoverBlock {
  kind: "human-override" | "already-failed-over";
  detail: string;
}

function taskOverridePair(task: Pick<Task, "agentOverride" | "cliOverride" | "modelOverride">): {
  agent?: string;
  cli?: string;
  model?: string;
} {
  return {
    agent: nonEmpty(task.agentOverride),
    cli: nonEmpty(task.cliOverride),
    model: nonEmpty(task.modelOverride) === "default" ? undefined : nonEmpty(task.modelOverride),
  };
}

/**
 * Why an automatic failover must NOT run, or null when it may.
 *
 * A human-set override (agent name, CLI, or a real model pin) always wins. An
 * automatic failover already applied for this same pair also blocks a second
 * switch, so one crash-prone destination cannot chain the task through every
 * allowlist row (ADR 0008).
 */
export function failoverBlock(
  task: Pick<Task, "agentOverride" | "cliOverride" | "modelOverride" | "extra">,
  pair: EngineerPair,
): FailoverBlock | null {
  const override = taskOverridePair(task);
  if (override.agent) {
    return { kind: "human-override", detail: `agent override "${override.agent}"` };
  }
  const auto = parseFailoverMarker(task.extra?.[ENGINEER_FAILOVER_KEY]);
  const markerMatchesPair = !!auto && auto.cli === pair.cli && auto.model === pair.model;
  // Compare the persisted marker to the raw model pin: a `default` destination
  // is a valid automatic choice, and normalizing it away for override
  // detection would misreport RepoOS's own switch as a human override.
  const rawModel = nonEmpty(task.modelOverride);
  const overridesMatchMarker =
    !!auto && (override.cli ?? "") === auto.cli && (rawModel ?? "") === auto.model;
  if (markerMatchesPair && overridesMatchMarker) {
    return { kind: "already-failed-over", detail: `${pair.cli} + ${pair.model}` };
  }
  if (override.cli || override.model) {
    return { kind: "human-override", detail: `${pair.cli} + ${pair.model}` };
  }
  return null;
}

/**
 * The next selectable allowlist pair after `current`: on the allowlist, not
 * paused, and not the same pair that is failing. An empty allowlist, or a list
 * whose only selectable entry is the current pair, yields null (surface, never
 * retry the same broken pair).
 */
export function nextFailoverPair(
  allowlist: readonly AgentModelAllowRow[],
  current: EngineerPair,
  now: number = Date.now(),
): EngineerPair | null {
  const rows = [...allowlist];
  const pairs = availableAllowPairs(rows, now);
  return pairs.find((pair) => pair.cli !== current.cli || pair.model !== current.model) ?? null;
}

export type EngineerCrashPlan =
  | { action: "handoff" }
  | {
      action: "resume";
      pair: EngineerPair;
      crashes: number;
      threshold: number;
      windowMs: number;
    }
  | {
      action: "failover";
      from: EngineerPair;
      to: EngineerPair;
      crashes: number;
      threshold: number;
      windowMs: number;
    }
  | {
      action: "surface";
      reason: FailoverBlock["kind"] | "no-allowed-pair";
      detail: string;
      crashes: number;
      threshold: number;
      windowMs: number;
    };

export interface EngineerCrashPlanInput {
  task: Pick<Task, "agentOverride" | "cliOverride" | "modelOverride" | "extra">;
  /** The agent+model whose turn crashed. */
  pair: EngineerPair;
  /** Full persisted crash log, including this crash (see recordEngineerCrash). */
  crashes: readonly EngineerCrashRecord[];
  threshold: number;
  windowMs: number;
  /** Epoch milliseconds "now". */
  now: number;
  allowlist: readonly AgentModelAllowRow[];
  /** The engineer's own handoff request won the turn; never recover over it. */
  handoffRequested?: boolean;
}

/**
 * Decide what a crash should do. Below the threshold: resume the same pair.
 * At/above it: switch to the next selectable allowlist pair, or surface when a
 * human override / a previous automatic switch / an empty allowlist means a
 * silent replacement would be wrong.
 */
export function planEngineerCrashRecovery(input: EngineerCrashPlanInput): EngineerCrashPlan {
  if (input.handoffRequested) return { action: "handoff" };
  const threshold = Number.isFinite(input.threshold) ? Math.max(1, input.threshold) : 1;
  const windowMs = Number.isFinite(input.windowMs)
    ? Math.max(MIN_ENGINEER_CRASH_FAILOVER_WINDOW_MS, input.windowMs)
    : DEFAULT_ENGINEER_CRASH_FAILOVER_WINDOW_MS;
  const nowIso = new Date(input.now).toISOString();
  const quotaExhausted = input.crashes.some(
    (crash) =>
      crash.cli === input.pair.cli &&
      crash.model === input.pair.model &&
      crash.kind === "usage-limit",
  );
  const crashes = countEngineerCrashes(input.crashes, input.pair, nowIso, windowMs);
  if (!quotaExhausted && crashes < threshold) {
    return { action: "resume", pair: input.pair, crashes, threshold, windowMs };
  }
  // A provider quota is an explicit temporary outage: honor ordinary human
  // pins in every other case, but let the task move off the exhausted pair.
  const block = quotaExhausted ? null : failoverBlock(input.task, input.pair);
  if (block) {
    return {
      action: "surface",
      reason: block.kind,
      detail: block.detail,
      crashes,
      threshold,
      windowMs,
    };
  }
  const to = nextFailoverPair(input.allowlist, input.pair, input.now);
  if (!to) {
    return {
      action: "surface",
      reason: "no-allowed-pair",
      detail: "no unpaused budget-allowlist pair other than the failing one is available",
      crashes,
      threshold,
      windowMs,
    };
  }
  return {
    action: "failover",
    from: input.pair,
    to,
    crashes,
    threshold,
    windowMs,
  };
}

// ---------------------------------------------------------------------------
// Stalled clean exit (#0888)
// ---------------------------------------------------------------------------

/**
 * Automatic resumes for one task inside the resume window before the watchdog
 * surfaces it for a human. Three is enough for a genuinely finished turn that
 * missed its signal line, and small enough that a confused engineer cannot
 * burn wall-clock overnight.
 */
export const DEFAULT_ENGINEER_STALL_RESUME_LIMIT = 3;

/** Window the clean-exit resume count is measured in (30 minutes). */
export const DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS = 30 * 60 * 1000;

/** Never let a runaway task grow the frontmatter without bound. */
const MAX_STALL_RESUME_RECORDS = 50;

/** Extra key holding the bounded clean-exit resume history (JSON string). */
export const ENGINEER_STALL_RESUME_LOG_KEY = "engineer_stall_resume_log";

/** One automatic resume of a cleanly-ended turn. */
export interface EngineerStallResumeRecord {
  /** ISO timestamp of the resume. */
  at: string;
  /** Why the watchdog resumed: a clean exit or a deferred handoff. */
  reason: "clean-exit-without-handoff" | "handoff-deferred";
}

/** Parse the persisted resume log, dropping malformed rows (fail-soft). */
export function parseEngineerStallResumeLog(value: unknown): EngineerStallResumeRecord[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: EngineerStallResumeRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const at = nonEmpty(row.at);
    if (!at || parseIso(at) === null) continue;
    out.push({
      at,
      reason: row.reason === "handoff-deferred" ? "handoff-deferred" : "clean-exit-without-handoff",
    });
  }
  return out.slice(-MAX_STALL_RESUME_RECORDS);
}

/** Serialize the resume log for the task frontmatter. */
export function serializeEngineerStallResumeLog(
  records: readonly EngineerStallResumeRecord[],
): string {
  return JSON.stringify(records.slice(-MAX_STALL_RESUME_RECORDS));
}

/**
 * Append one resume and prune records older than the window. Pruning at write
 * time keeps the frontmatter bounded even across long-lived tasks.
 */
export function recordEngineerStallResume(
  records: readonly EngineerStallResumeRecord[],
  atIso: string,
  reason: EngineerStallResumeRecord["reason"],
  windowMs: number,
): EngineerStallResumeRecord[] {
  const at = parseIso(atIso) ?? Date.now();
  const window = Number.isFinite(windowMs) ? Math.max(0, windowMs) : 0;
  const cutoff = at - window;
  const kept = records.filter((record) => (parseIso(record.at) ?? 0) >= cutoff);
  kept.push({ at: new Date(at).toISOString(), reason });
  return kept.slice(-MAX_STALL_RESUME_RECORDS);
}

/** Resumes inside the window ending at `nowIso`. */
export function countEngineerStallResumes(
  records: readonly EngineerStallResumeRecord[],
  nowIso: string,
  windowMs: number,
): number {
  const now = parseIso(nowIso) ?? Date.now();
  const window = Number.isFinite(windowMs) ? Math.max(0, windowMs) : 0;
  const cutoff = now - window;
  return records.filter((record) => (parseIso(record.at) ?? 0) >= cutoff).length;
}

/**
 * Activity-log phrase the runner writes the moment a clean engineer turn ends
 * without a handoff. The watchdog scopes it to the current `→active` episode.
 */
export const ENGINEER_CLEAN_EXIT_ACTIVITY = "engineer turn ended without a handoff";

/**
 * Activity-log phrase the runner writes when a person (or the server acting on
 * a person's request) deliberately stops a live turn. A stop is never a stall
 * to resume: the human wanted it to end, so the watchdog must leave it alone.
 */
export const ENGINEER_STOPPED_ACTIVITY = "engineer stopped by request";

/** Activity-log phrase the runner writes when it had to defer a handoff. */
export const HANDOFF_DEFERRED_ACTIVITY_RE = /handoff_deferred:\s*(\d+)\s+queued message/;

/** A persisted crash/interrupted-turn line for the same episode. */
const CRASHED_ACTIVITY_RE = /(?:handoff failed · |agent exited with an error\b)/;

/** The most recent `status …→active` transition line in an Activity log. */
const ACTIVE_TRANSITION_RE = /^- (\d{4}-\d{2}-\d{2}T\S+) · status [a-z_]+→active\b/;

export interface EngineerCleanExitSignal {
  /** True when the last turn in this active episode ended cleanly without a handoff. */
  clean: boolean;
  /** How many queued messages a deferred handoff was waiting for (0 when none). */
  deferred: number;
  /** True when the last turn in this episode was deliberately stopped by a person. */
  stoppedByPerson: boolean;
}

/**
 * Read the durable clean-exit signal from a task's Activity log.
 *
 * Only the most recent relevant event in the current `→active` episode counts:
 * the runner records `engineer turn ended without a handoff` on a clean turn
 * that never requested review (including one whose handoff was deferred by a
 * queued message), `agent exited with an error`/`handoff failed` on a crash,
 * and `engineer stopped by request` when a person ended the turn. The last one
 * wins, so a later clean exit after a crash is resumable again and a stop after
 * a clean exit is never resumed. Scoping to the most recent `→active`
 * transition keeps a resolved earlier episode from masking a fresh stall.
 */
export function readEngineerCleanExitSignal(body: string): EngineerCleanExitSignal {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return { clean: false, deferred: 0, stoppedByPerson: false };

  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i];
    if (ACTIVE_TRANSITION_RE.test(line)) break;
    if (line.includes(ENGINEER_STOPPED_ACTIVITY)) {
      return { clean: false, deferred: 0, stoppedByPerson: true };
    }
    if (CRASHED_ACTIVITY_RE.test(line)) {
      return { clean: false, deferred: 0, stoppedByPerson: false };
    }
    const deferredMatch = line.match(HANDOFF_DEFERRED_ACTIVITY_RE);
    if (deferredMatch) {
      // A deferred handoff is written at the end of a clean turn, so it is
      // itself proof the turn ended cleanly (and tells us what to read).
      return {
        clean: true,
        deferred: Number(deferredMatch[1]) || 1,
        stoppedByPerson: false,
      };
    }
    if (line.includes(ENGINEER_CLEAN_EXIT_ACTIVITY)) {
      return { clean: true, deferred: 0, stoppedByPerson: false };
    }
  }
  return { clean: false, deferred: 0, stoppedByPerson: false };
}

export type EngineerTurnExitKind = "clean" | "crash" | "unknown";

export type EngineerStallPlan =
  | {
      action: "resume";
      reason: EngineerStallResumeRecord["reason"];
      queuedMessages: number;
      resumes: number;
      limit: number;
      windowMs: number;
    }
  | {
      action: "surface";
      reason: "resume-limit";
      resumes: number;
      limit: number;
      windowMs: number;
    }
  | { action: "skip"; reason: string };

export interface EngineerStallPlanInput {
  status: string;
  isArchived?: boolean;
  needsInput?: boolean;
  /** The task is assigned to a human — never resume an AI turn for it. */
  assignedToHuman?: boolean;
  /** A person explicitly paused the task (`runner.isPaused`). */
  paused?: boolean;
  /** A person or the server deliberately stopped the turn. */
  stoppedByPerson?: boolean;
  /** A turn (or a queued spawn) is live. */
  running?: boolean;
  handoffInFlight?: boolean;
  pendingHandoff?: boolean;
  /** Move to done is running for this task. */
  closingOut?: boolean;
  /** The turn asked for its own handoff; the handoff owns the next step. */
  handoffRequested?: boolean;
  /** How the last engineer turn ended. Only a clean exit is ours to resume. */
  exitKind: EngineerTurnExitKind;
  /** The last handoff was deferred because a queued message had to be read. */
  handoffDeferred?: boolean;
  /** Queued messages the deferred handoff was waiting for. */
  queuedMessages?: number;
  /** A handoff completed since the branch's last commit — the work is done. */
  handoffSinceLastCommit?: boolean;
  resumes: readonly EngineerStallResumeRecord[];
  now: number;
  limit?: number;
  windowMs?: number;
}

/**
 * Decide whether a silently-ended `active` task should be resumed.
 *
 * Fail-closed on every human/ownership signal, and only for a clean exit:
 * a crashed turn belongs to `planEngineerCrashRecovery`. Below the resume cap
 * the same engineer is resumed with the normal resume preamble; at the cap the
 * watchdog surfaces `needs_input` instead of nudging forever.
 */
export function planEngineerStallResume(input: EngineerStallPlanInput): EngineerStallPlan {
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.floor(input.limit as number))
    : DEFAULT_ENGINEER_STALL_RESUME_LIMIT;
  const windowMs = Number.isFinite(input.windowMs)
    ? Math.max(MIN_ENGINEER_CRASH_FAILOVER_WINDOW_MS, input.windowMs as number)
    : DEFAULT_ENGINEER_STALL_RESUME_WINDOW_MS;

  if (input.status !== "active") return { action: "skip", reason: "task is not active" };
  if (input.isArchived) return { action: "skip", reason: "task is archived" };
  if (input.needsInput)
    return { action: "skip", reason: "the task is already flagged for a human" };
  if (input.assignedToHuman) return { action: "skip", reason: "the task is assigned to a human" };
  if (input.paused) return { action: "skip", reason: "the engineer is paused" };
  if (input.stoppedByPerson) return { action: "skip", reason: "a person stopped the engineer" };
  if (input.running) return { action: "skip", reason: "a turn is already running" };
  if (input.handoffInFlight || input.pendingHandoff) {
    return { action: "skip", reason: "a handoff already owns the task" };
  }
  if (input.closingOut) return { action: "skip", reason: "the task is being closed out" };
  if (input.handoffRequested)
    return { action: "skip", reason: "the engineer requested its own handoff" };
  if (input.exitKind !== "clean") {
    return {
      action: "skip",
      reason:
        input.exitKind === "crash"
          ? "the last turn crashed — crash recovery owns it"
          : "no clean-exit signal for the current turn",
    };
  }
  if (input.handoffSinceLastCommit) {
    return { action: "skip", reason: "the work was handed off since the last commit" };
  }

  const nowIso = new Date(input.now).toISOString();
  const resumes = countEngineerStallResumes(input.resumes, nowIso, windowMs);
  if (resumes >= limit) {
    return { action: "surface", reason: "resume-limit", resumes, limit, windowMs };
  }
  return {
    action: "resume",
    reason: input.handoffDeferred ? "handoff-deferred" : "clean-exit-without-handoff",
    queuedMessages: Math.max(0, input.queuedMessages ?? 0),
    resumes,
    limit,
    windowMs,
  };
}
