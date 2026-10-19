/**
 * Agent-driver budget controls (#0764) and allowlist pausing (#0850).
 *
 * A human-approved allowlist of coding-agent + model pairs that an *agent
 * driver* (a CLI/API caller operating RepoOS) may set as an engineer/reviewer
 * override. A human in the UI keeps the full list; an agent driver is steered
 * to this subset.
 *
 * Empty or unset means **nothing is restricted** — agent drivers behave exactly
 * as before. This module is pure and node-free so the server (config parse +
 * enforcement), the CLI (discovery) and the browser (the Budget Controls tab)
 * share one contract.
 *
 * #0850 adds pausing. A row can pause every model (`paused`) or one model
 * (`pausedModels`), optionally with `pausedUntil` (auto-resume) and
 * `pausedReason`. Paused entries stay on the allowlist but are never selected.
 * Evaluation is time-based, so an expired `pausedUntil` resumes with no restart
 * or rewrite.
 */
import type { AgentModelAllowRow, AgentModelPause } from "./types.js";

/** The configured allowlist rows, normalizing malformed input to `[]`. */
export function agentModelAllowRows(input: unknown): AgentModelAllowRow[] {
  const result = normalizeAllowlistRows(input);
  return "rows" in result ? result.rows : [];
}

export type NormalizedAllowlist = { rows: AgentModelAllowRow[] } | { error: string };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Validate an ISO-ish resume timestamp; invalid values are dropped (§fail-soft). */
function pauseUntil(value: unknown): string | undefined {
  const raw = nonEmptyString(value);
  if (!raw) return undefined;
  return Number.isFinite(Date.parse(raw)) ? raw : undefined;
}

/**
 * Normalize a `pausedModels` entry. Accepts a bare model string (the compact
 * config form) or a `{ model, pausedUntil, pausedReason }` object (the form
 * that can carry a per-model resume date and reason).
 */
function normalizePausedModel(entry: unknown): AgentModelPause | null {
  if (typeof entry === "string") {
    const model = entry.trim();
    return model ? { model } : null;
  }
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const row = entry as { model?: unknown; pausedUntil?: unknown; pausedReason?: unknown };
  const model = nonEmptyString(row.model);
  if (!model) return null;
  const pause: AgentModelPause = { model };
  const until = pauseUntil(row.pausedUntil);
  if (until) pause.pausedUntil = until;
  const reason = nonEmptyString(row.pausedReason);
  if (reason) pause.pausedReason = reason;
  return pause;
}

function mergePausedModels(
  existing: AgentModelPause[] | undefined,
  incoming: AgentModelPause[] | undefined,
): AgentModelPause[] | undefined {
  if (!incoming?.length) return existing;
  const byModel = new Map<string, AgentModelPause>();
  for (const pause of existing ?? []) byModel.set(pause.model, pause);
  for (const pause of incoming) {
    const prior = byModel.get(pause.model);
    byModel.set(pause.model, {
      model: pause.model,
      ...(prior?.pausedUntil || pause.pausedUntil
        ? { pausedUntil: prior?.pausedUntil ?? pause.pausedUntil }
        : {}),
      ...(prior?.pausedReason || pause.pausedReason
        ? { pausedReason: prior?.pausedReason ?? pause.pausedReason }
        : {}),
    });
  }
  const merged = [...byModel.values()];
  return merged.length ? merged : undefined;
}

/**
 * Validate and normalize a submitted allowlist.
 *
 * Accepts an array of `{ cli, models, paused?, pausedUntil?, pausedReason?,
 * pausedModels? }` rows. Duplicate `cli` rows are merged (models unioned,
 * order preserved, pause flags combined) so the same agent can never appear
 * twice in the control. Unknown keys are ignored. Returns a human-readable
 * `error` on a malformed shape — the server/config route turns that into a
 * 400, and `loadConfig` drops the row instead of poisoning the whole file.
 */
