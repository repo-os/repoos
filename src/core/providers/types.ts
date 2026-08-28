/**
 * Provider abstraction for the Model Playground (0313). Each adapter knows
 * how to turn one external catalog (DeepInfra, OpenRouter, …) into a small
 * curated list of "worth trying" models with pricing and context window.
 * Adding a provider is a one-file change: implement `fetchModels` and
 * register it in `PLAYGROUND_PROVIDERS` (see ./index.ts).
 */

/** One model worth trying, enriched with pricing/context from its provider. */
export interface PlaygroundModel {
  /** The id as understood by the provider's own API, e.g. "zai-org/GLM-5.3-Flash". */
  id: string;
  /** The opencode-runnable id: `${providerId}/${id}`, passed as `--model`. */
  runId: string;
  /** Display name. */
  name: string;
  /** One-line reason this model is worth trying. */
  reason: string;
  /** USD per 1M input tokens, or null when the provider doesn't report it. */
  inputPricePerM: number | null;
  /** USD per 1M output tokens, or null when the provider doesn't report it. */
  outputPricePerM: number | null;
  /** Context window in tokens, or null when unknown. */
  contextWindow: number | null;
}

/** A per-provider catalog adapter. `fetchModels` should throw on failure — the registry handles caching/fallback. */
export interface PlaygroundProviderAdapter {
  /** Stable id, matches the opencode provider prefix (e.g. "deepinfra"). */
  id: string;
  /** Display label, e.g. "DeepInfra". */
  label: string;
  fetchModels(): Promise<PlaygroundModel[]>;
}

/** Result shape served to the client for one provider. */
export interface PlaygroundProviderGroup {
  id: string;
  label: string;
  models: PlaygroundModel[];
  /** Set when the live fetch failed and no cached snapshot could cover for it. */
  error?: string;
  fetchedAt: string;
}

/** Trim a description down to its first sentence for a compact "reason" line. */
export function oneLineReason(description: string | undefined | null, fallback: string): string {
  const text = (description ?? "").trim();
  if (!text) return fallback;
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}...` : firstSentence;
}

/**
 * Parse a fetch `Response` as JSON on behalf of a provider adapter.
 *
 * A blocked/rate-limited request often comes back `ok: true` with an HTML
 * block page instead of the expected JSON body. Calling `res.json()` directly
 * on that throws a `SyntaxError` whose message embeds a raw snippet of the
 * HTML (e.g. `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`) — that
 * snippet then propagates untouched into `PlaygroundProviderGroup.error` and
 * renders in the sidebar in place of the model list. Checking content-type
 * first, and falling back to a clean message if parsing still fails, keeps
 * every error shown to the user readable text instead of a chunk of markup.
 */
export async function parseJsonResponse<T>(res: Response, providerLabel: string): Promise<T> {
  const contentType = res.headers?.get("content-type") ?? "";
  if (contentType && !contentType.includes("json")) {
    throw new Error(`${providerLabel} returned a non-JSON response (${contentType || "unknown content type"})`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${providerLabel} returned a response that could not be parsed as JSON`);
  }
}
