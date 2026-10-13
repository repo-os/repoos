/**
 * Agent-driver budget controls (#0764).
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
 */
import type { AgentModelAllowRow } from "./types.js";

/** The configured allowlist rows, normalizing malformed input to `[]`. */
export function agentModelAllowRows(input: unknown): AgentModelAllowRow[] {
  const result = normalizeAllowlistRows(input);
  return "rows" in result ? result.rows : [];
}

export type NormalizedAllowlist = { rows: AgentModelAllowRow[] } | { error: string };

/**
 * Validate and normalize a submitted allowlist.
 *
 * Accepts an array of `{ cli, models }` rows. Duplicate `cli` rows are merged
 * (models unioned, order preserved) so the same agent can never appear twice in
 * the control. Returns a human-readable `error` on a malformed shape — the
 * server/config route turns that into a 400, and `loadConfig` drops the row
 * instead of poisoning the whole file.
 */
export function normalizeAllowlistRows(input: unknown): NormalizedAllowlist {
  if (input === undefined || input === null) return { rows: [] };
  if (!Array.isArray(input)) {
    return { error: "allowlist must be an array of { cli, models } entries" };
  }
  const byCli = new Map<string, string[]>();
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { error: "each allowlist entry must be an object with cli and models" };
    }
    const row = entry as { cli?: unknown; models?: unknown };
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
    const existing = byCli.get(cli);
    if (existing) {
      for (const m of models) if (!existing.includes(m)) existing.push(m);
    } else {
      byCli.set(cli, models);
    }
  }
  return { rows: [...byCli].map(([cli, models]) => ({ cli, models })) };
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

/** A short, human-readable rendering of every allowed pair, for error copy. */
export function describeAllowlistPairs(rows: AgentModelAllowRow[]): string {
  if (allowlistIsEmpty(rows)) return "(none — unrestricted)";
  return rows.flatMap((r) => r.models.map((m) => `${r.cli} + ${m}`)).join(", ");
}
