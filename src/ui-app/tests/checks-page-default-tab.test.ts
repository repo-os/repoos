import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ChecksView from "../src/views/ChecksView.vue";
import IntegrationPipelineSummary from "../src/components/IntegrationPipelineSummary.vue";
import { useRepoStore } from "../src/stores/repo";
import {
  checksActivityLive,
  parseChecksTab,
  resolveChecksDefaultTab,
} from "../src/lib/checks-page";
import type { CheckPlanView, IntegrationPipelineSnapshot } from "../src/types";

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as unknown as Response;

const emptyPlan = (): CheckPlanView =>
  ({
    source: "declared",
    defaultProfile: "default",
    profile: "default",
    profiles: ["default"],
    warnings: [],
    errors: [],
    steps: [],
    lastRun: null,
  }) as CheckPlanView;

const idleRemote = () => ({
  enabled: true,
  running: false,
  provider: "tailscale",
  tailscaleHosts: [],
  hosts: [],
  tailscaleHost: "",
  tailscaleHostPinsTop: false,
  hostPoolEditable: false,
  activeServer: null,
  maxConcurrent: 1,
});

function pipelineActive(taskId = "0737"): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: {
      taskId,
      stage: "check",
      failed: false,
      startedAt: new Date().toISOString(),
    },
    queue: ["0738", "0739"],
    at: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checks-page tab helpers (#0738)", () => {
  it("maps legacy remote alias to the Now tab", () => {
    expect(parseChecksTab("remote")).toBe("now");
    expect(parseChecksTab("now")).toBe("now");
    expect(parseChecksTab("plan")).toBe("plan");
    expect(parseChecksTab("nope")).toBeNull();
  });

  it("picks Now when activity is live and Runs when idle", () => {
    expect(resolveChecksDefaultTab(true)).toBe("now");
    expect(resolveChecksDefaultTab(false)).toBe("runs");
    expect(
      checksActivityLive({
        integration: pipelineActive(),
        remoteStatus: idleRemote(),
        testRunRunning: false,
      }),
    ).toBe(true);
    expect(
      checksActivityLive({
        integration: { empty: true, active: null, queue: [], at: "" },
        remoteStatus: idleRemote(),
        testRunRunning: false,
      }),
    ).toBe(false);
  });
});

describe("ChecksView default tab (#0738)", () => {
  async function mountChecks(initialPath: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/api/check-plan"))
          return jsonResponse({ ok: true, checkPlan: emptyPlan() });
        if (path.includes("/api/integration/pipeline"))
          return jsonResponse({ ok: true, pipeline: { empty: true, active: null, queue: [], at: "" } });
        if (path.includes("/api/remote-validation/status")) return jsonResponse(idleRemote());
        if (path.includes("/api/health"))
          return jsonResponse({ ok: true, root: "/tmp" });
        if (path.includes("/api/test-run"))
          return jsonResponse({ ok: true, running: false, output: "" });
        return jsonResponse({ ok: true });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div/>" } },
        { path: "/checks", name: "checks", component: ChecksView },
      ],
    });
    await router.push(initialPath);
    await router.isReady();
    const wrapper = mount(ChecksView, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flushPromises();
    await flushPromises();
    return { wrapper, router, pinia };
  }

  it("opens on Runs when nothing is in flight", async () => {
    const { router } = await mountChecks("/checks");
    expect(router.currentRoute.value.query.tab).toBe("runs");
  });

  it("opens on Now when the close-out pipeline is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/api/check-plan"))
          return jsonResponse({ ok: true, checkPlan: emptyPlan() });
        if (path.includes("/api/integration/pipeline"))
          return jsonResponse({ ok: true, pipeline: pipelineActive() });
        if (path.includes("/api/remote-validation/status")) return jsonResponse(idleRemote());
        return jsonResponse({ ok: true });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div/>" } },
        { path: "/checks", name: "checks", component: ChecksView },
      ],
    });
    await router.push("/checks");
    await router.isReady();
    mount(ChecksView, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flushPromises();
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe("now");
  });

  it("keeps a deep-linked Check plan tab", async () => {
    const { router, wrapper } = await mountChecks("/checks?tab=plan");
    expect(router.currentRoute.value.query.tab).toBe("plan");
    expect(wrapper.text()).toContain("Profile");
  });

  it("keeps the legacy ?tab=remote deep link on Now", async () => {
    const { router } = await mountChecks("/checks?tab=remote");
    expect(parseChecksTab(router.currentRoute.value.query.tab)).toBe("now");
  });
});

describe("IntegrationPipelineSummary (#0738)", () => {
  it("renders the active task, stage, and queue", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.integration = pipelineActive("0737");
    const wrapper = mount(IntegrationPipelineSummary, {
      global: { plugins: [pinia] },
    });
    const text = wrapper.text();
    expect(text).toContain("#0737");
    expect(text).toContain("check");
    expect(text).toContain("#0738");
    expect(text).toContain("#0739");
  });
});
