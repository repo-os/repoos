/**
 * OpenRouter provider adapter (0313). Unlike DeepInfra, the public
 * `GET /api/v1/models` endpoint lists hundreds of models with no "featured"
 * signal, so curation happens here: drop free/non-text/low-context entries,
 * then keep the single best (largest context) model per top-level namespace
 * (e.g. "qwen/…", "deepseek/…") so the sidebar shows variety instead of a
 * wall of one vendor's SKUs. Never hardcode specific model ids — the live
 * catalog changes constantly and a stale id would just silently vanish.
 */
import type { PlaygroundModel, PlaygroundProviderAdapter } from "./types.js";
import { oneLineReason, parseJsonResponse } from "./types.js";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 8000;
const MAX_MODELS = 12;
const MIN_CONTEXT_TOKENS = 32_000;

interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

function isTextModel(m: OpenRouterModel): boolean {
  const arch = m.architecture;
  if (!arch) return true;
  const input = arch.input_modalities ?? [];
  const output = arch.output_modalities ?? [];
  return input.includes("text") && output.includes("text");
}

function namespaceOf(id: string): string {
  return id.split("/")[0] ?? id;
}

/** OpenRouter prices are USD-per-token strings; $/1M tokens = price * 1,000,000. */
function dollarsPerMillion(perTokenUsd: string | undefined): number | null {
  const n = Number(perTokenUsd);
  return Number.isFinite(n) && n > 0 ? n * 1_000_000 : null;
}

/** A malformed/non-positive `context_length` isn't a usable context window. */
function positiveContextWindow(contextLength: number | undefined): number | null {
  return typeof contextLength === "number" && Number.isFinite(contextLength) && contextLength > 0
    ? contextLength
    : null;
}

/** Curate + parse OpenRouter's models response into playground models. Exported for tests. */
export function curateOpenRouterModels(models: OpenRouterModel[]): PlaygroundModel[] {
  const candidates = models.filter((m) => {
    if (!m.id || m.id.endsWith(":free")) return false;
    if (!isTextModel(m)) return false;
    const promptPrice = Number(m.pricing?.prompt ?? "0");
    if (!(promptPrice > 0)) return false;
    if ((m.context_length ?? 0) < MIN_CONTEXT_TOKENS) return false;
    return true;
  });

  const bestPerNamespace = new Map<string, OpenRouterModel>();
  for (const m of candidates) {
    const ns = namespaceOf(m.id);
    const current = bestPerNamespace.get(ns);
    if (!current || (m.context_length ?? 0) > (current.context_length ?? 0)) {
      bestPerNamespace.set(ns, m);
    }
  }

  return [...bestPerNamespace.values()]
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    .slice(0, MAX_MODELS)
    .map((m) => ({
      id: m.id,
      runId: `openrouter/${m.id}`,
      name: m.name ?? m.id,
      reason: oneLineReason(m.description, "Available through OpenRouter."),
      inputPricePerM: dollarsPerMillion(m.pricing?.prompt),
      outputPricePerM: dollarsPerMillion(m.pricing?.completion),
      contextWindow: positiveContextWindow(m.context_length),
    }));
}

export const openrouterProvider: PlaygroundProviderAdapter = {
  id: "openrouter",
  label: "OpenRouter",
  async fetchModels(): Promise<PlaygroundModel[]> {
    const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`OpenRouter API returned ${res.status}`);
    const body = await parseJsonResponse<{ data?: OpenRouterModel[] }>(res, "OpenRouter");
    if (!Array.isArray(body.data)) throw new Error("OpenRouter API returned an unexpected shape");
    return curateOpenRouterModels(body.data);
  },
};
