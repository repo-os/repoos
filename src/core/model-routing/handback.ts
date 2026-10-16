/**
 * Review-handback re-evaluation (#0793).
 *
 * When review sends work back, the router compares continuing the existing
 * session against switching to another eligible configuration or escalating to
 * the most capable one. The decision is deterministic code over recorded
 * signals — never a provider call — so it stays reproducible and bounded, and
 * it never bypasses review: it chooses an *engineer* configuration, it does not
 * approve, merge or short-circuit anything.
 *
 * Two invariants matter most:
 * - Infrastructure, provider and gate-setup failures are NOT attributed to the
 *   coding model. A configuration is never penalized for a timeout, an auth
 *   failure, a missing harness or a gate that could not run.
 * - Retries, switches and escalations are bounded. When the bounds are hit the
 *   handback reports `block` for a human, rather than looping.
 *
 * Pure and node-free.
 */
import { candidateKey, type RoutingCandidate } from "./candidates.js";

/** Failure categories the handback distinguishes. */
export type HandbackFailureCategory = "infrastructure" | "coding" | "none";

/** What the handback decided to do with the engineer configuration. */
export type HandbackAction = "continue" | "switch" | "escalate" | "accept" | "block";

/** Failure kinds that are infrastructure, not the model's fault. */
export const INFRASTRUCTURE_FAILURE_KINDS = new Set([
  "timeout",
  "transport",
  "auth",
  "http",
  "malformed",
  "unsupported",
  "not-configured",
  "harness-unavailable",
  "gate-setup",
  "infrastructure",
  "provider-failure",
  "budget",
  "permission",
]);

/** Failure kinds attributable to the coding output. */
export const CODING_FAILURE_KINDS = new Set([
  "review-findings",
  "check-failure",
  "tests-failing",
  "coding",
  "regression",
]);

/** Classify a failure kind. Unknown kinds are treated as coding (conservative). */
export function classifyHandbackFailure(kind: string | null | undefined): HandbackFailureCategory {
  if (!kind) return "none";
  const normalized = kind.toLowerCase();
  if (INFRASTRUCTURE_FAILURE_KINDS.has(normalized)) return "infrastructure";
  if (CODING_FAILURE_KINDS.has(normalized)) return "coding";
  // An unrecognized failure is not proof of a bad model, but it is also not
  // proof of infrastructure. Treat it as coding only when it is clearly a
  // quality failure; otherwise default to none so we do not switch on noise.
  return "none";
}

export interface HandbackFindings {
  /** The reviewer reported blocking bugs. */
  bugs: boolean;
  /** The reviewer reported blocking edge cases. */
  edgeCases: boolean;
  /** Only non-blocking suggestions. */
  suggestions: boolean;
  /** The clamped/actual verdict is a blocking request-for-changes. */
  blocking: boolean;
}

export interface HandbackInput {
  role: "engineer";
  /** The configuration that produced the bounced work. */
  current: RoutingCandidate | null;
  /** Eligible candidates the switch/escalate may draw from. */
  eligible: RoutingCandidate[];
  findings: HandbackFindings;
  /** Failure kind from the run or gate, or null when review found issues. */
  failureKind?: string | null;
  /** Completed review rounds so far (attempt history). */
  attempts: number;
  /** Prior `switch` handbacks for this task. */
  switches: number;
  /** Prior `escalate` handbacks for this task. */
  escalations: number;
  /** Optional normalized cost per candidate key (0..1). Higher = more capable. */
  cost?: Record<string, number>;
  maxAttempts?: number;
  maxSwitches?: number;
  maxEscalations?: number;
}

export interface HandbackOutcome {
  action: HandbackAction;
  candidate: RoutingCandidate | null;
  reason: string;
  category: HandbackFailureCategory;
  bounded: boolean;
}

export const DEFAULT_MAX_HANDBACK_ATTEMPTS = 4;
export const DEFAULT_MAX_HANDBACK_SWITCHES = 1;
export const DEFAULT_MAX_HANDBACK_ESCALATIONS = 1;

function pickAlternative(
  current: RoutingCandidate | null,
  eligible: RoutingCandidate[],
): RoutingCandidate | null {
  const currentKey = current ? candidateKey(current) : null;
  const others = eligible.filter((c) => candidateKey(c) !== currentKey);
  if (others.length === 0) return null;
  // Prefer a genuinely different model over another reasoning variant of the
  // same model: only a model (or cli) change is an actionable switch.
  const differentModel = current ? others.find((c) => c.model !== current.model) : others[0];
  // Deterministic: first in the filter's stable order.
  return differentModel ?? others[0];
}

function pickMostCapable(
  eligible: RoutingCandidate[],
  cost: Record<string, number> | undefined,
): RoutingCandidate | null {
  if (eligible.length === 0) return null;
  let best = eligible[0];
  let bestCost = cost?.[candidateKey(best)] ?? 0.5;
  for (const candidate of eligible.slice(1)) {
    const value = cost?.[candidateKey(candidate)] ?? 0.5;
    if (value > bestCost) {
      best = candidate;
      bestCost = value;
    }
  }
  return best;
}

/**
 * Decide how to continue after a review handback. Pure: the same input always
 * yields the same outcome.
 */
export function evaluateHandback(input: HandbackInput): HandbackOutcome {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_HANDBACK_ATTEMPTS;
  const maxSwitches = input.maxSwitches ?? DEFAULT_MAX_HANDBACK_SWITCHES;
  const maxEscalations = input.maxEscalations ?? DEFAULT_MAX_HANDBACK_ESCALATIONS;
  const category = classifyHandbackFailure(input.failureKind);

  // Infrastructure failures are never the model's fault: continue as-is.
  if (category === "infrastructure") {
    return {
      action: "continue",
      candidate: input.current,
      reason:
        "The failure was infrastructure, provider or gate setup — not the coding model — so the configuration is kept.",
      category,
      bounded: false,
    };
  }

  const hasBlockingFinding =
    input.findings.blocking || input.findings.bugs || input.findings.edgeCases;
  const categoryForFindings: HandbackFailureCategory = hasBlockingFinding ? "coding" : "none";

  if (!hasBlockingFinding) {
    return {
      action: "accept",
      candidate: input.current,
      reason: "No blocking findings on this handback; keep the current configuration.",
      category: categoryForFindings,
      bounded: false,
    };
  }

  // A blocking coding failure: switch once, then escalate once, then block.
  if (input.switches < maxSwitches) {
    const alternative = pickAlternative(input.current, input.eligible);
    if (alternative) {
      return {
        action: "switch",
        candidate: alternative,
        reason: `Blocking findings on attempt ${input.attempts + 1}; switching to a different eligible configuration.`,
        category: "coding",
        bounded: false,
      };
    }
  }

  if (input.escalations < maxEscalations) {
    const capable = pickMostCapable(input.eligible, input.cost);
    if (capable) {
      return {
        action: "escalate",
        candidate: capable,
        reason: `Blocking findings persisted (${input.switches} switch(es)); escalating to the most capable eligible configuration.`,
        category: "coding",
        bounded: false,
      };
    }
  }

  const bounded = input.attempts >= maxAttempts || input.switches >= maxSwitches;
  return {
    action: "block",
    candidate: null,
    reason:
      `Blocking findings after ${input.attempts + 1} attempt(s) with ` +
      `${input.switches} switch(es) and ${input.escalations} escalation(s); ` +
      "the retry bounds are exhausted — a human should decide.",
    category: "coding",
    bounded,
  };
}
