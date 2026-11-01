/**
 * Automatic quota/usage pauses (#0998).
 *
 * Human allowlist membership and explicit Pause/Resume stay in `repoos.toml`.
 * Pauses RepoOS records itself (reason prefix `out of usage since`) live in
 * `.repoos/budget-runtime.json`, which is gitignored. Close-out therefore
 * does not see a routine probe or crash-recovery update as dirty config.
 *
 * Precedence: a human pause on the same agent or model wins over the runtime
 * file. An expired `pausedUntil` resumes with no rewrite, same as a pause
 * stored in toml. On load, automatic pause fields still present in toml are
 * copied into the runtime file (the file wins when both name the same pair)
 * and then ignored in memory so there is one source.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pauseAllowlistEntry } from "./budget-allowlist.js";
import type { AgentModelAllowRow } from "./types.js";

export const AUTOMATIC_PAUSE_REASON_PREFIX = "out of usage since ";

export function isAutomaticPauseReason(reason: string | undefined): boolean {
  return !!reason?.startsWith(AUTOMATIC_PAUSE_REASON_PREFIX);
}

export interface AutomaticPause {
  cli: string;
  /** Absent when the whole agent row is paused. */
  model?: string;
  pausedUntil?: string;
  pausedReason: string;
}

interface RuntimeFile {
  version: 1;
  pauses: AutomaticPause[];
}

const EMPTY: RuntimeFile = { version: 1, pauses: [] };

export function budgetRuntimeStatePath(root: string): string {
  return join(root, ".repoos", "budget-runtime.json");
}

export function readBudgetRuntimeState(root: string): RuntimeFile | "invalid" {
  const path = budgetRuntimeStatePath(root);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return EMPTY;
  }
  try {
    const parsed = JSON.parse(text) as Partial<RuntimeFile>;
    if (!parsed || !Array.isArray(parsed.pauses)) return "invalid";
    const pauses: AutomaticPause[] = [];
    for (const entry of parsed.pauses) {
      if (!entry || typeof entry !== "object") continue;
      const cli = typeof entry.cli === "string" ? entry.cli.trim() : "";
      const pausedReason = typeof entry.pausedReason === "string" ? entry.pausedReason : "";
      if (!cli || !isAutomaticPauseReason(pausedReason)) continue;
      const model =
        typeof entry.model === "string" && entry.model.trim() ? entry.model.trim() : undefined;
      const pausedUntil =
        typeof entry.pausedUntil === "string" && entry.pausedUntil.trim()
          ? entry.pausedUntil
          : undefined;
      pauses.push({
        cli,
        pausedReason,
        ...(model ? { model } : {}),
        ...(pausedUntil ? { pausedUntil } : {}),
      });
    }
    return { version: 1, pauses };
  } catch {
    return "invalid";
  }
}

