/**
 * Routing policy: turn provider signals into one candidate, or a fallback (#0791).
 *
 * Decision order — every step is deterministic code, never the provider:
 *
 * 1. Explicit human pins win. A pinned CLI/model is never overridden here; the
 *    router only runs for unpinned runs.
 * 2. No eligible candidates → block with an actionable reason (no silent pick).
 * 3. Provider failure, timeout, malformed/unsupported response, or a missing
 *    answer → the calibrated fallback, if it is itself eligible, else block.
 * 4. Insufficient evidence (every answer low-confidence or the cost/time policy
 *    cannot be scored) → the fallback, never a guessed pick.
 * 5. Otherwise score the eligible candidates from the provider's signals plus
 *    the cost/time weights, and pick the highest. The chosen candidate is always
 *    a member of the filtered eligible set.
 *
 * Provider confidence is NOT treated as established accuracy: the thresholds and
 * weights below are explicit, versioned policy constants, not learned values.
 */
import type { RoutingCandidate } from "./candidates.js";
import { candidateKey } from "./candidates.js";
import { RoutingProviderError, type RoutingAnswer } from "./types.js";

/** Bump when the question set or scoring changes, so decisions stay reproducible. */
export const ROUTING_POLICY_VERSION = "2";

/** Below this provider confidence an answer is treated as insufficient evidence. */
export const MIN_ANSWER_CONFIDENCE = 0.5;

/** Relative cost/time preference. Higher `costWeight` favors cheaper candidates. */
export interface RoutingWeights {
  /** Weight on the candidate's expected cost (0..1). */
  costWeight: number;
  /** Weight on the candidate's expected time (0..1). */
  timeWeight: number;
}

export const DEFAULT_ROUTING_WEIGHTS: RoutingWeights = { costWeight: 0.5, timeWeight: 0.5 };

/** Per-candidate expected cost/time, normalized to 0..1 (lower is better). */
export interface CandidateCostTime {
  candidate: RoutingCandidate;
  /** Normalized expected cost, 0 (cheapest) .. 1 (most expensive). */
  cost: number;
  /** Normalized expected time, 0 (fastest) .. 1 (slowest). */
  time: number;
}

export type PolicyOutcome =
  | { kind: "selected"; candidate: RoutingCandidate; reason: "scored" }
  | { kind: "fallback"; candidate: RoutingCandidate; reason: PolicyFallbackReason }
  | { kind: "blocked"; reason: PolicyBlockReason; message: string };

export type PolicyFallbackReason =
  | "provider-failure"
  | "malformed-response"
  | "insufficient-evidence";

export type PolicyBlockReason = "no-candidates" | "no-eligible-fallback";

export interface PolicyInput {
  /** Eligible candidates from `filterCandidates` (already allowlist-checked). */
  eligible: RoutingCandidate[];
  /** The configured/pinned choice, used as the calibrated fallback. */
  fallback: RoutingCandidate | null;
  /** Provider answers keyed by question id, or null when the call failed. */
  answers: Record<string, RoutingAnswer> | null;
  /** Why the call failed, when `answers` is null. */
  failure: RoutingProviderError | null;
  /** Per-candidate cost/time, keyed by candidateKey. Missing entries are scored as unknown. */
  costTime: Record<string, { cost: number; time: number }>;
  weights: RoutingWeights;
}

/** Answer ids the policy reads. Versioned with ROUTING_POLICY_VERSION. */
export const ROUTING_QUESTION_IDS = {
  ambiguity: "ambiguity",
  risk: "risk",
  scope: "scope",
  suitability: "suitability",
} as const;

/** Map a failed provider call to a fallback reason. */
function failureReason(err: RoutingProviderError | null): PolicyFallbackReason {
  return err?.kind === "malformed" || err?.kind === "unsupported"
    ? "malformed-response"
    : "provider-failure";
}

