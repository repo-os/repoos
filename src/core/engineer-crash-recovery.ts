/**
 * Bounded engineer crash recovery (#0869).
 *
 * A crash is not a handoff. When an engineer turn exits with an error, RepoOS
 * keeps the task `active` and resumes the engineer; only after a threshold of
 * crashes (or usage/auth failures) for the SAME agent+model inside a window
 * does it switch to the next unpaused budget-allowlist pair. The destination is
 * an explicit, recorded choice for this task — not an unbounded fallback chain
 * — and a human-set override is never replaced: when one is pinned the crash
 * is surfaced to the human instead.
 *
 * This module is pure and Node-free so the planning rules are table-testable:
 * `src/server/engineer-crash-recovery.ts` applies the plan (writes the task,
 * starts the engineer) and the runner only reports the crash.
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
  const overridesMatchMarker =
    !!auto && (override.cli ?? "") === auto.cli && (override.model ?? "") === auto.model;
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
  const crashes = countEngineerCrashes(input.crashes, input.pair, nowIso, windowMs);
  if (crashes < threshold) {
    return { action: "resume", pair: input.pair, crashes, threshold, windowMs };
  }
  const block = failoverBlock(input.task, input.pair);
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
