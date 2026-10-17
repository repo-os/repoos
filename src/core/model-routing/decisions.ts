/**
 * Persisted routing decision records (#0793).
 *
 * Every automatic/shadow decision is stored separately from the human override
 * that produced the run, so a later round can reconsider it. The record is
 * deliberately flat and JSON-safe (no Dates, no class instances) so it survives
 * a server restart unchanged and renders directly from recorded factors — the UI
 * never invents an explanation the provider did not produce.
 *
 * Pure type module: the fs-backed store lives in `decision-store.ts`.
 */
import type { RoutingCandidate } from "./candidates.js";
import type { PolicyBlockReason, PolicyFallbackReason, RoutingDecisionEvidence } from "./policy.js";
import type { RoutingAnswer, RoutingProviderId, RoutingRole, RoutingUsage } from "./types.js";

/** How the decision ended. */
export type RoutingDecisionKind = "selected" | "fallback" | "blocked" | "pinned" | "disabled";

/** The review-handback re-evaluation attached to a decision, when applicable. */
export interface HandbackDecisionRecord {
  /** continue = keep the session; switch = different model; escalate = most capable. */
  action: "continue" | "switch" | "escalate" | "accept" | "block";
  reason: string;
  /** Failure/finding classification that drove the action. */
  category: "infrastructure" | "coding" | "none";
  /** The candidate the handback chose, when the action changes the selection. */
  candidate: RoutingCandidate | null;
  attempts: number;
  switches: number;
  escalations: number;
  /** True when the action was clamped by a retry/escalation bound. */
  bounded: boolean;
}

export interface RoutingDecisionRecord {
  id: string;
  /** ISO timestamp. */
  at: string;
  taskId: string | null;
  role: RoutingRole;
  mode: "off" | "shadow" | "automatic";
  kind: RoutingDecisionKind;
  /** True only when automatic mode applied a scored selection. */
  applied: boolean;
  /** The configuration the policy chose (selected/fallback), or null on block. */
  selection: RoutingCandidate | null;
  /** The shadow recommendation, recorded even when not applied. */
  recommendation: RoutingCandidate | null;
  /** The configuration actually used for the run (human pin, base, or selection). */
  actual: RoutingCandidate | null;
  fallbackReason: PolicyFallbackReason | null;
  blockReason: PolicyBlockReason | null;
  message: string | null;
  /** Eligible candidate keys offered to the provider (stable order). */
  eligible: string[];
  /** Rejected candidates with the deterministic reason each was removed. */
  rejected: Array<{ key: string; reason: string }>;
  provider: RoutingProviderId | null;
  providerModel: string | null;
  providerUsage: RoutingUsage | null;
  /**
   * The provider's suitability probability for the selection/recommendation,
   * when it answered. Null when no answer was recorded.
   */
  selectionProbability: number | null;
  /** Recorded evidence summary from the provider's answer, for a plain explanation. */
  evidence: RoutingDecisionEvidence | null;
  /** The bounded context brief sent to the provider (for the expandable details). */
  brief: string | null;
  /** The provider's normalized answers (for the expandable details), or null. */
  answers: Record<string, RoutingAnswer> | null;
  policyVersion: string;
  durationMs: number;
  handback?: HandbackDecisionRecord;
}

/** The persisted document: a bounded, newest-first list. */
export interface RoutingDecisionDocument {
  version: 1;
  records: RoutingDecisionRecord[];
}

/** Default cap on retained decisions; older records fall off the end. */
export const MAX_ROUTING_DECISIONS = 100;

/** Candidate key for a decision's actual/selection fields, or null. */
export function decisionCandidateKey(candidate: RoutingCandidate | null): string | null {
  if (!candidate) return null;
  return `${candidate.cli}\u0000${candidate.model}\u0000${candidate.reasoning ?? ""}`;
}