function writeRuntime(root: string, file: RuntimeFile): void {
  const path = budgetRuntimeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function pauseKey(pause: Pick<AutomaticPause, "cli" | "model">): string {
  return `${pause.cli}\0${pause.model ?? ""}`;
}

/** Automatic pauses expressed on allowlist rows (agent-level and per-model). */
export function automaticPausesIn(rows: AgentModelAllowRow[]): AutomaticPause[] {
  const pauses: AutomaticPause[] = [];
  for (const row of rows) {
    if (row.paused && isAutomaticPauseReason(row.pausedReason)) {
      pauses.push({
        cli: row.cli,
        pausedReason: row.pausedReason!,
        ...(row.pausedUntil ? { pausedUntil: row.pausedUntil } : {}),
      });
    }
    for (const model of row.pausedModels ?? []) {
      if (!isAutomaticPauseReason(model.pausedReason)) continue;
      pauses.push({
        cli: row.cli,
        model: model.model,
        pausedReason: model.pausedReason!,
        ...(model.pausedUntil ? { pausedUntil: model.pausedUntil } : {}),
      });
    }
  }
  return pauses;
}

/** Allowlist rows with automatic pause fields removed. Human pauses stay. */
export function allowlistWithoutAutomaticPauses(rows: AgentModelAllowRow[]): AgentModelAllowRow[] {
  return rows.map((row) => {
    const next: AgentModelAllowRow = { ...row };
    if (isAutomaticPauseReason(next.pausedReason)) {
      delete next.paused;
      delete next.pausedUntil;
      delete next.pausedReason;
    }
    if (next.pausedModels) {
      const kept = next.pausedModels.filter((pause) => !isAutomaticPauseReason(pause.pausedReason));
      if (kept.length) next.pausedModels = kept;
      else delete next.pausedModels;
    }
    return next;
  });
}

function samePauses(a: AutomaticPause[], b: AutomaticPause[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Overlay runtime pauses onto tracked rows. A human pause already on the row
 * is left alone. Unknown agents are skipped (the allowlist is the membership
 * source).
 */
export function applyAutomaticPauses(
  rows: AgentModelAllowRow[],
  pauses: AutomaticPause[],
): AgentModelAllowRow[] {
  let next = allowlistWithoutAutomaticPauses(rows);
  for (const pause of pauses) {
    const row = next.find((candidate) => candidate.cli === pause.cli);
    if (!row) continue;
    if (!pause.model) {
      if (row.paused && !isAutomaticPauseReason(row.pausedReason)) continue;
      const mutation = pauseAllowlistEntry(next, {
        cli: pause.cli,
        until: pause.pausedUntil,
        reason: pause.pausedReason,
      });
      if ("rows" in mutation) next = mutation.rows;
      continue;
    }
    const human = row.pausedModels?.find(
      (item) => item.model === pause.model && !isAutomaticPauseReason(item.pausedReason),
    );
    if (human || (row.paused && !isAutomaticPauseReason(row.pausedReason))) continue;
    const mutation = pauseAllowlistEntry(next, {
      cli: pause.cli,
      model: pause.model,
      until: pause.pausedUntil,
      reason: pause.pausedReason,
    });
    if ("rows" in mutation) next = mutation.rows;
  }
  return next;
}

/**
 * Remember automatic pauses from `rows` and return the effective allowlist
 * (tracked fields plus the runtime overlay). Does not write `repoos.toml`.
 */
export function recordAutomaticAllowlist(
  root: string,
  rows: AgentModelAllowRow[],
): AgentModelAllowRow[] {
  const pauses = automaticPausesIn(rows);
  const existing = readBudgetRuntimeState(root);
  const prior = existing === "invalid" ? [] : existing.pauses;
  if (existing === "invalid" || !samePauses(prior, pauses)) {
    writeRuntime(root, { version: 1, pauses });
  }
  return applyAutomaticPauses(allowlistWithoutAutomaticPauses(rows), pauses);
}

/** Replace the runtime file with the automatic pauses in `rows` (resume clears omitted pairs). */
export function replaceAutomaticPauses(root: string, rows: AgentModelAllowRow[]): void {
  writeRuntime(root, { version: 1, pauses: automaticPausesIn(rows) });
}

export function clearAutomaticPauses(root: string): void {
  writeRuntime(root, EMPTY);
}

/**
 * Load-time merge. Invalid runtime JSON keeps the toml rows unchanged so a
 * corrupt file cannot drop a pause. Missing file migrates automatic fields
 * out of the parsed rows into the runtime file.
 */
export function hydrateAllowlistRuntime(
  root: string,
  rows: AgentModelAllowRow[],
): AgentModelAllowRow[] {
  const fromToml = automaticPausesIn(rows);
  const stored = readBudgetRuntimeState(root);
  if (stored === "invalid") {
    console.warn(
      "[repoos] .repoos/budget-runtime.json could not be parsed — keeping allowlist pauses from repoos.toml",
    );
    return rows;
  }
  const byKey = new Map<string, AutomaticPause>();
  for (const pause of fromToml) byKey.set(pauseKey(pause), pause);
  for (const pause of stored.pauses) byKey.set(pauseKey(pause), pause);
  const merged = [...byKey.values()];
  if (!samePauses(stored.pauses, merged)) writeRuntime(root, { version: 1, pauses: merged });
  return applyAutomaticPauses(rows, merged);
}
