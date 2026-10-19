/**
 * #0764 — the Budget Controls tab and its allowlist panel: collapsed-by-default
 * rows with counts, expansion, the empty-state copy, and the deep-linkable tab.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
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

  it("puts Remove agent in the row's corner, outside the expandable body (#0768)", async () => {
    seedConfig({ "budget.allowlist": [{ cli: "claude code", models: ["sonnet", "opus"] }] });
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    const row = wrapper.find(".budget-row");
    const remove = row.find("[data-testid='budget-remove-agent']");
    // Present even while the row is collapsed — it lives in the row's corner,
    // not inside the expandable model list.
    expect(remove.exists()).toBe(true);
    expect(remove.element.tagName).toBe("BUTTON");
    expect(remove.attributes("aria-label")).toBe("Remove claude code from the allowlist");
    // A direct child of the row (a sibling of the head), not nested in the body.
    expect(remove.element.parentElement?.classList.contains("budget-row")).toBe(true);
    expect(row.find(".budget-models").exists()).toBe(false);

    await row.find(".budget-row-head").trigger("click");
    // Still outside the expanded model list once the row opens.
    const stillInCorner = wrapper.find("[data-testid='budget-remove-agent']");
    expect(wrapper.find(".budget-models").element.contains(stillInCorner.element)).toBe(false);
    wrapper.unmount();
  });

  it("Remove agent still drops the row, preserving behaviour (#0768)", async () => {
    const config = seedConfig({
      "budget.allowlist": [
        { cli: "claude code", models: ["sonnet"] },
        { cli: "opencode", models: ["big pickle"] },
      ],
    });
    const patched: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        patched.push(JSON.parse(init?.body ?? "{}"));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    expect(config.data?.["budget.allowlist"]).toHaveLength(2);

    await wrapper.findAll("[data-testid='budget-remove-agent']")[0]!.trigger("click");
    await flushPromises();

    expect(patched).toEqual([
      { "budget.allowlist": [{ cli: "opencode", models: ["big pickle"] }] },
    ]);
    expect(config.data?.["budget.allowlist"]).toEqual([
      { cli: "opencode", models: ["big pickle"] },
    ]);
    wrapper.unmount();
    vi.unstubAllGlobals();
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

describe("BudgetControlsPanel pause/resume (#0850)", () => {
  const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a paused chip with the reason and resume date", () => {
    seedConfig({
      "budget.allowlist": [
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedUntil: FUTURE,
          pausedReason: "Cursor credits exhausted",
        },
      ],
    });
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    const chip = wrapper.find("[data-testid='budget-paused-chip']");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("Paused");
    expect(chip.text()).toContain("Cursor credits exhausted");
    expect(chip.text()).toContain("until");
    expect(wrapper.find("[data-testid='budget-resume-agent']").exists()).toBe(true);
    wrapper.unmount();
  });

  it("pauses an agent through the shared dialog and writes the config", async () => {
    const config = seedConfig({
      "budget.allowlist": [{ cli: "cursor", models: ["composer-2.5"] }],
    });
    const patched: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        patched.push(JSON.parse(init?.body ?? "{}"));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );
    const wrapper = mount(BudgetControlsPanel, {
      attachTo: document.body,
      global: { stubs: { AgentModelControl: true } },
    });
    await wrapper.find("[data-testid='budget-pause-agent']").trigger("click");
    await flushPromises();
    const body = document.body;
    (body.querySelector("[data-testid='budget-pause-reason']") as HTMLInputElement).value =
      "Credits exhausted";
    (body.querySelector("[data-testid='budget-pause-reason']") as HTMLInputElement).dispatchEvent(
      new Event("input", { bubbles: true }),
    );
    (body.querySelector("[data-testid='budget-pause-until']") as HTMLInputElement).value =
      "2099-01-01T09:00";
    (body.querySelector("[data-testid='budget-pause-until']") as HTMLInputElement).dispatchEvent(
      new Event("input", { bubbles: true }),
    );
    await flushPromises();
    (body.querySelector("[data-testid='budget-pause-confirm']") as HTMLButtonElement).click();
    await flushPromises();

    const rows = patched[0]?.["budget.allowlist"] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      cli: "cursor",
      paused: true,
      pausedReason: "Credits exhausted",
    });
    expect(String(rows[0]?.pausedUntil)).toContain("2099-01-01");
    expect(config.data?.["budget.allowlist"]).toMatchObject([{ cli: "cursor", paused: true }]);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("resumes a paused agent without opening a dialog", async () => {
    const config = seedConfig({
      "budget.allowlist": [
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedReason: "Credits exhausted",
        },
      ],
    });
    const patched: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        patched.push(JSON.parse(init?.body ?? "{}"));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    await wrapper.find("[data-testid='budget-resume-agent']").trigger("click");
    await flushPromises();

    const rows = patched[0]?.["budget.allowlist"] as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({ cli: "cursor", models: ["composer-2.5"] });
    expect(config.data?.["budget.allowlist"]).toEqual([
      { cli: "cursor", models: ["composer-2.5"] },
    ]);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("pauses and resumes one model", async () => {
    seedConfig({
      "budget.allowlist": [{ cli: "opencode", models: ["big pickle", "deepseek v4"] }],
    });
    const patched: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        patched.push(JSON.parse(init?.body ?? "{}"));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );
    const wrapper = mount(BudgetControlsPanel, {
      attachTo: document.body,
      global: { stubs: { AgentModelControl: true } },
    });
    await wrapper.find(".budget-row-head").trigger("click");
    await wrapper.findAll("[data-testid='budget-pause-model']")[0]!.trigger("click");
    await flushPromises();
    (
      document.body.querySelector("[data-testid='budget-pause-confirm']") as HTMLButtonElement
    ).click();
    await flushPromises();

    const pausedRows = patched[0]?.["budget.allowlist"] as Array<Record<string, unknown>>;
    expect(pausedRows[0]?.pausedModels).toEqual([{ model: "big pickle" }]);
    expect(wrapper.find("[data-testid='budget-model-paused-chip']").exists()).toBe(true);

    await wrapper.find("[data-testid='budget-resume-model']").trigger("click");
    await flushPromises();
    const resumedRows = patched[1]?.["budget.allowlist"] as Array<Record<string, unknown>>;
    expect(resumedRows[0]?.pausedModels).toBeUndefined();
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("does not show a paused chip once pausedUntil has passed", () => {
    seedConfig({
      "budget.allowlist": [
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedUntil: "2020-01-01T00:00:00.000Z",
        },
      ],
    });
    const wrapper = mount(BudgetControlsPanel, {
      global: { stubs: { AgentModelControl: true, teleport: true } },
    });
    expect(wrapper.find("[data-testid='budget-paused-chip']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='budget-pause-agent']").exists()).toBe(true);
    wrapper.unmount();
  });
});