export function normalizeAllowlistRows(input: unknown): NormalizedAllowlist {
  if (input === undefined || input === null) return { rows: [] };
  if (!Array.isArray(input)) {
    return { error: "allowlist must be an array of { cli, models } entries" };
  }
  type Accumulated = AgentModelAllowRow;
  const byCli = new Map<string, Accumulated>();
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { error: "each allowlist entry must be an object with cli and models" };
    }
    const row = entry as {
      cli?: unknown;
      models?: unknown;
      paused?: unknown;
      pausedUntil?: unknown;
      pausedReason?: unknown;
      pausedModels?: unknown;
    };
    const cli = typeof row.cli === "string" ? row.cli.trim() : "";
    if (!cli) return { error: "each allowlist entry needs a non-empty cli" };
    const rawModels = row.models;
    if (!Array.isArray(rawModels) || rawModels.length === 0) {
      return { error: `allowlist entry for "${cli}" needs at least one model` };
    }
    const models: string[] = [];
    for (const m of rawModels) {
      if (typeof m !== "string" || !m.trim()) {
        return { error: `allowlist models for "${cli}" must be non-empty strings` };
      }
      const value = m.trim();
      if (!models.includes(value)) models.push(value);
    }

    const pausedModels: AgentModelPause[] = [];
    if (row.pausedModels !== undefined) {
      if (!Array.isArray(row.pausedModels)) {
        return { error: `pausedModels for "${cli}" must be an array` };
      }
      for (const item of row.pausedModels) {
        const pause = normalizePausedModel(item);
        if (pause) pausedModels.push(pause);
      }
    }

    const paused = row.paused === true;
    const pausedUntil = pauseUntil(row.pausedUntil);
    const pausedReason = nonEmptyString(row.pausedReason);

    const existing = byCli.get(cli);
    if (existing) {
      for (const m of models) if (!existing.models.includes(m)) existing.models.push(m);
      if (paused) existing.paused = true;
      if (!existing.pausedUntil && pausedUntil) existing.pausedUntil = pausedUntil;
      if (!existing.pausedReason && pausedReason) existing.pausedReason = pausedReason;
      existing.pausedModels = mergePausedModels(existing.pausedModels, pausedModels);
    } else {
      const next: Accumulated = { cli, models };
      if (paused) next.paused = true;
      if (pausedUntil) next.pausedUntil = pausedUntil;
      if (pausedReason) next.pausedReason = pausedReason;
      if (pausedModels.length) next.pausedModels = pausedModels;
      byCli.set(cli, next);
    }
  }
  return { rows: [...byCli.values()] };
}

/** Index rows by cli for O(1) lookup during enforcement. */
export function allowlistIndex(rows: AgentModelAllowRow[]): Map<string, string[]> {
  return new Map(rows.map((r) => [r.cli, r.models]));
}

/** True when the allowlist imposes no restriction (empty or unset). */
export function allowlistIsEmpty(rows: AgentModelAllowRow[]): boolean {
  return rows.length === 0;
}

/**
 * Whether `cli + model` is on the allowlist. An empty/unset allowlist allows
 * everything (the documented no-op). A listed agent only allows its own models;
 * an agent not on the list at all is refused.
 */
export function isPairOnAllowlist(rows: AgentModelAllowRow[], cli: string, model: string): boolean {
  if (allowlistIsEmpty(rows)) return true;
  const models = allowlistIndex(rows).get(cli);
  if (!models) return false;
  if (!model || model === "default") return true;
  return models.includes(model);
}

/** Pause state for one agent+model pair at `now` (#0850). */
export interface PairPause {
  paused: boolean;
  /** Why the entry is paused, when the human gave a reason. */
  reason?: string;
  /** ISO timestamp when it resumes, when one was set. */
  until?: string;
}

const NOT_PAUSED: PairPause = { paused: false };

