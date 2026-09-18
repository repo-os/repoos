/**
 * #0400: opening New task → Freeform used to show `opencode + Default` even when
 * the PM agent was pinned to a concrete model. `initFreeformOverrides` copied the
 * pin correctly, then a CLI→model watcher saw `"" → "opencode"` and wiped it with
 * `modelsFor(cli)[0]` ("default"). This asserts the pin survives a tick.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useConfigStore } from "../src/stores/config";
import { useUiStore } from "../src/stores/ui";
import { flush, json, makeTask } from "./component-test-helpers";

const PM_PIN = "openrouter/z-ai/glm-5.3-flash";

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (u.includes("/api/board") || u.includes("/api/index"))
        return json({
          tasks: [],
          counts: { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 },
          taskCount: 0,
        });
      if (u.includes("/api/agents/running")) return json({ tasks: [] });
      if (u.includes("/api/tasks/freeform")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ok: true,
            fallback: false,
            task: makeTask({ id: "0400", path: "work/0400-test.md" }),
          }),
        };
      }
      throw new Error("unexpected fetch: " + u);
    }),
  );
}

async function openNewTaskDrawer(): Promise<VueWrapper> {
  stubFetch();
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  config.agents = [{ name: "pm", cli: "opencode", model: PM_PIN, enabled: true }];
  config.agentsMeta = {
    clis: ["opencode", "claude code"],
    models: [PM_PIN],
    defaults: [],
    skills: [],
  };
  config.liveModelsByCli = { opencode: [PM_PIN] };
  config.modelsLoaded = true;

  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();

  // Mount first (as App.vue does), then open — so the isNew watch fires and
  // initFreeformOverrides runs the empty→value CLI path the bug lived on.
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  const ui = useUiStore();
  ui.openNewTask();
  // Extra ticks: the CLI→model watch flushes after the sync init assignments.
  await flush();
  await flush();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("New task freeform PM model (#0400)", () => {
  it("keeps the PM's configured model after open (watch must not wipe to Default)", async () => {
    const wrapper = await openNewTaskDrawer();
    const label = wrapper.find(".am-control-label");
    expect(label.exists()).toBe(true);
    expect(label.text()).toContain("opencode");
    expect(label.text()).toContain(PM_PIN);
    expect(label.text()).not.toContain("Default");
  });

  it("does not treat an untouched picker as a custom override", async () => {
    const wrapper = await openNewTaskDrawer();
    const textarea = wrapper.find("#nt-freeform");
    await textarea.setValue("Ship the model-pin fix");
    const createBtn = wrapper.findAll("button").find((b) => b.text().includes("Create task"));
    expect(createBtn).toBeTruthy();
    await createBtn!.trigger("click");
    await flush();

    const fetchMock = vi.mocked(fetch);
    const freeformCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/tasks/freeform"),
    );
    expect(freeformCall).toBeTruthy();
    const init = freeformCall![1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      agentOverride?: string;
      cliOverride?: string;
      modelOverride?: string;
    };
    // Untouched = not custom → Create must not send a model override of "default".
    expect(body.modelOverride).toBeUndefined();
    expect(body.cliOverride).toBeUndefined();
    expect(body.agentOverride).toBeUndefined();
  });

  it("pins the close control to the upper-right via drawer-head-title", async () => {
    const wrapper = await openNewTaskDrawer();
    const head = wrapper.find(".drawer-head");
    expect(head.find(".drawer-head-title").exists()).toBe(true);
    expect(head.find(".close-x").exists()).toBe(true);
  });
});