/** Use the fallback when it is eligible; otherwise block with a clear reason. */
function fallbackOrBlock(input: PolicyInput, reason: PolicyFallbackReason): PolicyOutcome {
  const fb = input.fallback;
  if (fb && input.eligible.some((c) => candidateKey(c) === candidateKey(fb))) {
    return { kind: "fallback", candidate: fb, reason };
  }
  return {
    kind: "blocked",
    reason: "no-eligible-fallback",
    message:
      `Model routing could not decide (${reason}) and the configured fallback ` +
      `is not eligible. Pick a model on the Agents page or widen the budget allowlist.`,
  };
}

function noulProbability(answers: Record<string, RoutingAnswer>, id: string): number {
  const a = answers[id];
  return a?.type === "noul" ? a.probability : 0.5;
}

/** Score one candidate. Higher is better. Suitability dominates; ambiguity/risk/scope modulate capability vs economy. */
function score(
  c: RoutingCandidate,
  answers: Record<string, RoutingAnswer>,
  ct: { cost: number; time: number } | undefined,
  weights: RoutingWeights,
): number {
  const suit = answers[ROUTING_QUESTION_IDS.suitability];
  // Suitability is a choice over candidate keys; the candidate's own probability is its signal.
  const suitP = suit && suit.type === "choice" ? (suit.probabilities[candidateKey(c)] ?? 0) : 0;
  const ambiguity = noulProbability(answers, ROUTING_QUESTION_IDS.ambiguity);
  const risk = noulProbability(answers, ROUTING_QUESTION_IDS.risk);
  const scope = noulProbability(answers, ROUTING_QUESTION_IDS.scope);
  const intensity = (ambiguity + risk + scope) / 3;
  if (!ct) {
    // Unknown cost/time for this candidate must not be faked as neutral — suitability only.
    return suitP;
  }
  const cost = ct.cost;
  const time = ct.time;
  const economy = 1 - (weights.costWeight * cost + weights.timeWeight * time);
  // High ambiguity/risk/scope → lean toward more capable (higher normalized cost); otherwise favor economy.
  const capabilityFit = intensity * cost + (1 - intensity) * economy;
  return suitP * 0.55 + capabilityFit * 0.25 + economy * 0.2;
}

/** Decide one routing outcome. Pure: the same input always yields the same output. */
export function decideRouting(input: PolicyInput): PolicyOutcome {
  if (input.eligible.length === 0) {
    return {
      kind: "blocked",
      reason: "no-candidates",
      message:
        "No coding-agent/model configuration is eligible for this role. " +
        "Check the budget allowlist, installed/authenticated harnesses, and reasoning support.",
    };
  }

  if (input.failure || !input.answers) {
    return fallbackOrBlock(input, failureReason(input.failure));
  }

  const answers = input.answers;
  const eligibleKeys = input.eligible.map(candidateKey);
  if (!hasSufficientEvidence(answers, eligibleKeys)) {
    return fallbackOrBlock(input, "insufficient-evidence");
  }

  let best: RoutingCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of input.eligible) {
    const s = score(c, answers, input.costTime[candidateKey(c)], input.weights);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  // `eligible` is non-empty, so `best` is set.
  return { kind: "selected", candidate: best as RoutingCandidate, reason: "scored" };
}

/**
 * Evidence is sufficient only when the suitability answer exists, is a choice
 * over **eligible** candidates, and its top eligible probability clears the
 * calibrated threshold. Unknown choice/probability keys are rejected.
 */
export function hasSufficientEvidence(
  answers: Record<string, RoutingAnswer>,
  eligibleKeys: readonly string[],
): boolean {
  const suit = answers[ROUTING_QUESTION_IDS.suitability];
  if (!suit || suit.type !== "choice") return false;
  const allowed = new Set(eligibleKeys);
  if (!allowed.has(suit.choice)) return false;
  for (const key of Object.keys(suit.probabilities)) {
    if (!allowed.has(key)) return false;
  }
  const eligibleProbs = eligibleKeys.map((k) => suit.probabilities[k] ?? 0);
  const top = eligibleProbs.length ? Math.max(0, ...eligibleProbs) : 0;
  if (top < MIN_ANSWER_CONFIDENCE) return false;
  if (suit.confidence !== null && suit.confidence < MIN_ANSWER_CONFIDENCE) return false;
  return true;
}
