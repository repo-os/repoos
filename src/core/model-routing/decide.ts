/**
 * Orchestrates one routing decision (#0791): effective settings → candidate
 * filter → provider call → policy. Dependency-injected (the provider is passed
 * in) so it is fully testable with fixtures and never reaches the network from
 * a unit test.
 *
 * Invariants this function upholds, regardless of provider output:
 * - `off` short-circuits to `{ kind: "disabled" }` with no provider call.
 * - A pinned run is never routed; the caller passes `pinned: true` and gets
 *   `{ kind: "pinned" }` back.
 * - `shadow` returns the recommendation but `applied` is always false, so the
 *   actual selection cannot change.
 * - The returned candidate is always a member of the allowlist-filtered set.
 */
import {
  DEFAULT_ROUTING_WEIGHTS,
  ROUTING_QUESTION_IDS,
  decideRouting,
  type PolicyOutcome,
  type RoutingWeights,
} from "./policy.js";
import {
  candidateKey,
  filterCandidates,
  type CandidateFilterInput,
  type RoutingCandidate,
} from "./candidates.js";
import { type EffectiveRouting, routingActiveFor } from "./config.js";
import {
  RoutingProviderError,
  type RoutingAnswer,
  type RoutingDecisionProvider,
  type RoutingDecisionRequest,
  type RoutingQuestion,
  type RoutingRole,
} from "./types.js";

export type RoutingDecision =
  | { kind: "disabled" }
  | { kind: "pinned" }
  | {
      kind: "decided";
      role: RoutingRole;
      /** The configuration the policy chose (or fell back to / blocked on). */
      outcome: PolicyOutcome;
      /** Whether the decision changes the actual selection. False in shadow mode. */
      applied: boolean;
      /** Candidates rejected by deterministic filtering, with reasons, for the record. */
      rejected: Array<{ candidate: RoutingCandidate; reason: string }>;
      /** Provider model id reported back, when a call was made. */
      providerModel: string | null;
      /** Token usage from the provider, when reported (#0793 persistence). */
      providerUsage: { inputTokens: number | null; outputTokens: number | null } | null;
    };

export interface DecideRoutingInput {
  effective: EffectiveRouting;
  role: RoutingRole;
  /** True when the human explicitly pinned a model/CLI for this run. */
  pinned: boolean;
  /** Bounded state text for the provider (already truncated by the caller). */
  stateText: string;
  filter: CandidateFilterInput;
  /** The configured/pinned fallback, used on failure or insufficient evidence. */
  fallback: RoutingCandidate | null;
  /** Per-candidate normalized cost/time, keyed by candidateKey. */
  costTime: Record<string, { cost: number; time: number }>;
  weights?: RoutingWeights;
  /** Provider instance, or null when none could be constructed (e.g. missing key). */
  provider: RoutingDecisionProvider | null;
}

/** The fixed question set, versioned with ROUTING_POLICY_VERSION. */
export function buildRoutingQuestions(candidates: RoutingCandidate[]): RoutingQuestion[] {
  const criteria: Record<string, string> = {};
  for (const c of candidates) {
    const label = c.reasoning ? `${c.cli} / ${c.model} / ${c.reasoning}` : `${c.cli} / ${c.model}`;
    criteria[candidateKey(c)] = label;
  }
  return [
    {
      id: ROUTING_QUESTION_IDS.ambiguity,
      type: "noul",
      instructions: "Is the task specification ambiguous or underspecified?",
    },
    {
      id: ROUTING_QUESTION_IDS.risk,
      type: "noul",
      instructions: "Does the change carry high risk (security, data, shared infrastructure)?",
    },
    {
      id: ROUTING_QUESTION_IDS.scope,
      type: "noul",
      instructions: "Is the change broad, spanning many files or subsystems?",
    },
    {
      id: ROUTING_QUESTION_IDS.suitability,
      type: "choice",
      instructions: "Which coding-agent configuration is best suited to this work?",
      criteria,
    },
  ];
}

/** Run one routing decision. Never throws: every failure is folded into the outcome. */
export async function decideRoutingForRun(input: DecideRoutingInput): Promise<RoutingDecision> {
  const { effective, role } = input;
  if (!routingActiveFor(effective, role)) return { kind: "disabled" };
  if (input.pinned) return { kind: "pinned" };

  const filtered = filterCandidates(input.filter);
  const eligible = filtered.eligible;

  let answers: Record<string, RoutingAnswer> | null = null;
  let failure: RoutingProviderError | null = null;
  let providerModel: string | null = null;
  let providerUsage: { inputTokens: number | null; outputTokens: number | null } | null = null;

  if (eligible.length === 0) {
    // No provider call is needed when nothing is eligible: the policy blocks.
  } else if (!input.provider) {
    failure = new RoutingProviderError("not-configured", "routing provider is not configured");
  } else {
    const request: RoutingDecisionRequest = {
      brief: { state: input.stateText },
      questions: buildRoutingQuestions(eligible),
      timeoutMs: effective.timeoutMs,
    };
    try {
      const response = await input.provider.decide(request);
      answers = response.answers;
      providerModel = response.model || null;
      providerUsage = response.usage;
    } catch (err) {
      failure =
        err instanceof RoutingProviderError
          ? err
          : new RoutingProviderError("transport", "routing decision failed");
    }
  }

  const outcome = decideRouting({
    eligible,
    fallback: input.fallback,
    answers,
    failure,
    costTime: input.costTime,
    weights: input.weights ?? DEFAULT_ROUTING_WEIGHTS,
  });

  return {
    kind: "decided",
    role,
    outcome,
    // Automatic mode applies only a scored selection — not a fallback or block.
    applied: effective.mode === "automatic" && outcome.kind === "selected",
    rejected: filtered.rejected,
    providerModel,
    providerUsage,
  };
}
