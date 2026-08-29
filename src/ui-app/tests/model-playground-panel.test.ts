/**
 * Component tests for ModelPlaygroundPanel.vue (0313): the sidebar must
 * actually render the fetched model catalog (regression for a bug where a
 * provider error — e.g. a raw JSON-parse exception embedding a snippet of an
 * HTML block page — replaced the list instead of showing alongside it), and
 * the core interactions (selecting a model, sending a starter prompt) must
 * wire through to the chat API with the right payload. 0319 adds the
 * search / provider / token-cost filters, which must compose and never
 * hide provider error groups.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ModelPlaygroundPanel from "../src/components/ModelPlaygroundPanel.vue";
import type { PlaygroundProviderGroup } from "../src/types";

function deepinfraGroup(overrides: Partial<PlaygroundProviderGroup> = {}): PlaygroundProviderGroup {
  return {
    id: "deepinfra",
    label: "DeepInfra",
    fetchedAt: new Date().toISOString(),
    models: [
      {
        id: "zai-org/GLM-5.3-Flash",
        runId: "deepinfra/zai-org/GLM-5.3-Flash",
        name: "zai-org/GLM-5.3-Flash",
        reason: "GLM-5.3-Flash is a native multimodal model from Z.ai.",
        inputPricePerM: 0.15,
        outputPricePerM: 0.5,
        contextWindow: 1_048_576,
      },
      {
        id: "moonshotai/Kimi-K3",
        runId: "deepinfra/moonshotai/Kimi-K3",
        name: "moonshotai/Kimi-K3",
        reason: "Kimi K3 is a 2.8T-parameter open-weight multimodal reasoning model.",
        inputPricePerM: 2.85,
        outputPricePerM: 14.25,
        contextWindow: 1_048_576,
      },
    ],
    ...overrides,
  };
}

function openrouterGroup(
  overrides: Partial<PlaygroundProviderGroup> = {},
): PlaygroundProviderGroup {
  return {
    id: "openrouter",
    label: "OpenRouter",
    fetchedAt: new Date().toISOString(),
    models: [
      {
        id: "meta-llama/Llama-4-Maverick",
        runId: "openrouter/meta-llama/Llama-4-Maverick",
        name: "meta-llama/Llama-4-Maverick",
        reason: "Llama 4 Maverick is a cheap general-purpose workhorse.",
        inputPricePerM: 0.2,
        outputPricePerM: 0.6,
        contextWindow: 1_048_576,
      },
    ],
    ...overrides,
  };
}

function stubModelsFetch(providers: PlaygroundProviderGroup[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/playground/models")) {
      return {
        ok: true,
        json: async () => ({ providers, at: new Date().toISOString() }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModelPlaygroundPanel — model list rendering", () => {
  it("renders every fetched model as a card, grouped under its provider label", async () => {
    stubModelsFetch([deepinfraGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".playground-provider-label").text()).toBe("DeepInfra");
    const cards = wrapper.findAll(".playground-model-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].find(".playground-model-name").text()).toBe("zai-org/GLM-5.3-Flash");
    expect(cards[0].find(".playground-model-reason").text()).toContain("native multimodal model");
    expect(cards[0].text()).toContain("$0.150");
    expect(cards[0].text()).toContain("1M ctx");
  });

  it("auto-selects the first model and shows it as active in the chat header", async () => {
    stubModelsFetch([deepinfraGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".playground-active-info strong").text()).toBe("zai-org/GLM-5.3-Flash");
    expect(wrapper.find(".playground-model-card.active").text()).toContain("zai-org/GLM-5.3-Flash");
  });

  it("still renders the healthy provider's models when a sibling provider errors", async () => {
    // Regression: a provider error must not blank out the whole sidebar —
    // each provider group renders independently.
    stubModelsFetch([
      deepinfraGroup(),
      {
        id: "openrouter",
        label: "OpenRouter",
        models: [],
        fetchedAt: new Date().toISOString(),
        error: "OpenRouter returned a non-JSON response (text/html)",
      },
    ]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    expect(wrapper.findAll(".playground-model-card")).toHaveLength(2);
    expect(wrapper.find(".playground-provider-error").text()).toBe(
      "OpenRouter returned a non-JSON response (text/html)",
    );
    // The error text must never be injected as markup — it's plain interpolation.
    expect(wrapper.find(".playground-provider-error").html()).not.toContain("<!DOCTYPE");
  });

  it("shows a clean loadError message (not raw markup) when the catalog request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        statusText: "Bad Gateway",
        json: async () => ({ error: "playground catalog unavailable" }),
      })),
    );
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".playground-error").text()).toBe("playground catalog unavailable");
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(0);
  });
});

describe("ModelPlaygroundPanel — interaction", () => {
  it("selecting a different model resets the conversation and updates the active header", async () => {
    stubModelsFetch([deepinfraGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    const cards = wrapper.findAll(".playground-model-card");
    await cards[1].trigger("click");
    await nextTick();

    expect(wrapper.find(".playground-active-info strong").text()).toBe("moonshotai/Kimi-K3");
    expect(wrapper.find(".playground-welcome strong").text()).toBe("Try moonshotai/Kimi-K3");
  });

  it("clicking a starter prompt sends it to the chat endpoint with the selected model's runId", async () => {
    const fetchMock = stubModelsFetch([deepinfraGroup()]);
    fetchMock.mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url.includes("/api/playground/models")) {
        return {
          ok: true,
          json: async () => ({ providers: [deepinfraGroup()], at: new Date().toISOString() }),
        } as Response;
      }
      if (url.includes("/api/playground/chat")) {
        const body = JSON.parse(String(opts?.body));
        expect(body.runId).toBe("deepinfra/zai-org/GLM-5.3-Flash");
        expect(body.messages).toEqual([{ role: "user", text: "What's this repo about?" }]);
        return { ok: true, json: async () => ({ ok: true, text: "It's RepoOS." }) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    await wrapper.find(".playground-starters button").trigger("click");
    await flushPromises();
    await nextTick();

    const bubbles = wrapper.findAll(".playground-bubble");
    expect(bubbles[0].text()).toBe("What's this repo about?");
    expect(bubbles[1].text()).toBe("It's RepoOS.");
  });

  it("shows a send error without crashing when the chat request fails", async () => {
    const fetchMock = stubModelsFetch([deepinfraGroup()]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/playground/models")) {
        return {
          ok: true,
          json: async () => ({ providers: [deepinfraGroup()], at: new Date().toISOString() }),
        } as Response;
      }
      return {
        ok: false,
        statusText: "Bad Gateway",
        json: async () => ({ error: "the model returned no output" }),
      } as Response;
    });

    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    await wrapper.find(".playground-starters button").trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".playground-send-error").text()).toBe("the model returned no output");
  });
});

describe("ModelPlaygroundPanel — loading state and session controls", () => {
  it("shows skeleton cards while the catalog is loading, before any model exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const wrapper = mount(ModelPlaygroundPanel);
    await nextTick();

    expect(wrapper.findAll(".playground-skeleton")).toHaveLength(3);
    expect(wrapper.find(".playground-model-card").exists()).toBe(false);
  });

  it("offers a clear-chat action once a conversation exists, and clears it", async () => {
    const fetchMock = stubModelsFetch([deepinfraGroup()]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/playground/models")) {
        return {
          ok: true,
          json: async () => ({ providers: [deepinfraGroup()], at: new Date().toISOString() }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true, text: "It's RepoOS." }) } as Response;
    });

    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();
    expect(wrapper.find(".playground-clear").exists()).toBe(false);

    await wrapper.find(".playground-starters button").trigger("click");
    await flushPromises();
    await nextTick();

    expect(wrapper.find(".playground-clear").exists()).toBe(true);
    await wrapper.find(".playground-clear").trigger("click");
    await nextTick();

    expect(wrapper.findAll(".playground-bubble")).toHaveLength(0);
    expect(wrapper.find(".playground-clear").exists()).toBe(false);
    expect(wrapper.find(".playground-welcome").exists()).toBe(true);
  });

  it("shows a friendly error (never the raw JSON parse message) when a 200 response is not JSON", async () => {
    // The 0313 preview bug: a stale server answered `/api/playground/models`
    // with the SPA's index.html; parsing it as JSON must not leak the parser
    // error into the sidebar.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`);
        },
      })),
    );
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    const err = wrapper.find(".playground-error").text();
    expect(err).toContain("non-JSON");
    expect(err).not.toContain("Unexpected token");
    expect(err).not.toContain("<!DOCTYPE");
  });
});

describe("ModelPlaygroundPanel — filtering", () => {
  it("searches the model list by name in real time", async () => {
    stubModelsFetch([deepinfraGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(2);

    await wrapper.find(".playground-search").setValue("KIMI");
    await nextTick();
    let names = wrapper.findAll(".playground-model-name");
    expect(names).toHaveLength(1);
    expect(names[0].text()).toBe("moonshotai/Kimi-K3");

    await wrapper.find(".playground-search").setValue("");
    await nextTick();
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(2);
  });

  it("filters by provider via the dropdown, with All providers as the default", async () => {
    stubModelsFetch([deepinfraGroup(), openrouterGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    expect(wrapper.findAll(".playground-model-card")).toHaveLength(3);
    expect(wrapper.findAll(".playground-provider-label").map((l) => l.text())).toEqual([
      "DeepInfra",
      "OpenRouter",
    ]);

    await wrapper.find(".playground-provider-select").setValue("openrouter");
    await nextTick();
    expect(wrapper.findAll(".playground-provider-label").map((l) => l.text())).toEqual([
      "OpenRouter",
    ]);
    expect(wrapper.findAll(".playground-model-name").map((n) => n.text())).toEqual([
      "meta-llama/Llama-4-Maverick",
    ]);

    await wrapper.find(".playground-provider-select").setValue("");
    await nextTick();
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(3);
  });

  it("hides models whose token cost exceeds the selected max-cost threshold", async () => {
    stubModelsFetch([deepinfraGroup(), openrouterGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    await wrapper.find(".playground-cost-select").setValue("1");
    await nextTick();
    let names = wrapper.findAll(".playground-model-name").map((n) => n.text());
    expect(names).toContain("zai-org/GLM-5.3-Flash");
    expect(names).toContain("meta-llama/Llama-4-Maverick");
    expect(names).not.toContain("moonshotai/Kimi-K3");

    await wrapper.find(".playground-cost-select").setValue("10");
    await nextTick();
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(3);

    await wrapper.find(".playground-cost-select").setValue("");
    await nextTick();
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(3);
  });

  it("keeps models with unknown prices visible under a cost threshold", async () => {
    stubModelsFetch([
      openrouterGroup({
        models: [
          {
            id: "unknown/mystery-model",
            runId: "openrouter/unknown/mystery-model",
            name: "unknown/mystery-model",
            reason: "Pricing not published yet.",
            inputPricePerM: null,
            outputPricePerM: null,
            contextWindow: null,
          },
        ],
      }),
    ]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    await wrapper.find(".playground-cost-select").setValue("0.5");
    await nextTick();
    expect(wrapper.findAll(".playground-model-name").map((n) => n.text())).toEqual([
      "unknown/mystery-model",
    ]);
  });

  it("composes search, provider, and cost filters, and can clear them", async () => {
    stubModelsFetch([deepinfraGroup(), openrouterGroup()]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    await wrapper.find(".playground-provider-select").setValue("deepinfra");
    await wrapper.find(".playground-cost-select").setValue("1");
    await nextTick();
    expect(wrapper.findAll(".playground-model-name").map((n) => n.text())).toEqual([
      "zai-org/GLM-5.3-Flash",
    ]);

    await wrapper.find(".playground-search").setValue("Maverick");
    await nextTick();
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(0);
    expect(wrapper.find(".playground-no-match").text()).toContain("No models match your filters.");

    await wrapper.find(".playground-filter-clear").trigger("click");
    await nextTick();
    expect(wrapper.find(".playground-no-match").exists()).toBe(false);
    expect(wrapper.findAll(".playground-model-card")).toHaveLength(3);
  });

  it("still shows a provider error group when filters hide other providers' models", async () => {
    stubModelsFetch([
      deepinfraGroup(),
      {
        id: "together",
        label: "Together",
        models: [],
        fetchedAt: new Date().toISOString(),
        error: "Together is down",
      },
    ]);
    const wrapper = mount(ModelPlaygroundPanel);
    await flushPromises();
    await nextTick();

    await wrapper.find(".playground-cost-select").setValue("1");
    await nextTick();
    expect(wrapper.findAll(".playground-provider-label").map((l) => l.text())).toEqual([
      "DeepInfra",
      "Together",
    ]);
    expect(wrapper.find(".playground-provider-error").text()).toBe("Together is down");
  });
});
