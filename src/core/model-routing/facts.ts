/**
 * Model and project-history facts for the routing decision (#0812).
 *
 * The decision model used to get a candidate list labelled only
 * `cli / model / reasoning`. This module assembles the facts a routing decision
 * can actually use: published model metadata (price per million tokens,
 * context window, billing kind) and the project's own history for that
 * candidate and role.
 *
 * Two sources, kept deliberately separate:
 *
 * - **Provider metadata.** `PROVIDER_MODEL_METADATA` is a curated, dated
 *   snapshot of what provider catalogs publish (prices from opencode's catalog,
 *   conservatively floored context windows). Callers may layer a live catalog
 *   over it via `metadata` on `resolveCandidateFacts`. Nothing here is fetched
 *   at decision time — a decision must never block on the network.
 * - **Project history.** Success/failure rate, average tokens, turns, cost and
 *   review passes are read from the project's own sessions data (see
 *   `src/server/candidate-history.ts`) and passed in resolved. This module only
 *   formats them.
 *
 * Benchmark data, when added, belongs in this same dated file so a decision can
 * always be traced back to the snapshot it was made against.
 *
 * Pure and node-free: trivially unit-testable, no filesystem or network.
 */
import type { RoutingCandidate } from "./candidates.js";

/** When the curated metadata below was last reviewed. */
export const MODEL_FACTS_AS_OF = "2026-10-17";

/** How a candidate's usage is billed. Unknown when the harness is not listed. */
export type BillingKind = "subscription" | "payg";

/** Provider-published metadata for one model. */
export interface ModelMetadata {
  /** USD per 1M input tokens, or null when the provider does not publish one. */
  inputPricePerM: number | null;
  /** USD per 1M output tokens, or null when the provider does not publish one. */
  outputPricePerM: number | null;
  /** USD per 1M cached-read input tokens (OpenRouter), or null. */
  cacheReadPricePerM: number | null;
  /** Maximum context window in tokens, or null when unknown. */
  contextWindow: number | null;
  /** Provenance for the row, so a stale value is traceable. */
  source: string;
}

/** Normalize a model id for lookup: drop a `provider/` prefix, lowercase, trim. */
export function normalizeModelId(model: string): string {
  const m = model.trim().toLowerCase();
  const slash = m.lastIndexOf("/");
  return slash >= 0 ? m.slice(slash + 1) : m;
}

const OPENCODE_CATALOG = `opencode model catalog (docs/opencode-models.md)`;

/**
 * Curated snapshot of provider model metadata, keyed by normalized model id.
 *
 * Prices are USD per 1M tokens and are approximate — providers change them
 * without notice (the catalog these came from is itself labelled approximate).
 * Context windows are only set where the value is well established; when null,
 * the harness floor from `HarnessAvailability.maxContextTokens` is used instead.
 * When adding an entry, add `source` and bump {@link MODEL_FACTS_AS_OF}.
 */
