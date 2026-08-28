/**
 * Component tests for ModelPlaygroundPanel.vue (0313): the sidebar must
 * actually render the fetched model catalog (regression for a bug where a
 * provider error — e.g. a raw JSON-parse exception embedding a snippet of an
 * HTML block page — replaced the list instead of showing alongside it), and
 * the core interactions (selecting a model, sending a starter prompt) must
 * wire through to the chat API with the right payload.
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

function stubModelsFetch(providers: PlaygroundProviderGroup[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/playground/models")) {
      return { ok: true, json: async () => ({ providers, at: new Date().toISOString() }) } as Response;
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
      { id: "openrouter", label: "OpenRouter", models: [], fetchedAt: new Date().toISOString(), error: "OpenRouter returned a non-JSON response (text/html)" },
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
      vi.fn(async () => ({ ok: false, statusText: "Bad Gateway", json: async () => ({ error: "playground catalog unavailable" }) })),
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
        return { ok: true, json: async () => ({ providers: [deepinfraGroup()], at: new Date().toISOString() }) } as Response;
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
        return { ok: true, json: async () => ({ providers: [deepinfraGroup()], at: new Date().toISOString() }) } as Response;
      }
      return { ok: false, statusText: "Bad Gateway", json: async () => ({ error: "the model returned no output" }) } as Response;
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
