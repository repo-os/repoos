/**
 * Agents page loading state (#0950): the Detected tab must never show a bare
 * "Probing PATH…" line, its cached snapshot must render instantly on a revisit,
 * and the panels inside the page use the same shared skeleton.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import AgentsView from "../src/views/AgentsView.vue";
import RemindersPanel from "../src/components/RemindersPanel.vue";
import ScheduledTasksPanel from "../src/components/ScheduledTasksPanel.vue";
import ModelProvidersPanel from "../src/components/ModelProvidersPanel.vue";
import { useConfigStore } from "../src/stores/config";
import { invalidatePageData, invalidatePageDataPrefix } from "../src/composables/page-data-cache";

const json = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as unknown as Response;

const detectedAgents = [
  {
    id: "codex",
    name: "Codex",
    cli: "codex",
    binary: "codex",
    installed: true,
    path: "/usr/local/bin/codex",
    version: "1.0.0",
    headless: true,
    drivable: true,
    installHint: "",
    auth: true,
  },
];

function baseAgents() {
  return [
    { name: "reviewer", cli: "opencode", model: "default", enabled: true },
    { name: "engineer", cli: "opencode", model: "default", enabled: true },
    { name: "pm", cli: "opencode", model: "default", enabled: true },
  ];
}

function loadedConfig() {
  const config = useConfigStore();
  const agents = baseAgents();
  config.agents = agents;
  config.agentsMeta = {
    clis: ["opencode"],
    models: ["default"],
    defaults: agents,
    skills: [{ name: "frontend-design", path: "skills/frontend-design/SKILL.md", description: "" }],
  };
  config.loaded = true;
  return config;
}

async function panelRouter(): Promise<ReturnType<typeof createRouter>> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  return router;
}

type FetchImpl = (url: string) => Promise<Response>;

async function mountAgents(
  query = "/?tab=detected",
  fetchImpl: FetchImpl = () => new Promise<Response>(() => {}),
) {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  const pinia = createPinia();
  setActivePinia(pinia);
  loadedConfig();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push(query);
  const wrapper = mount(AgentsView, {
    global: {
      plugins: [pinia, router],
      stubs: { teleport: true, Transition: true, VoiceDictate: true },
    },
  });
  await flushPromises();
  return wrapper;
}

function detectedPanel(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll(".agent-tab-panel")
    .find((panel) => panel.text().includes("Detected coding agents"))!;
}

class QuietEventSource {
  onerror: (() => void) | null = null;
  addEventListener(): void {}
  close(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  invalidatePageData("agents:detect");
  invalidatePageDataPrefix("reminders");
});

describe("AgentsView detected-tab loading (#0950)", () => {
  it("shows the shared skeleton instead of a Probing PATH line", async () => {
    vi.stubGlobal("EventSource", QuietEventSource);
    const wrapper = await mountAgents();

    expect(wrapper.text()).not.toContain("Probing PATH");
    expect(wrapper.find(".detect-loading").exists()).toBe(false);
    expect(detectedPanel(wrapper).find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([{ agents: [] }, { agents: detectedAgents }])(
    "keeps cached detected agents $agents visible during refresh",
    async ({ agents }) => {
      vi.stubGlobal("EventSource", QuietEventSource);
      const first = await mountAgents("/?tab=detected", (url) => {
        if (String(url).includes("/api/agents/detect"))
          return Promise.resolve(json({ agents, cachedAt: null }));
        return new Promise<Response>(() => {});
      });
      first.unmount();
      const revisit = await mountAgents();
      const panel = detectedPanel(revisit);
      expect(panel.find(".page-skeleton").exists()).toBe(false);
      expect(panel.find(agents.length ? ".detect-agent-name" : ".agent-empty").exists()).toBe(true);
      revisit.unmount();
    },
  );

  it("shows cached detections immediately without a skeleton, then refreshes in place", async () => {
    const first = await mountAgents("/?tab=detected", async (url) => {
      if (String(url).includes("/api/agents/detect"))
        return json({ agents: detectedAgents, cachedAt: "2026-10-25T00:00:00Z" });
      if (String(url).includes("/api/models"))
        return json({
          byCli: { opencode: { supported: true, models: ["default"], refreshable: false } },
        });
      return new Promise<Response>(() => {});
    });
    expect(first.find(".detect-agent-name").text()).toBe("Codex");
    first.unmount();

    let finish!: (response: Response) => void;
    const revisit = await mountAgents("/?tab=detected", (url) => {
      if (String(url).includes("/api/agents/detect"))
        return new Promise<Response>((resolve) => (finish = resolve));
      return new Promise<Response>(() => {});
    });
    const detected = detectedPanel(revisit);
    expect(detected.find(".page-skeleton").exists()).toBe(false);
    expect(detected.text()).not.toContain("Probing PATH");
    expect(detected.find(".detect-agent-name").text()).toBe("Codex");

    finish(
      json({
        agents: [{ ...detectedAgents[0], name: "Codex Nightly" }],
        cachedAt: "2026-10-25T00:01:00Z",
      }),
    );
    await flushPromises();
    expect(detected.find(".detect-agent-name").text()).toBe("Codex Nightly");
    expect(detected.find(".page-skeleton").exists()).toBe(false);
    revisit.unmount();
  });

  it("keeps the cached detection list visible when refresh fails", async () => {
    const first = await mountAgents("/?tab=detected", async (url) => {
      if (String(url).includes("/api/agents/detect"))
        return json({ agents: detectedAgents, cachedAt: "2026-10-25T00:00:00Z" });
      return new Promise<Response>(() => {});
    });
    first.unmount();

    class FailedEventSource {
      onerror: (() => void) | null = null;
      addEventListener(): void {}
      close(): void {}
      static latest: FailedEventSource;
      constructor() {
        FailedEventSource.latest = this;
      }
    }
    vi.stubGlobal("EventSource", FailedEventSource);
    const revisit = await mountAgents("/?tab=detected", async () => {
      throw new Error("refresh offline");
    });
    // The stale snapshot is rendered before the probe stream reports failure.
    FailedEventSource.latest.onerror?.();
    await flushPromises();

    expect(revisit.find(".detect-agent-name").text()).toBe("Codex");
    expect(revisit.text()).toContain("Refresh failed");
    expect(revisit.find(".page-skeleton").exists()).toBe(false);
    revisit.unmount();
  });
});

describe("Agents page panels share the skeleton (#0950)", () => {
  it("RemindersPanel shows the skeleton, not a loading line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(RemindersPanel, { global: { plugins: [pinia, await panelRouter()] } });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Loading reminders");
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("ScheduledTasksPanel shows the skeleton, not a loading line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ScheduledTasksPanel, {
      global: {
        plugins: [pinia, await panelRouter()],
        stubs: { teleport: true, Transition: true },
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Loading schedules");
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("ModelProvidersPanel shows the skeleton, not a loading line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ModelProvidersPanel, { global: { plugins: [pinia] } });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Loading providers");
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
