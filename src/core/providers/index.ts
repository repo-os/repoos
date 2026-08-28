/**
 * Registry + cache for the Model Playground's provider adapters (0313).
 *
 * Cache/rate-limit-aware fetching: each provider's live result is cached for
 * CACHE_TTL_MS so a busy Agents page doesn't hammer DeepInfra/OpenRouter on
 * every load; concurrent callers during a cold/expired cache share one
 * in-flight fetch instead of firing duplicate requests. A transient fetch
 * failure falls back to the last good snapshot when one exists, so a single
 * provider outage never blanks the whole sidebar — only a cold-cache failure
 * surfaces as an error to the client, and it never takes the other provider
 * down with it (each adapter is isolated in its own try/catch).
 */
import type { PlaygroundProviderAdapter, PlaygroundProviderGroup } from "./types.js";
import { deepinfraProvider } from "./deepinfra.js";
import { openrouterProvider } from "./openrouter.js";

export * from "./types.js";
export { parseDeepInfraFeatured } from "./deepinfra.js";
export { curateOpenRouterModels } from "./openrouter.js";

export const PLAYGROUND_PROVIDERS: PlaygroundProviderAdapter[] = [deepinfraProvider, openrouterProvider];

export const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  at: number;
  group: PlaygroundProviderGroup;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<PlaygroundProviderGroup>>();

/** Test-only hook to reset module-level cache state between test cases. */
export function resetPlaygroundProviderCache(): void {
  cache.clear();
  inFlight.clear();
}

async function loadProvider(adapter: PlaygroundProviderAdapter, refresh: boolean): Promise<PlaygroundProviderGroup> {
  const cached = cache.get(adapter.id);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.group;

  const existing = inFlight.get(adapter.id);
  if (existing) return existing;

  const promise = (async (): Promise<PlaygroundProviderGroup> => {
    try {
      const models = await adapter.fetchModels();
      const group: PlaygroundProviderGroup = {
        id: adapter.id,
        label: adapter.label,
        models,
        fetchedAt: new Date().toISOString(),
      };
      cache.set(adapter.id, { at: Date.now(), group });
      return group;
    } catch (err) {
      if (cached) return cached.group;
      const reason = err instanceof Error ? err.message : String(err);
      return { id: adapter.id, label: adapter.label, models: [], error: reason, fetchedAt: new Date().toISOString() };
    } finally {
      inFlight.delete(adapter.id);
    }
  })();
  inFlight.set(adapter.id, promise);
  return promise;
}

/** Fetch (or serve cached) model catalogs from every registered provider. Never throws. */
export async function listPlaygroundModels(opts: { refresh?: boolean } = {}): Promise<PlaygroundProviderGroup[]> {
  return Promise.all(PLAYGROUND_PROVIDERS.map((p) => loadProvider(p, opts.refresh ?? false)));
}