/**
 * True when a pause deadline is still in the future. A missing deadline means
 * an indefinite pause; an unparseable one is treated as indefinite (fail
 * closed) rather than silently un-pausing an entry a human meant to stop.
 */
function pauseIsActive(until: string | undefined, now: number): boolean {
  if (!until) return true;
  const at = Date.parse(until);
  return !Number.isFinite(at) || at > now;
}

/**
 * Pause state for `cli + model`. A whole-row pause (`paused`) outranks a
 * per-model pause. When `model` is `"default"`/empty the pair cannot be matched
 * to one model, so any active per-model pause on the row makes it paused too
 * (fail closed).
 */
export function pairPauseInfo(
  rows: AgentModelAllowRow[],
  cli: string,
  model: string,
  now: number = Date.now(),
): PairPause {
  const row = rows.find((r) => r.cli === cli);
  if (!row) return NOT_PAUSED;
  if (row.paused && pauseIsActive(row.pausedUntil, now)) {
    return { paused: true, reason: row.pausedReason, until: row.pausedUntil };
  }
  if (!model || model === "default") {
    // The harness/model is unresolved ("default"), so we cannot prove it is
    // not the paused model — fail closed on the row's first active per-model
    // pause rather than risk selecting a paused pair.
    const anyPaused = row.pausedModels?.find((p) => pauseIsActive(p.pausedUntil, now));
    if (!anyPaused) return NOT_PAUSED;
    return { paused: true, reason: anyPaused.pausedReason, until: anyPaused.pausedUntil };
  }
  const pause = row.pausedModels?.find((p) => p.model === model);
  if (!pause) return NOT_PAUSED;
  if (!pauseIsActive(pause.pausedUntil, now)) return NOT_PAUSED;
  return { paused: true, reason: pause.pausedReason, until: pause.pausedUntil };
}

/** True when `cli + model` is paused at `now`. */
export function isPairPaused(
  rows: AgentModelAllowRow[],
  cli: string,
  model: string,
  now: number = Date.now(),
): boolean {
  return pairPauseInfo(rows, cli, model, now).paused;
}

/**
 * Whether a pair may be selected right now: on the allowlist (or the list is
 * empty) and not paused. This is the fail-closed selection predicate; use it
 * everywhere a default, a fallback or an agent-driver override is chosen.
 */
export function isPairSelectable(
  rows: AgentModelAllowRow[],
  cli: string,
  model: string,
  now: number = Date.now(),
): boolean {
  if (!isPairOnAllowlist(rows, cli, model)) return false;
  return !isPairPaused(rows, cli, model, now);
}

/** One allowed agent+model pair. */
export interface AllowPair {
  cli: string;
  model: string;
}

/** Every allowed pair that is not currently paused, in allowlist order. */
export function availableAllowPairs(
  rows: AgentModelAllowRow[],
  now: number = Date.now(),
): AllowPair[] {
  const pairs: AllowPair[] = [];
  for (const row of rows) {
    for (const model of row.models) {
      if (isPairSelectable(rows, row.cli, model, now)) pairs.push({ cli: row.cli, model });
    }
  }
  return pairs;
}

/** The first selectable allowed pair, or null when the list is empty/all paused. */
export function firstSelectablePair(
  rows: AgentModelAllowRow[],
  now: number = Date.now(),
): AllowPair | null {
  return availableAllowPairs(rows, now)[0] ?? null;
}

/** True when a non-empty allowlist has no selectable pair (everything paused). */
export function allAllowlistPairsPaused(
  rows: AgentModelAllowRow[],
  now: number = Date.now(),
): boolean {
  return rows.length > 0 && availableAllowPairs(rows, now).length === 0;
}

