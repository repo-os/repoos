/**
 * Deterministic candidate filtering for the routing decision (#0791).
 *
 * The router selects a coding-agent + model configuration, but it may never
 * expand permissions or budgets. Every candidate is checked here, in code,
 * before any provider sees the set. The rules:
 *
 * 1. The human-approved budget allowlist (`[[budget.allowlist]]`) is the
 *    ceiling. An empty allowlist is the documented unrestricted no-op; a
 *    non-empty one admits only its listed, not-paused cli+model pairs. This
 *    reuses `isPairSelectable`, the same predicate agent-driver enforcement
 *    uses, so the two can never disagree.
 * 2. The candidate's CLI must be a drivable harness and installed/authenticated.
 * 3. A reasoning setting, if present, must be one the harness supports.
 * 4. The harness must support the run's role (pm, engineer, reviewer).
 * 5. The harness/model context window must cover the brief's required size.
 * 6. Candidates are de-duplicated and returned in a stable order so decisions
 *    are reproducible.
 *
 * Pure and node-free so it is trivially unit-testable.
 */
import { isPairSelectable, isPairPaused } from "../budget-allowlist.js";
import type { AgentModelAllowRow } from "../types.js";
import type { RoutingRole } from "./types.js";

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
  /** Roles this harness may run as for routing (must include the run's role). */
  supportedRoles: RoutingRole[];
  /** Maximum context window in tokens the harness/model can accept. */
  maxContextTokens: number;
}

export interface CandidateFilterInput {
  /** Role being routed (pm, engineer, reviewer). */
  role: RoutingRole;
  /** Tokens required by the bounded brief; `0` means no size check. */
  requiredContextTokens: number;
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

    if (!isPairSelectable(input.allowlist, candidate.cli, candidate.model)) {
      rejected.push({
        candidate,
        reason: isPairPaused(input.allowlist, candidate.cli, candidate.model)
          ? "paused on the budget allowlist"
          : "not on the budget allowlist",
      });
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
    if (!harness.supportedRoles.includes(input.role)) {
      rejected.push({
        candidate,
        reason: `harness does not support the ${input.role} role`,
      });
      continue;
    }
    if (input.requiredContextTokens > 0 && harness.maxContextTokens < input.requiredContextTokens) {
      rejected.push({
        candidate,
        reason:
          `context window too small (needs ${input.requiredContextTokens} tokens, ` +
          `supports ${harness.maxContextTokens})`,
      });
      continue;
    }
    eligible.push(candidate);
  }

  eligible.sort((a, b) => candidateKey(a).localeCompare(candidateKey(b)));
  return { eligible, rejected };
}
