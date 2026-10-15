/**
 * Deterministic candidate filtering for the routing decision (#0791).
 *
 * The router selects a coding-agent + model configuration, but it may never
 * expand permissions or budgets. Every candidate is checked here, in code,
 * before any provider sees the set. The rules:
 *
 * 1. The human-approved budget allowlist (`[[budget.allowlist]]`) is the
 *    ceiling. An empty allowlist is the documented unrestricted no-op; a
 *    non-empty one admits only its listed cli+model pairs. This reuses
 *    `isPairOnAllowlist`, the same function agent-driver enforcement uses, so
 *    the two can never disagree.
 * 2. The candidate's CLI must be a drivable harness and installed/authenticated.
 * 3. A reasoning setting, if present, must be one the harness supports.
 * 4. Candidates are de-duplicated and returned in a stable order so decisions
 *    are reproducible.
 *
 * Pure and node-free so it is trivially unit-testable.
 */
import { isPairOnAllowlist } from "../budget-allowlist.js";
import type { AgentModelAllowRow } from "../types.js";

/** One complete, valid coding-agent configuration the router may choose. */
export interface RoutingCandidate {
  /** Coding-agent CLI id, e.g. "claude code" (an `AGENT_CLIS` value). */
  cli: string;
  /** Model id, or "default" for the CLI's default. */
  model: string;
  /** Reasoning/effort setting, or null when the harness/model has none. */
  reasoning: string | null;
}

/** Facts about each harness the filter needs. Supplied by the caller from doctor/auth probes. */
export interface HarnessAvailability {
  /** Whether the harness binary is installed and authenticated. */
  available: boolean;
  /** Reasoning settings the harness/model supports (empty = none). */
  supportedReasoning: string[];
}

export interface CandidateFilterInput {
  candidates: RoutingCandidate[];
  allowlist: AgentModelAllowRow[];
  /** Keyed by cli. A cli absent from this map is treated as unavailable. */
  harnesses: Record<string, HarnessAvailability>;
}

export interface CandidateFilterResult {
  /** Eligible candidates in stable, de-duplicated order. */
  eligible: RoutingCandidate[];
  /** Why each rejected candidate was removed, for the decision record. */
  rejected: Array<{ candidate: RoutingCandidate; reason: string }>;
}

/** Stable identity for de-duplication and decision records. */
export function candidateKey(c: RoutingCandidate): string {
  return `${c.cli}\u0000${c.model}\u0000${c.reasoning ?? ""}`;
}

export function filterCandidates(input: CandidateFilterInput): CandidateFilterResult {
  const eligible: RoutingCandidate[] = [];
  const rejected: CandidateFilterResult["rejected"] = [];
  const seen = new Set<string>();

  for (const candidate of input.candidates) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!isPairOnAllowlist(input.allowlist, candidate.cli, candidate.model)) {
      rejected.push({ candidate, reason: "not on the budget allowlist" });
      continue;
    }
    const harness = input.harnesses[candidate.cli];
    if (!harness || !harness.available) {
      rejected.push({ candidate, reason: "harness not installed or not authenticated" });
      continue;
    }
    if (candidate.reasoning !== null && !harness.supportedReasoning.includes(candidate.reasoning)) {
      rejected.push({ candidate, reason: `reasoning "${candidate.reasoning}" not supported` });
      continue;
    }
    eligible.push(candidate);
  }

  eligible.sort((a, b) => candidateKey(a).localeCompare(candidateKey(b)));
  return { eligible, rejected };
}