/** A short, human-readable rendering of every allowed pair, for error copy. */
export function describeAllowlistPairs(
  rows: AgentModelAllowRow[],
  now: number = Date.now(),
): string {
  if (allowlistIsEmpty(rows)) return "(none — unrestricted)";
  return rows
    .flatMap((r) =>
      r.models.map(
        (m) => `${r.cli} + ${m}${pairPauseInfo(rows, r.cli, m, now).paused ? " (paused)" : ""}`,
      ),
    )
    .join(", ");
}

/** Where a pause is applied: the whole row, or one of its models. */
export interface AllowlistPauseTarget {
  cli: string;
  /** Omit to pause the whole agent (every model on the row). */
  model?: string;
  /** Optional ISO/date string; normalized to ISO on write. */
  until?: string;
  /** Optional free-text reason. */
  reason?: string;
}

export type AllowlistMutation = { rows: AgentModelAllowRow[] } | { error: string };

function normalizeUntil(until: string | undefined): { value?: string } | { error: string } {
  if (!until || !until.trim()) return {};
  const ms = Date.parse(until.trim());
  if (!Number.isFinite(ms)) {
    return {
      error: `"${until}" is not a valid date/time — use an ISO date like 2026-10-22T09:00:00Z`,
    };
  }
  return { value: new Date(ms).toISOString() };
}

/**
 * Pause a row or one of its models (#0850). Pure: returns new rows; callers
 * persist them (the CLI through `PATCH /api/config`, the UI through the
 * config store). An unknown agent/model is a clear error rather than a silent
 * no-op, so a typo can never make a start keep hitting the pair it meant to
 * pause.
 */
export function pauseAllowlistEntry(
  rows: AgentModelAllowRow[],
  target: AllowlistPauseTarget,
): AllowlistMutation {
  const idx = rows.findIndex((r) => r.cli === target.cli);
  if (idx === -1) {
    return {
      error: `"${target.cli}" is not on the budget allowlist — add it there before pausing it`,
    };
  }
  const row = rows[idx]!;
  const untilResult = normalizeUntil(target.until);
  if ("error" in untilResult) return untilResult;
  const until = untilResult.value;
  const reason = target.reason?.trim() || undefined;

  let next: AgentModelAllowRow;
  if (!target.model) {
    next = { ...row };
    next.paused = true;
    if (until) next.pausedUntil = until;
    else delete next.pausedUntil;
    if (reason) next.pausedReason = reason;
    else delete next.pausedReason;
  } else {
    if (!row.models.includes(target.model)) {
      return {
        error: `"${target.model}" is not an allowed model for "${target.cli}" — allowed: ${row.models.join(", ")}`,
      };
    }
    const pauses = (row.pausedModels ?? []).filter((p) => p.model !== target.model);
    const pause: AgentModelPause = { model: target.model };
    if (until) pause.pausedUntil = until;
    if (reason) pause.pausedReason = reason;
    pauses.push(pause);
    next = { ...row, pausedModels: pauses };
  }
  return { rows: rows.map((r, i) => (i === idx ? next : r)) };
}

/**
 * Resume a row or one of its models (#0850). Resuming an agent clears the
 * whole-row pause and every per-model pause on it; resuming a model removes
 * only that model's pause.
 */
export function resumeAllowlistEntry(
  rows: AgentModelAllowRow[],
  target: Pick<AllowlistPauseTarget, "cli" | "model">,
): AllowlistMutation {
  const idx = rows.findIndex((r) => r.cli === target.cli);
  if (idx === -1) {
    return { error: `"${target.cli}" is not on the budget allowlist` };
  }
  const row = rows[idx]!;
  let next: AgentModelAllowRow;
  if (!target.model) {
    next = { ...row };
    delete next.paused;
    delete next.pausedUntil;
    delete next.pausedReason;
    delete next.pausedModels;
  } else {
    const pauses = (row.pausedModels ?? []).filter((p) => p.model !== target.model);
    next = { ...row };
    if (pauses.length) next.pausedModels = pauses;
    else delete next.pausedModels;
  }
  return { rows: rows.map((r, i) => (i === idx ? next : r)) };
}
