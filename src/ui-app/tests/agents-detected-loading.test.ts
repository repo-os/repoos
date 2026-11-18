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
import { SKELETON_SHOW_DELAY_MS } from "../src/lib/loading-skeleton";
import { KNOWN_AGENTS } from "../../core/detect";
import { CURSOR_LOGIN_COMMAND } from "../../core/cursor-auth";

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

function loadedConfig(clis = ["opencode"]) {
  const config = useConfigStore();
  const agents = baseAgents();
  config.agents = agents;
  config.agentsMeta = {
    clis,
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
  clis = ["opencode"],
) {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  const pinia = createPinia();
  setActivePinia(pinia);
  loadedConfig(clis);
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
  vi.useRealTimers();
  invalidatePageData("agents:detect");
  invalidatePageDataPrefix("reminders");
});

describe("AgentsView detected-tab loading (#0950)", () => {
  it.each([{ auth: true }, { auth: false }])(
    "shows the correct Cursor CLI state when auth=$auth",
    async ({ auth }) => {
      const cursor = {
        ...KNOWN_AGENTS.find((agent) => agent.id === "cursor")!,
        installed: true,
        path: "/usr/local/bin/cursor-agent",
        version: "2026.09.15",
        headless: true,
        auth,
      };
      const wrapper = await mountAgents("/?tab=detected", async (url) => {
        if (String(url).includes("/api/agents/detect"))
          return json({ agents: [cursor], cachedAt: null });
        return new Promise<Response>(() => {});
      });
      const row = detectedPanel(wrapper).find(".detect-row");
      if (auth) {
        expect(row.find(".detect-pill").text()).toBe("ready");
        expect(row.find(".detect-hint-code").exists()).toBe(false);
      } else {
        expect(row.find(".detect-pill").text()).toBe("sign-in required");
        expect(row.find(".detect-hint-code").text()).toContain(CURSOR_LOGIN_COMMAND);
        expect(row.find(".detect-copy").exists()).toBe(true);
      }
      wrapper.unmount();
    },
  );

  it("renders the default-agents model notice with safe Cursor login guidance", async () => {
    const modelError = `Cursor Agent authentication required — run \`${CURSOR_LOGIN_COMMAND}\` and retry.`;
    const wrapper = await mountAgents(
      "/",
      async (url) => {
        if (String(url).includes("/api/models?cli=cursor"))
          return json({
            byCli: {
              cursor: {
                supported: true,
                models: ["default"],
                refreshable: true,
                error: modelError,
              },
            },
            at: null,
          });
        return new Promise<Response>(() => {});
      },
      ["cursor"],
    );
    const notice = wrapper.find('[data-testid="agents-model-failure"]');
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain("Couldn't load models");
    expect(notice.text()).toContain(CURSOR_LOGIN_COMMAND);
    wrapper.unmount();
  });

  it("shows the shared skeleton instead of a Probing PATH line", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", QuietEventSource);
    const wrapper = await mountAgents();
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);

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

  it.each([{ agents: [] }, { agents: detectedAgents }])(
    "shows refresh errors with cached detected agents $agents",
    async ({ agents }) => {
      const first = await mountAgents("/?tab=detected", async (url) => {
        if (String(url).includes("/api/agents/detect"))
          return json({ agents, cachedAt: "2026-10-25T00:00:00Z" });
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

      expect(
        detectedPanel(revisit)
          .find(agents.length ? ".detect-agent-name" : ".agent-empty")
          .exists(),
      ).toBe(true);
      expect(detectedPanel(revisit).find("[role=status]").text()).toContain("Refresh failed");
      expect(revisit.find(".page-skeleton").exists()).toBe(false);
      revisit.unmount();
    },
  );

  it("announces a failed update check while keeping the detected agents visible", async () => {
    class FinishedEventSource {
      onerror: (() => void) | null = null;
      listeners = new Map<string, (event: { data: string }) => void>();
      static latest: FinishedEventSource;
      constructor() {
        FinishedEventSource.latest = this;
      }
      addEventListener(type: string, listener: (event: { data: string }) => void): void {
        this.listeners.set(type, listener);
      }
      close(): void {}
    }
    vi.stubGlobal("EventSource", FinishedEventSource);
    const wrapper = await mountAgents("/?tab=detected", async (url) => {
      if (String(url).includes("/api/agents/detect"))
        return json({ agents: detectedAgents, cachedAt: null });
      if (String(url).includes("/api/agents/updates"))
        throw new Error("update service unavailable");
      return new Promise<Response>(() => {});
    });
    FinishedEventSource.latest.listeners.get("done")?.({ data: '{"cachedAt":null}' });
    await flushPromises();

    await detectedPanel(wrapper).get(".detect-updates-btn").trigger("click");
    await flushPromises();

    expect(detectedPanel(wrapper).find('[role="status"]').text()).toContain(
      "Update checks are temporarily unavailable.",
    );
    expect(detectedPanel(wrapper).find(".detect-agent-name").text()).toBe("Codex");
    wrapper.unmount();
  });
});

describe("Agents page panels share the skeleton (#0950)", () => {
  it("RemindersPanel shows the skeleton, not a loading line", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(RemindersPanel, { global: { plugins: [pinia, await panelRouter()] } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);

    expect(wrapper.text()).not.toContain("Loading reminders");
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("ScheduledTasksPanel shows the skeleton, not a loading line", async () => {
    vi.useFakeTimers();
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
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);

    expect(wrapper.text()).not.toContain("Loading schedules");
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("ModelProvidersPanel shows the skeleton, not a loading line", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ModelProvidersPanel, { global: { plugins: [pinia] } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);

    expect(wrapper.text()).not.toContain("Loading providers");
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
