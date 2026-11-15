import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import AgentsView from "../src/views/AgentsView.vue";
import { useConfigStore } from "../src/stores/config";

async function flush(): Promise<void> {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
}

describe("AgentsView agent cards", () => {
  it("renders the page tabs while config is still loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    expect(config.loaded).toBe(false);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/");
    const wrapper = mount(AgentsView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true, VoiceDictate: true },
      },
    });
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(wrapper.find(".agents-page-title").text()).toBe("Agents");
    expect(wrapper.find(".agent-tabs").exists()).toBe(true);
    expect(wrapper.findAll(".agent-tabs .tab-btn").map((tab) => tab.text())).toContain("Agents");
    expect(wrapper.findAll(".agent-tabs .tab-btn").map((tab) => tab.text())).not.toContain(
      "Custom Agents",
    );
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("lists default headless agents as PM, Engineer, Reviewer", async () => {
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
    const agents = [
      { name: "reviewer", cli: "opencode", model: "default", enabled: true },
      { name: "engineer", cli: "opencode", model: "default", enabled: true },
      { name: "pm", cli: "opencode", model: "default", enabled: true },
    ];
    config.agents = agents;
    config.agentsMeta = {
      clis: ["opencode"],
      models: ["default"],
      defaults: agents,
      skills: [
        { name: "frontend-design", path: "skills/frontend-design/SKILL.md", description: "" },
      ],
    };
    config.loaded = true;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/");
    const wrapper = mount(AgentsView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true, VoiceDictate: true },
      },
    });
    await flush();

    await wrapper.find(".agent-add input").setValue("data analyst");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Add agent"))!
      .trigger("click");
    await flush();

    const names = wrapper
      .findAll(".agent-tab-panel")[0]
      .findAll(".agent-name")
      .map((el) => el.text());
    expect(names).toEqual(["pm", "engineer", "reviewer"]);
    const customAgentsPanel = wrapper.findAll(".agent-tab-panel")[1]!;
    expect(wrapper.findAll(".agent-tab-panel")[0]!.text()).toContain("Default agents");
    expect(customAgentsPanel.text()).toContain("Custom agents");
    expect((customAgentsPanel.find(".agent-card input").element as HTMLInputElement).value).toBe(
      "data analyst",
    );

    expect(wrapper.find(".agent-instr").exists()).toBe(false);
    expect(wrapper.find(".agent-skills-inline-summary").exists()).toBe(true);
    expect(wrapper.find(".agent-skills-help").exists()).toBe(false);

    wrapper.unmount();
    const revisit = mount(AgentsView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true, VoiceDictate: true },
      },
    });
    await flush();
    expect(revisit.findAll(".page-skeleton").filter((node) => node.isVisible())).toHaveLength(0);
    expect(revisit.findAll(".agent-name").map((el) => el.text())).toContain("engineer");
    revisit.unmount();
    vi.unstubAllGlobals();
  });

  it("shows last-run status inline on each card and drops the last-runs log (#1133)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/models")) {
          return {
            ok: true,
            json: async () => ({
              byCli: { opencode: { supported: true, models: ["default"], refreshable: false } },
            }),
          };
        }
        if (String(url).includes("/api/agents/last-runs")) {
          return {
            ok: true,
            json: async () => ({
              agents: [
                {
                  name: "engineer",
                  status: "errored",
                  at: "2026-11-15T21:36:00.000Z",
                  taskId: "1098",
                  reason:
                    "OpenCode is out of credit. Add balance, or pick another model. (CLI: opencode exited with code 1: Error: You need positive balance to do inference.)",
                  codingAgent: "opencode",
                  model: "default",
                },
                {
                  name: "pm",
                  status: "finished",
                  at: "2026-11-15T21:40:00.000Z",
                  taskId: "1099",
                  reason: null,
                  codingAgent: "opencode",
                  model: "default",
                },
                {
                  name: "reviewer",
                  status: "errored",
                  at: "2026-11-15T20:02:00.000Z",
                  taskId: "1088",
                  reason: "Codex exited with an error. Open Raw CLI error for details.",
                  codingAgent: "codex",
                  model: "gpt-5",
                },
                {
                  name: "cto",
                  status: "finished",
                  at: "2026-11-15T20:30:00.000Z",
                  taskId: null,
                  reason: null,
                  codingAgent: "opencode",
                  model: "default",
                },
                {
                  name: "debugger",
                  status: "errored",
                  at: "2026-11-15T20:45:00.000Z",
                  taskId: "1088",
                  reason: "OpenCode is signed out. Re-authenticate OpenCode on this computer.",
                  codingAgent: "opencode",
                  model: "default",
                },
              ],
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    const agents = [
      { name: "reviewer", cli: "opencode", model: "default", enabled: true },
      { name: "engineer", cli: "opencode", model: "default", enabled: true },
      { name: "pm", cli: "opencode", model: "default", enabled: true },
      { name: "CTO", cli: "opencode", model: "default", enabled: true },
    ];
    config.agents = agents;
    config.agentsMeta = {
      clis: ["opencode"],
      models: ["default"],
      defaults: agents,
      skills: [],
    };
    config.loaded = true;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/work", name: "work", component: { template: "<div />" } },
      ],
    });
    await router.push("/");
    const wrapper = mount(AgentsView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true, VoiceDictate: true },
      },
    });
    await flush();

    expect(wrapper.find('[data-testid="agents-last-runs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="agents-last-runs-toggle"]').exists()).toBe(false);

    const cards = wrapper.findAll(".agent-tab-panel")[0]!.findAll(".agent-card");
    const byName = new Map(cards.map((card) => [card.find(".agent-name").text(), card]));

    const engineer = byName.get("engineer")!;
    expect(engineer.find(".agent-title .agent-run-status").exists()).toBe(true);
    expect(engineer.find(".agent-run-label").text()).toMatch(/^Failed /);
    expect(engineer.find(".agent-run-status").classes()).toContain("agent-run-error");
    expect(engineer.find(".agent-run-reason").text()).toBe(
      "OpenCode is out of credit. Add balance, or pick another model.",
    );
    expect(engineer.find(".agent-failure-raw pre").text()).toContain(
      "You need positive balance to do inference",
    );
    expect(engineer.find("a.agent-run-link").attributes("href")).toBe("/work?task=1098&tab=debug");

    const pm = byName.get("pm")!;
    expect(pm.find(".agent-run-label").text()).toMatch(/^Last run /);
    expect(pm.find(".agent-run-detail").exists()).toBe(false);

    const reviewer = byName.get("reviewer")!;
    expect(reviewer.find(".agent-run-label").text()).toBe("Previous setup (codex + gpt-5)");
    expect(reviewer.find(".agent-run-status").classes()).toContain("agent-run-muted");
    expect(reviewer.find(".agent-run-previous").text()).toContain(
      "different coding agent or model",
    );

    const teamCards = wrapper.findAll(".agent-tab-panel")[2]!.findAll(".agent-card");
    const cto = teamCards.find((card) => card.find(".agent-name").text().toLowerCase() === "cto")!;
    expect(cto.find(".agent-run-label").text()).toMatch(/^Last run /);
    const debuggerCard = teamCards.find((card) =>
      card.find(".agent-name").text().includes("Debugger"),
    )!;
    expect(debuggerCard.find(".agent-run-label").text()).toMatch(/^Failed /);
    expect(debuggerCard.find(".agent-run-reason").text()).toContain("signed out");

    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("teleports the skills modal to body with a marked overlay layer (#1005)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/models")) {
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
    config.agents = [{ name: "engineer", cli: "opencode", model: "default", enabled: true }];
    config.agentsMeta = {
      clis: ["opencode"],
      models: ["default"],
      defaults: config.agents,
      skills: [
        { name: "frontend-design", path: "skills/frontend-design/SKILL.md", description: "" },
      ],
    };
    config.loaded = true;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/");
    // No teleport stub: the real Teleport must land the fixed-position modal
    // in body (#0575), or a dialog layered above it goes click-transparent.
    const wrapper = mount(AgentsView, {
      attachTo: document.body,
      global: { plugins: [pinia, router], stubs: { Transition: true, VoiceDictate: true } },
    });
    await flush();

    await wrapper.find(".agent-skills-add").trigger("click");
    await flush();

    const modal = document.body.querySelector(".am-modal") as HTMLElement;
    expect(modal).not.toBeNull();
    expect(modal.parentElement).toBe(document.body);
    const layerId = modal.getAttribute("data-overlay-layer");
    expect(layerId).toMatch(/^overlay-/);
    expect(document.body.querySelector(".overlay")?.getAttribute("data-overlay-layer")).toBe(
      layerId,
    );

    wrapper.unmount();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });
});
