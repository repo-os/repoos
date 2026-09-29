/**
 * #0587: the New task form defaults to the repository's first declared area,
 * and a repo that declares none starts empty. The default must not be a
 * hard-coded "web" — and it must still apply when the drawer opens before
 * `/api/config` has resolved, without clobbering a deliberate choice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useConfigStore } from "../src/stores/config";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, flush, json } from "./component-test-helpers";

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (u.includes("/api/board") || u.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (u.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + u);
    }),
  );
}

async function mountDrawer(vocabulary?: string[]): Promise<VueWrapper> {
  stubFetch();
  const pinia = createPinia();
  setActivePinia(pinia);
  if (vocabulary) {
    const config = useConfigStore();
    config.data = { areaVocabulary: vocabulary.map((name) => ({ name })) };
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  return mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("New task default area (#0587)", () => {
  it("starts on the first declared area when config is already loaded", async () => {
    await mountDrawer(["landing", "docs"]);
    const ui = useUiStore();
    ui.openNewTask();
    await flush();
    expect(ui.nt.area).toBe("landing");
  });

  it("backfills the default when the vocabulary arrives after the drawer opens", async () => {
    await mountDrawer(); // no vocabulary yet — config.data is null
    const ui = useUiStore();
    ui.openNewTask();
    await flush();
    expect(ui.nt.area).toBe("");

    const config = useConfigStore();
    config.data = { areaVocabulary: [{ name: "docs" }, { name: "landing" }] };
    await flush();
    expect(ui.nt.area).toBe("docs");
  });

  it("never overrides an already-chosen area on late vocabulary load", async () => {
    await mountDrawer(["landing", "docs"]);
    const ui = useUiStore();
    ui.openNewTask();
    await flush();
    expect(ui.nt.area).toBe("landing");
    // A deliberate choice (here a custom area) must survive the vocabulary
    // arriving/updating afterwards.
    ui.nt.area = "custom-area";
    const config = useConfigStore();
    config.data = { areaVocabulary: [{ name: "docs" }, { name: "landing" }] };
    await flush();
    expect(ui.nt.area).toBe("custom-area");
  });

  it("starts empty when the repo declares no vocabulary", async () => {
    await mountDrawer();
    const ui = useUiStore();
    ui.openNewTask();
    await flush();
    expect(ui.nt.area).toBe("");
  });
});
