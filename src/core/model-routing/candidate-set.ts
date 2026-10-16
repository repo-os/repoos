/**
 * Candidate-set construction for routing (#0793).
 *
 * `filterCandidates` (candidates.ts) answers "which of these may run?". This
 * module answers the earlier question: "which configurations do we offer at
 * all?". The universe is bounded by the human-approved budget allowlist when it
 * is non-empty; otherwise it falls back to the cli+model pairs already
 * configured on the Agents page. Every candidate carries a complete, valid
 * configuration — cli + model + a reasoning setting the harness supports — so
 * the policy can never assemble an invalid pair from independent fields.
 *
 * Pure and node-free.
 */
import type { AgentModelAllowRow } from "../types.js";
import { candidateKey, type RoutingCandidate } from "./candidates.js";
import { capabilityForCli } from "./harness.js";

/** A configured cli+model pair (from an enabled Agent). */
export interface AgentModelPair {
  cli: string;
  model: string;
}

export interface CandidateSetInput {
  /** Human-approved allowlist. When non-empty it is the whole universe. */
  allowlist: AgentModelAllowRow[];
  /** Configured agent pairs, used only when the allowlist is empty. */
  agentPairs: AgentModelPair[];
}

/**
 * Enumerate the routable candidate configurations.
 *
 * For each cli+model pair we emit the base configuration (no reasoning) plus one
 * variant per reasoning level the harness supports, so "supported reasoning" is
 * always part of the routed configuration. Deduplicated and stable-ordered, so
 * two runs with the same inputs present the provider the same question set.
 */
export function buildCandidateSet(input: CandidateSetInput): RoutingCandidate[] {
  const pairs: AgentModelPair[] = [];
  if (input.allowlist.length > 0) {
    for (const row of input.allowlist) {
      for (const model of row.models) pairs.push({ cli: row.cli, model });
    }
  } else {
    for (const pair of input.agentPairs) pairs.push({ cli: pair.cli, model: pair.model });
  }

  const seen = new Set<string>();
  const out: RoutingCandidate[] = [];
  for (const { cli, model } of pairs) {
    const reasoningLevels = [null, ...capabilityForCli(cli).reasoning];
    for (const reasoning of reasoningLevels) {
      const candidate: RoutingCandidate = { cli, model, reasoning };
      const key = candidateKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
    }
  }
  out.sort((a, b) => candidateKey(a).localeCompare(candidateKey(b)));
  return out;
}

/** The complete configuration for one configured Agent, as a routing candidate. */
export function candidateForAgent(agent: { cli: string; model: string } | null | undefined): RoutingCandidate | null {
  if (!agent) return null;
  return { cli: agent.cli, model: agent.model, reasoning: null };
}
