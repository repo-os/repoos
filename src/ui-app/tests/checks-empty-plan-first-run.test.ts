import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ChecksView from "../src/views/ChecksView.vue";
import { useRepoStore } from "../src/stores/repo";
import { invalidatePageDataPrefix } from "../src/composables/page-data-cache";
import {
  applyShotPreviewFixture,
  resetShotFixturePins,
  shotFixturePinnedCheckPlan,
} from "../src/lib/shot-preview-fixtures";
import { isShotPreviewFixtureId } from "../../core/shot-fixtures.js";
import type { CheckPlanView } from "../src/types";

/**
 * #1224 — first-run Checks page: a brand-new repo has no check plan. The
 * `checks:emptyPlan` preview fixture pins a genuinely empty, error-free plan
 * so captures (and these tests) can review that state without editing this
 * repo's real repoos.toml.
 */

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as unknown as Response;

/** A real declared plan, for the "no pin" mount. */
const declaredPlan = (): CheckPlanView => ({
  source: "declared",
  defaultProfile: "default",
  profile: "default",
  profiles: ["default"],
  warnings: [],
  errors: [],
  steps: [
    {
      name: "build",
      command: "true",
      timeoutMs: 1000,
      required: true,
      profiles: [],
      whenChanged: [],
      dependsOn: [],
      requires: [],
      crossCutting: true,
      selected: true,
      missing: [],
    },
  ],
  lastRun: null,
});

function stubFetch(opts: { failOnCheckPlan?: boolean } = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes("/api/check-plan")) {
        if (opts.failOnCheckPlan) throw new Error("check-plan must not be fetched under the pin");
        return jsonResponse({ ok: true, checkPlan: declaredPlan() });
      }
      if (path.includes("/api/integration/pipeline"))
        return jsonResponse({ ok: true, pipeline: { empty: true, active: null, queue: [], at: "" } });
      if (path.includes("/api/remote-validation/status"))
        return jsonResponse({
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
      if (path.includes("/api/local-check-slots")) return jsonResponse({ holders: [], queue: [] });
      if (path.includes("/api/health")) return jsonResponse({ ok: true, root: "/tmp" });
      if (path.includes("/api/test-run")) return jsonResponse({ ok: true, running: false, output: "" });
      return jsonResponse({ ok: true });
    }),
  );
}

async function mountChecks(): Promise<ReturnType<typeof mount>> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/checks", name: "checks", component: ChecksView },
    ],
  });
  await router.push("/checks?tab=plan");
  await router.isReady();
  const wrapper = mount(ChecksView, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  resetShotFixturePins();
});

afterEach(() => {
  resetShotFixturePins();
  vi.unstubAllGlobals();
  invalidatePageDataPrefix("check-plan:");
});

describe("checks:emptyPlan first-run fixture (#1224)", () => {
  it("is a registered fixture id", () => {
    expect(isShotPreviewFixtureId("checks:emptyPlan")).toBe(true);
  });

  it("pins a genuinely empty, error-free plan and clears on reset", () => {
    applyShotPreviewFixture(useRepoStore(), "checks:emptyPlan");
    const plan = shotFixturePinnedCheckPlan();
    expect(plan).not.toBeNull();
    expect(plan!.source).toBe("empty");
    expect(plan!.steps).toEqual([]);
    expect(plan!.errors).toEqual([]);
    resetShotFixturePins();
    expect(shotFixturePinnedCheckPlan()).toBeNull();
  });

  it("renders the amber reminder instead of fetching, with no red error line", async () => {
    applyShotPreviewFixture(useRepoStore(), "checks:emptyPlan");
    stubFetch({ failOnCheckPlan: true });
    const wrapper = await mountChecks();

    // The amber reminder is the first-run guidance…
    expect(wrapper.find(".ncpr").exists()).toBe(true);
    expect(wrapper.text()).toContain("No checks configured");
    // …the empty-source chip reads "No plan configured"…
    expect(wrapper.text()).toContain("No plan configured");
    // …and the redundant red paragraph is gone: an error-free empty plan is
    // not a failure (#0592), and the reminder already explains both setup paths.
    const errTexts = wrapper.findAll(".ck-err").map((el) => el.text());
    expect(errTexts).toEqual([]);
    wrapper.unmount();
  });

  it("fetches the real plan again once the pin is reset", async () => {
    stubFetch();
    const wrapper = await mountChecks();
    await nextTick();
    expect(wrapper.text()).toContain("Profile");
    // The declared plan's step renders; no first-run reminder on this plan.
    expect(wrapper.text()).toContain("build");
    expect(wrapper.find(".ncpr").exists()).toBe(false);
    wrapper.unmount();
  });
});
