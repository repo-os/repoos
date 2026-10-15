/**
 * Provider-neutral contract for adaptive agent/model routing (#0791).
 *
 * A routing *decision provider* answers a small set of typed, atomic questions
 * about a bounded context brief and returns structured signals. The policy in
 * `policy.ts` — not the provider — turns those signals into a choice, and only
 * after deterministic candidate filtering against the human-approved budget
 * allowlist and role capabilities. Providers never see or change permissions.
 *
 * Two adapters implement this interface: TypeSafe Jev (hosted) and Cloudflare
 * Clef-Flash (self-hosted, same System One request/response contract). Switching
 * providers is a config change, never a code change.
 */

/** Which decision backend the user selected. `off` disables the router entirely. */
export type RoutingProviderId = "jev" | "clef-flash";

/**
 * Routing mode (see `[model_routing] mode`).
 * - `off`: the router is never invoked; existing selection is unchanged.
 * - `shadow`: the router runs and records a recommendation but the actual
 *   selection is always the existing configured/pinned choice.
 * - `automatic`: the recommendation is applied, within filters and limits.
 */
export type RoutingMode = "off" | "shadow" | "automatic";

/** The roles the router may be invoked for. */
export type RoutingRole = "pm" | "engineer" | "reviewer";

/** A single atomic, typed question sent to a provider. */
export type RoutingQuestion =
  | { id: string; type: "noul"; instructions: string }
  | { id: string; type: "choice"; instructions: string; criteria: Record<string, string> }
  | { id: string; type: "score"; instructions: string; criteria: string[] };

/** The bounded context brief the router decides on. Plain data, never instructions. */
export interface RoutingContextBrief {
  /** Free-form state text, already truncated to the configured budget. */
  state: string;
}

/** One provider call: a brief plus a fixed set of atomic questions. */
export interface RoutingDecisionRequest {
  brief: RoutingContextBrief;
  questions: RoutingQuestion[];
  /** Hard timeout for the call, in milliseconds. */
  timeoutMs: number;
}

/** A normalized answer for one question, regardless of provider. */
export type RoutingAnswer =
  | { id: string; type: "noul"; probability: number }
  | {
      id: string;
      type: "choice";
      choice: string;
      confidence: number | null;
      probabilities: Record<string, number>;
    }
  | {
      id: string;
      type: "score";
      score: number;
      confidence: number | null;
      probabilities: Record<string, number>;
    };

/** Provider call result. `usage` is absent when the provider reports none. */
export interface RoutingDecisionResponse {
  model: string;
  answers: Record<string, RoutingAnswer>;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
}

/**
 * A decision provider. Implementations MUST throw a typed error (never return
 * a partial/unknown shape) on transport failure, timeout, or malformed output,
 * so the policy can route to the calibrated fallback.
 */
export interface RoutingDecisionProvider {
  readonly id: RoutingProviderId;
  decide(request: RoutingDecisionRequest): Promise<RoutingDecisionResponse>;
}

/** Why a provider call failed, for typed fallback reasons. */
export type RoutingFailureKind =
  | "timeout"
  | "transport"
  | "auth"
  | "http"
  | "malformed"
  | "unsupported"
  | "not-configured";

/** Error thrown by providers with a typed reason. */
export class RoutingProviderError extends Error {
  readonly kind: RoutingFailureKind;
  constructor(kind: RoutingFailureKind, message: string) {
    super(message);
    this.name = "RoutingProviderError";
    this.kind = kind;
  }
}
