/**
 * DeepInfra provider adapter (0313). DeepInfra's "featured" endpoint is a
 * public, unauthenticated JSON list that already curates a small set of
 * attractive models with a human-written `description` — exactly the "worth
 * trying" + "one-line reason" shape the playground sidebar needs, with no
 * curation logic of our own required.
 */
import type { PlaygroundModel, PlaygroundProviderAdapter } from "./types.js";
import { oneLineReason, parseJsonResponse } from "./types.js";

const FEATURED_URL = "https://api.deepinfra.com/models/featured";
const FETCH_TIMEOUT_MS = 8000;
const MAX_MODELS = 12;

interface DeepInfraModel {
  model_name: string;
  type: string;
  description?: string;
  pricing?: {
    type?: string;
    cents_per_input_token?: number;
    cents_per_output_token?: number;
  };
  max_tokens?: number;
}

/** DeepInfra prices in cents-per-token; $/1M tokens = cents-per-token * 10,000. */
function dollarsPerMillion(centsPerToken: number | undefined): number | null {
  return typeof centsPerToken === "number" && Number.isFinite(centsPerToken) && centsPerToken >= 0
    ? centsPerToken * 10_000
    : null;
}

/** A malformed/negative `max_tokens` isn't a usable context window. */
function positiveContextWindow(maxTokens: number | undefined): number | null {
  return typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0
    ? maxTokens
    : null;
}

/** Parse DeepInfra's featured-models response into playground models. Exported for tests. */
export function parseDeepInfraFeatured(models: DeepInfraModel[]): PlaygroundModel[] {
  return models
    .filter((m) => m.type === "text-generation" && m.pricing?.type === "tokens")
    .slice(0, MAX_MODELS)
    .map((m) => ({
      id: m.model_name,
      runId: `deepinfra/${m.model_name}`,
      name: m.model_name,
      reason: oneLineReason(m.description, "Featured on DeepInfra."),
      inputPricePerM: dollarsPerMillion(m.pricing?.cents_per_input_token),
      outputPricePerM: dollarsPerMillion(m.pricing?.cents_per_output_token),
      contextWindow: positiveContextWindow(m.max_tokens),
    }));
}

export const deepinfraProvider: PlaygroundProviderAdapter = {
  id: "deepinfra",
  label: "DeepInfra",
  async fetchModels(): Promise<PlaygroundModel[]> {
    const res = await fetch(FEATURED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`DeepInfra API returned ${res.status}`);
    const data = await parseJsonResponse<DeepInfraModel[]>(res, "DeepInfra");
    if (!Array.isArray(data)) throw new Error("DeepInfra API returned an unexpected shape");
    return parseDeepInfraFeatured(data);
  },
};
