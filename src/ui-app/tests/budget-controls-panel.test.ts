/**
 * #0764 — the Budget Controls tab and its allowlist panel: collapsed-by-default
 * rows with counts, expansion, the empty-state copy, and the deep-linkable tab.
 */
import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import BudgetControlsPanel from "../src/components/BudgetControlsPanel.vue";
import AgentsView from "../src/views/AgentsView.vue";
import { useConfigStore } from "../src/stores/config";

function seedConfig(data: Record<string, unknown> | null): ReturnType<typeof useConfigStore> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  config.agentsMeta = {
    clis: ["opencode", "claude code"],
    models: ["default", "big pickle", "deepseek v4"],
    defaults: [],
    skills: [],
  };
  config.data = data;
  config.loaded = true;
  return config;
}

describe("BudgetControlsPanel (#0764)", () => {
  it("lists agents collapsed by default with a model count", () => {
    seedConfig({
      "budget.allowlist": [
        { cli: "claude code", models: ["sonnet", "opus"] },
        { cli: "opencode", models: ["big pickle"] },
      ],
    });
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    const rows = wrapper.findAll(".budget-row");
    expect(rows).toHaveLength(2);
    // Collapsed: no model chips, but the count is visible.
    expect(wrapper.find(".budget-models").exists()).toBe(false);
    expect(rows[0]!.find(".budget-count").text()).toContain("2 models");
    expect(rows[1]!.find(".budget-count").text()).toContain("1 model");
    wrapper.unmount();
  });

  it("expands a row to reveal its models and collapses again", async () => {
    seedConfig({ "budget.allowlist": [{ cli: "claude code", models: ["sonnet", "opus"] }] });
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    const head = wrapper.find(".budget-row-head");
    expect(head.attributes("aria-expanded")).toBe("false");
    await head.trigger("click");
    expect(wrapper.find(".budget-row-head").attributes("aria-expanded")).toBe("true");
    expect(wrapper.findAll(".budget-model")).toHaveLength(2);
    await wrapper.find(".budget-row-head").trigger("click");
    expect(wrapper.find(".budget-models").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the unrestricted empty state when there is no allowlist", () => {
    seedConfig({ "budget.allowlist": [] });
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    const empty = wrapper.find("[data-testid='budget-empty']");
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain("unrestricted");
    wrapper.unmount();
  });
});

describe("AgentsView Budget Controls tab (#0764)", () => {
  it("renders the tab and deep-links to it via ?tab=budget-controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/models")) {
          return {
            ok: true,
            json: async () => ({
              byCli: { opencode: { supported: true, models: ["default"], refreshable: false } },
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.agentsMeta = { clis: [], models: [], defaults: [], skills: [] };
    config.loaded = true;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/?tab=budget-controls");
    const wrapper = mount(AgentsView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true, VoiceDictate: true },
      },
    });
    await flushPromises();

    const tab = wrapper
      .findAll(".agent-tabs .tab-btn")
      .find((b) => b.text().includes("Budget Controls"));
    expect(tab, "Budget Controls tab button").toBeTruthy();
    expect(tab!.classes()).toContain("active");
    expect(wrapper.find(".budget-controls").exists()).toBe(true);

    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