export const PROVIDER_MODEL_METADATA: Record<string, ModelMetadata> = {
  "gpt-5": {
    inputPricePerM: 1.25,
    outputPricePerM: 10,
    cacheReadPricePerM: 0.125,
    contextWindow: 400_000,
    source: OPENCODE_CATALOG,
  },
  "gpt-5-mini": {
    inputPricePerM: 0.25,
    outputPricePerM: 2,
    cacheReadPricePerM: 0.025,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "gpt-5-nano": {
    inputPricePerM: 0.05,
    outputPricePerM: 0.4,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "gpt-5.4": {
    inputPricePerM: 2.5,
    outputPricePerM: 15,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "gpt-5.5": {
    inputPricePerM: 5,
    outputPricePerM: 30,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "gpt-5.6": {
    inputPricePerM: 5,
    outputPricePerM: 30,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "claude-haiku-4-5": {
    inputPricePerM: 1,
    outputPricePerM: 5,
    cacheReadPricePerM: 0.1,
    contextWindow: 200_000,
    source: OPENCODE_CATALOG,
  },
  "claude-sonnet-4": {
    inputPricePerM: 3,
    outputPricePerM: 15,
    cacheReadPricePerM: 0.3,
    contextWindow: 200_000,
    source: OPENCODE_CATALOG,
  },
  "claude-sonnet-5": {
    inputPricePerM: 2,
    outputPricePerM: 10,
    cacheReadPricePerM: 0.2,
    contextWindow: 200_000,
    source: OPENCODE_CATALOG,
  },
  "claude-opus-4-5": {
    inputPricePerM: 5,
    outputPricePerM: 25,
    cacheReadPricePerM: 0.5,
    contextWindow: 200_000,
    source: OPENCODE_CATALOG,
  },
  "claude-opus-5": {
    inputPricePerM: 5,
    outputPricePerM: 25,
    cacheReadPricePerM: 0.5,
    contextWindow: 200_000,
    source: OPENCODE_CATALOG,
  },
  "deepseek-v4-flash": {
    inputPricePerM: 0.14,
    outputPricePerM: 0.28,
    cacheReadPricePerM: 0.014,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "deepseek-v4-pro": {
    inputPricePerM: 1.74,
    outputPricePerM: 3.84,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "glm-5": {
    inputPricePerM: 1,
    outputPricePerM: 3.2,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "grok-4.5": {
    inputPricePerM: 2,
    outputPricePerM: 6,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "minimax-m3": {
    inputPricePerM: 0.3,
    outputPricePerM: 1.2,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
  "qwen3.5-plus": {
    inputPricePerM: 0.2,
    outputPricePerM: 1.2,
    cacheReadPricePerM: null,
    contextWindow: null,
    source: OPENCODE_CATALOG,
  },
};

/** Look up curated metadata for a model id, normalizing the id first. */
export function lookupModelMetadata(model: string): ModelMetadata | null {
  return PROVIDER_MODEL_METADATA[normalizeModelId(model)] ?? null;
}

/**
 * Whether a harness is billed by subscription or per token. Unknown CLIs (and
 * "default") stay null rather than guessing.
 */
export const HARNESS_BILLING: Record<string, BillingKind> = {
  "claude code": "subscription",
  codex: "subscription",
  "github copilot": "subscription",
  cursor: "subscription",
  kiro: "subscription",
  antigravity: "subscription",
  opencode: "payg",
  "qwen code": "payg",
  crush: "payg",
  pi: "payg",
};

export function billingForCli(cli: string): BillingKind | null {
  return HARNESS_BILLING[cli.trim().toLowerCase()] ?? null;
}

/**
 * Conservative decision-model context windows, keyed by
 * `provider\u0000normalizedModel` and by `normalizedModel`.
 *
 * These are floors used only when no provider metadata is supplied — a
 * decision must be bounded even without a live catalog. A caller that has the
 * provider's real window (an injected catalog) always wins. Unknown models fall
 * back to {@link DEFAULT_BRIEF_CONTEXT_TOKENS} at the call site.
 */
export const DECISION_MODEL_CONTEXT_TOKENS: Record<string, number> = {
  "jev\u0000jev-latest": 128_000,
  "openrouter\u0000jev-latest": 128_000,
  "clef-flash\u0000cloudflare/clef-flash": 131_072,
};

/**
 * Resolve the decision model's context window in tokens, or null when unknown.
 * Precedence: explicit override → injected provider metadata → curated table →
 * curated model metadata.
 */
export function resolveDecisionContextTokens(
  provider: string | null,
  model: string | null,
  opts: { override?: number | null; metadata?: Record<string, ModelMetadata> } = {},
): number | null {
  if (opts.override != null && Number.isFinite(opts.override) && opts.override > 0) {
    return Math.floor(opts.override);
  }
  if (!model) return null;
  const raw = model.trim().toLowerCase();
  const normalized = normalizeModelId(model);
  // Prefer the most specific key: provider-qualified raw id, then provider +
  // normalized, then the raw id, then the normalized id.
  const keys = [
    provider ? `${provider}\u0000${raw}` : null,
    provider ? `${provider}\u0000${normalized}` : null,
    raw,
    normalized,
  ].filter((k): k is string => !!k && k.length > 0);
  for (const key of keys) {
    const injected = opts.metadata?.[key]?.contextWindow;
    if (injected != null && injected > 0) return Math.floor(injected);
    const curated = DECISION_MODEL_CONTEXT_TOKENS[key];
    if (curated != null && curated > 0) return curated;
  }
  const meta = opts.metadata?.[normalized] ?? PROVIDER_MODEL_METADATA[normalized];
  return meta?.contextWindow ?? null;
}

/** The project's own history for one candidate in one role. */
export interface ProjectRoleHistory {
  /** Completed runs (sessions) recorded for this candidate + role. */
  runs: number;
  /** Share of runs that finished without error, 0..1, or null when no runs. */
  successRate: number | null;
  /** 1 - successRate, or null. */
  failureRate: number | null;
  /** Mean total tokens per run, or null when the CLI reported none. */
  avgTokens: number | null;
  /** Mean model round-trips per run, or null. */
  avgTurns: number | null;
  /** Mean reported cost per run in USD, or null when unreported. */
  avgCostUsd: number | null;
  /** Mean review passes per task this candidate worked on, or null. */
  avgReviewPasses: number | null;
}

/** One candidate's resolved facts. Unknown fields stay null and are omitted. */
export interface CandidateFacts {
  candidate: RoutingCandidate;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  cacheReadPricePerM: number | null;
  contextTokens: number | null;
  billing: BillingKind | null;
  history: ProjectRoleHistory | null;
}

export interface ResolveCandidateFactsInput {
  candidate: RoutingCandidate;
  /** Provider metadata for this model, when available. */
  metadata?: ModelMetadata | null;
  /** Harness context floor from `HarnessAvailability.maxContextTokens`. */
  harnessContextTokens?: number | null;
  /** Billing kind for the harness, when known. */
  billing?: BillingKind | null;
  /** Project history for this candidate + role, when known. */
  history?: ProjectRoleHistory | null;
}

/** Merge whatever facts are known for one candidate; never invents a value. */
export function resolveCandidateFacts(input: ResolveCandidateFactsInput): CandidateFacts {
  const meta = input.metadata ?? lookupModelMetadata(input.candidate.model);
  const contextTokens =
    meta?.contextWindow ??
    (input.harnessContextTokens && input.harnessContextTokens > 0
      ? input.harnessContextTokens
      : null);
  return {
    candidate: input.candidate,
    inputPricePerM: meta?.inputPricePerM ?? null,
    outputPricePerM: meta?.outputPricePerM ?? null,
    cacheReadPricePerM: meta?.cacheReadPricePerM ?? null,
    contextTokens,
    billing: input.billing ?? billingForCli(input.candidate.cli),
    history: input.history && input.history.runs > 0 ? input.history : null,
  };
}

/** "200k", "1M", "128k" — a compact, readable token count. */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(Math.round(tokens));
}

function formatPrice(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Compact history line, or null when there is nothing known. */
export function formatHistory(history: ProjectRoleHistory): string | null {
  if (history.runs <= 0) return null;
  const parts: string[] = [`${history.runs} run${history.runs === 1 ? "" : "s"}`];
  if (history.successRate != null) parts.push(`${formatPct(history.successRate)} pass`);
  if (history.avgTokens != null) parts.push(`avg ${formatTokenCount(history.avgTokens)} tokens`);
  if (history.avgTurns != null) parts.push(`${history.avgTurns.toFixed(1)} turns`);
  if (history.avgCostUsd != null) parts.push(`$${history.avgCostUsd.toFixed(2)}/run`);
  if (history.avgReviewPasses != null)
    parts.push(`${history.avgReviewPasses.toFixed(1)} review passes`);
  return parts.join(", ");
}

/**
 * The fact line appended to a candidate's label: price, context, billing and
 * project history, with every unknown field omitted (never rendered empty).
 * Returns null when nothing is known.
 */
export function candidateFactLine(facts: CandidateFacts): string | null {
  const parts: string[] = [];
  const { inputPricePerM: inP, outputPricePerM: outP } = facts;
  if (inP != null || outP != null) {
    const input = inP != null ? formatPrice(inP) : "?";
    const output = outP != null ? formatPrice(outP) : "?";
    // The cached-input rate (OpenRouter) is the effective price for a run that
    // reuses the prompt prefix, so surface it beside the list prices.
    const cache =
      facts.cacheReadPricePerM != null ? `, cache ${formatPrice(facts.cacheReadPricePerM)}` : "";
    parts.push(`price ${input}/${output} per 1M${cache}`);
  }
  if (facts.contextTokens != null) parts.push(`context ${formatTokenCount(facts.contextTokens)}`);
  if (facts.billing === "subscription") parts.push("subscription");
  else if (facts.billing === "payg") parts.push("pay-as-you-go");
  if (facts.history) {
    const line = formatHistory(facts.history);
    if (line) parts.push(`history: ${line}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Token usage for an effective-cost estimate. */
export interface CostUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache, when reported. */
  cacheReadTokens?: number;
}

/**
 * Effective cost in USD for one run, applying the cache-read rate when the
 * provider publishes one (OpenRouter) and the harness reported cached tokens.
 * Returns null when a required price is unknown — never estimates.
 */
export function effectiveCostUsd(facts: CandidateFacts, usage: CostUsage): number | null {
  const { inputPricePerM, outputPricePerM } = facts;
  if (inputPricePerM == null || outputPricePerM == null) return null;
  const cached = Math.max(0, Math.min(usage.cacheReadTokens ?? 0, usage.inputTokens));
  const uncached = Math.max(0, usage.inputTokens - cached);
  const cacheRate = facts.cacheReadPricePerM ?? inputPricePerM;
  const inputCost = (uncached * inputPricePerM + cached * cacheRate) / 1_000_000;
  const outputCost = (usage.outputTokens * outputPricePerM) / 1_000_000;
  return inputCost + outputCost;
}
