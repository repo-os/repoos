/**
 * Tests for the Model Playground's provider abstraction (0313): pricing math
 * and curation for each adapter, plus the registry's cache/dedupe/fail-soft
 * behavior. `global.fetch` is stubbed so nothing here hits the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeepInfraFeatured } from "../../core/providers/deepinfra";
import { curateOpenRouterModels } from "../../core/providers/openrouter";
import {
  PLAYGROUND_PROVIDERS,
  CACHE_TTL_MS,
  listPlaygroundModels,
  resetPlaygroundProviderCache,
} from "../../core/providers/index";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetPlaygroundProviderCache();
});

describe("parseDeepInfraFeatured", () => {
  it("converts cents-per-token pricing to dollars-per-million and builds the opencode run id", () => {
    const [m] = parseDeepInfraFeatured([
      {
        model_name: "zai-org/GLM-5.3-Flash",
        type: "text-generation",
        description: "Great for coding. Also handles long context well.",
        pricing: { type: "tokens", cents_per_input_token: 1.5e-5, cents_per_output_token: 5e-5 },
        max_tokens: 1_048_576,
      },
    ]);
    expect(m.id).toBe("zai-org/GLM-5.3-Flash");
    expect(m.runId).toBe("deepinfra/zai-org/GLM-5.3-Flash");
    expect(m.inputPricePerM).toBeCloseTo(0.15);
    expect(m.outputPricePerM).toBeCloseTo(0.5);
    expect(m.contextWindow).toBe(1_048_576);
    expect(m.reason).toBe("Great for coding.");
  });

  it("drops non-text-generation and non-token-priced entries", () => {
    const models = parseDeepInfraFeatured([
      { model_name: "img/model", type: "text-to-image", pricing: { type: "image_units" } },
      { model_name: "tts/model", type: "text-generation", pricing: { type: "input_character_length" } },
      { model_name: "ok/model", type: "text-generation", pricing: { type: "tokens" } },
    ]);
    expect(models.map((m) => m.id)).toEqual(["ok/model"]);
  });

  it("falls back to a generic reason when the API sends no description", () => {
    const [m] = parseDeepInfraFeatured([
      { model_name: "org/model", type: "text-generation", pricing: { type: "tokens" } },
    ]);
    expect(m.reason).toBe("Featured on DeepInfra.");
  });
});

describe("curateOpenRouterModels", () => {
  function model(overrides: Record<string, unknown>): any {
    return {
      id: "vendor/model",
      name: "Model",
      description: "A capable model for coding tasks.",
      context_length: 128_000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0.000001", completion: "0.000003" },
      ...overrides,
    };
  }

  it("converts dollar-per-token pricing to dollars-per-million", () => {
    const [m] = curateOpenRouterModels([model({})]);
    expect(m.runId).toBe("openrouter/vendor/model");
    expect(m.inputPricePerM).toBeCloseTo(1);
    expect(m.outputPricePerM).toBeCloseTo(3);
    expect(m.contextWindow).toBe(128_000);
  });

  it("excludes free-tier, non-text, zero-priced, and low-context models", () => {
    const models = curateOpenRouterModels([
      model({ id: "vendor/free-model:free", pricing: { prompt: "0", completion: "0" } }),
      model({ id: "vendor/image-model", architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] } }),
      model({ id: "vendor/zero-priced", pricing: { prompt: "0", completion: "0" } }),
      model({ id: "vendor/tiny-context", context_length: 4000 }),
      model({ id: "vendor/keeper" }),
    ]);
    expect(models.map((m) => m.id)).toEqual(["vendor/keeper"]);
  });

  it("keeps only the largest-context model per top-level namespace", () => {
    const models = curateOpenRouterModels([
      model({ id: "acme/small", context_length: 32_000 }),
      model({ id: "acme/big", context_length: 256_000 }),
      model({ id: "other/one", context_length: 64_000 }),
    ]);
    expect(models.map((m) => m.id).sort()).toEqual(["acme/big", "other/one"]);
  });
});

describe("listPlaygroundModels (registry cache)", () => {
  beforeEach(() => {
    resetPlaygroundProviderCache();
  });

  function stubFetchOnce(): ReturnType<typeof vi.fn> {
    const calls = { deepinfra: 0, openrouter: 0 };
    const fn = vi.fn(async (url: string) => {
      if (url.includes("deepinfra")) {
        calls.deepinfra++;
        return { ok: true, json: async () => [] } as Response;
      }
      calls.openrouter++;
      return { ok: true, json: async () => ({ data: [] }) } as Response;
    });
    vi.stubGlobal("fetch", fn);
    return fn as unknown as ReturnType<typeof vi.fn>;
  }

  it("hits every registered provider exactly once and caches the result", async () => {
    const fn = stubFetchOnce();
    const first = await listPlaygroundModels();
    expect(first.map((g) => g.id).sort()).toEqual(PLAYGROUND_PROVIDERS.map((p) => p.id).sort());
    expect(fn).toHaveBeenCalledTimes(PLAYGROUND_PROVIDERS.length);

    await listPlaygroundModels();
    expect(fn).toHaveBeenCalledTimes(PLAYGROUND_PROVIDERS.length); // served from cache, no new fetches
  });

  it("dedupes concurrent callers into a single in-flight fetch per provider", async () => {
    const fn = stubFetchOnce();
    await Promise.all([listPlaygroundModels(), listPlaygroundModels(), listPlaygroundModels()]);
    expect(fn).toHaveBeenCalledTimes(PLAYGROUND_PROVIDERS.length);
  });

  it("refetches once the cache TTL has elapsed", async () => {
    vi.useFakeTimers();
    const fn = stubFetchOnce();
    await listPlaygroundModels();
    expect(fn).toHaveBeenCalledTimes(PLAYGROUND_PROVIDERS.length);

    vi.advanceTimersByTime(CACHE_TTL_MS + 1000);
    await listPlaygroundModels();
    expect(fn).toHaveBeenCalledTimes(PLAYGROUND_PROVIDERS.length * 2);
  });

  it("falls back to the last good snapshot when a provider's live fetch fails", async () => {
    let fail = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("deepinfra")) {
          if (fail) throw new Error("network down");
          return {
            ok: true,
            json: async () => [
              { model_name: "org/m", type: "text-generation", pricing: { type: "tokens" } },
            ],
          } as Response;
        }
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      }),
    );
    const first = await listPlaygroundModels({ refresh: true });
    const deepinfraFirst = first.find((g) => g.id === "deepinfra")!;
    expect(deepinfraFirst.models).toHaveLength(1);
    expect(deepinfraFirst.error).toBeUndefined();

    fail = true;
    const second = await listPlaygroundModels({ refresh: true });
    const deepinfraSecond = second.find((g) => g.id === "deepinfra")!;
    expect(deepinfraSecond.models).toHaveLength(1); // stale snapshot, not an error
    expect(deepinfraSecond.error).toBeUndefined();
  });

  it("surfaces an error for a provider with no cached snapshot, without affecting the other provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("deepinfra")) throw new Error("boom");
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      }),
    );
    const groups = await listPlaygroundModels();
    const deepinfra = groups.find((g) => g.id === "deepinfra")!;
    const openrouter = groups.find((g) => g.id === "openrouter")!;
    expect(deepinfra.error).toBe("boom");
    expect(deepinfra.models).toEqual([]);
    expect(openrouter.error).toBeUndefined();
  });
});
