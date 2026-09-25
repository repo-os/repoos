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

    const names = wrapper
      .findAll(".agent-tab-panel")[0]
      .findAll(".agent-name")
      .map((el) => el.text());
    expect(names).toEqual(["pm", "engineer", "reviewer"]);

    expect(wrapper.find(".agent-instr").exists()).toBe(false);
    expect(wrapper.find(".agent-skills-inline-summary").exists()).toBe(true);
    expect(wrapper.find(".agent-skills-help").exists()).toBe(false);

    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
