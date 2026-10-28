/**
 * #0960 — the task drawer surfaces a held task's reason.
 *
 * A held task must show a "Held" status detail (with its reason/by/until) in the
 * drawer's status details, and only while the hold is actually active: a flag
 * hold or a `hold` tag shows it, a non-held task does not, and an expired
 * `holdUntil` hides it again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

const heldTask = (over: Partial<Task> = {}): Task =>
  makeTask({
    status: "active",
    isHeld: true,
    holdReason: "waiting on design sign-off",
    holdBy: "njachowski@gmail.com",
    holdUntil: "2030-01-01T00:00:00Z",
    ...over,
  });

let mounted: { unmount: () => void } | undefined;

async function mountDrawer(pinia: Pinia, task: Task) {
  mounted?.unmount();
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index")) {
        const counts =
          task.status === "review"
            ? { ...EMPTY_COUNTS, review: 1 }
            : { ...EMPTY_COUNTS, active: 1 };
        return json({ tasks: [task], counts, taskCount: 1 });
      }
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      return json({ ok: true });
    }),
  );
  const ui = useUiStore();
  ui.open(task);
  // The held detail renders in the Debug tab's status details.
  ui.activeTab = "debug";
  ui.debugView = "status";
  const wrapper = mount(TaskDrawer, {
    props: { task },
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  mounted = wrapper;
  return wrapper;
}

function setup(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("task drawer Held reason (#0960)", () => {
  it("shows the Held status detail with reason/by/until for a flag-held task", async () => {
    const pinia = setup();
    useRepoStore();
    const wrapper = await mountDrawer(pinia, heldTask());

    const details = wrapper.findAll(".debug-status-detail");
    const held = details.find((d) => d.find("strong")?.text() === "Held");
    expect(held).toBeTruthy();
    const copy = held!.find(".debug-status-text").text();
    expect(copy).toContain("waiting on design sign-off");
    expect(copy).toContain("njachowski@gmail.com");
    expect(copy).toContain("2030-01-01T00:00:00Z");
  });

  it("shows the Held detail for a task held only by a `hold` tag", async () => {
    const pinia = setup();
    useRepoStore();
    const wrapper = await mountDrawer(pinia, heldTask({ isHeld: false, tags: ["hold"] }));

    const details = wrapper.findAll(".debug-status-detail");
    const held = details.find((d) => d.find("strong")?.text() === "Held");
    expect(held).toBeTruthy();
  });

  it("shows no Held detail for a non-held task", async () => {
    const pinia = setup();
    useRepoStore();
    const wrapper = await mountDrawer(pinia, heldTask({ isHeld: false }));

    const details = wrapper.findAll(".debug-status-detail");
    expect(details.some((d) => d.find("strong")?.text() === "Held")).toBe(false);
  });

  it("hides the Held detail once a dated hold has auto-released", async () => {
    const pinia = setup();
    useRepoStore();
    const wrapper = await mountDrawer(pinia, heldTask({ holdUntil: "2000-01-01T00:00:00Z" }));

    const details = wrapper.findAll(".debug-status-detail");
    expect(details.some((d) => d.find("strong")?.text() === "Held")).toBe(false);
  });
});

it.each([true, false])("expires the mounted drawer with flag=%s", async (flag) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  const pinia = setup();
  const wrapper = await mountDrawer(
    pinia,
    heldTask({ isHeld: flag, tags: flag ? [] : ["hold"], holdUntil: "2026-10-27T00:00:01Z" }),
  );
  const hasHeld = () =>
    wrapper.findAll(".debug-status-detail").some((d) => d.find("strong")?.text() === "Held");
  expect(hasHeld()).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  await nextTick();
  expect(hasHeld()).toBe(false);
  useRepoStore().$dispose();
});
