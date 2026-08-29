import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, makeTask, FakeEventSource, json, flush } from "./component-test-helpers";

(Element.prototype as unknown as { scrollTo: () => void }).scrollTo ??= () => {};

describe("Stop work confirmation modal", () => {
  it("stops the captured task even if opening the modal dismisses the drawer", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ status: "active" });
    const calls: Array<{ url: string; opts?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        calls.push({ url, opts });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/api/agents/queued")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: false, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/abandon") && opts?.method === "POST") return json({ ok: true });
        return json({ ok: true });
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    const stopButton = wrapper.findAll("button").find((b) => b.text().trim() === "Stop work");
    expect(stopButton, "stop work button present").toBeTruthy();
    await stopButton!.trigger("click");
    await flush();

    // Reproduce the parent drawer being dismissed while the body modal is open.
    ui.close();
    await flush();
    expect(ui.active).toBeNull();

    const confirmButton = wrapper.findAll("button").find((b) => b.text().trim() === "Stop Work");
    expect(confirmButton, "modal confirm button present").toBeTruthy();
    await confirmButton!.trigger("click");
    await flush();

    expect(
      calls.some((c) => c.url.endsWith("/abandon") && c.opts?.method === "POST"),
      "captured task was abandoned",
    ).toBe(true);
    expect(repo.toasts.some((t) => /no task selected/i.test(t.message))).toBe(false);
  });

  it("keeps the captured task after a failed stop so it can be retried", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ status: "active" });
    let abandonCall = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/api/agents/queued")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: false, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/abandon") && opts?.method === "POST") {
          abandonCall++;
          // First attempt fails; the modal must stay open with the task intact.
          if (abandonCall === 1)
            return { ok: false, status: 500, json: async () => ({ error: "boom" }) };
          return json({ ok: true });
        }
        return json({ ok: true });
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    const stopButton = wrapper.findAll("button").find((b) => b.text().trim() === "Stop work");
    await stopButton!.trigger("click");
    await flush();

    const confirmButton = () =>
      wrapper.findAll("button").find((b) => b.text().trim() === "Stop Work");
    expect(confirmButton(), "modal still open after first open").toBeTruthy();
    await confirmButton()!.trigger("click");
    await flush();

    // The failed request surfaced an error toast but the modal did NOT close.
    expect(repo.toasts.length).toBeGreaterThan(0);
    expect(confirmStopWorkVisible(wrapper)).toBe(true);

    // Retry: the captured task is still there, so the second attempt succeeds.
    await confirmButton()!.trigger("click");
    await flush();

    expect(abandonCall).toBe(2);
    expect(repo.toasts.some((t) => /no task selected/i.test(t.message))).toBe(false);
  });

  it("ignores ESC while a stop request is in flight", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ status: "active" });
    const release: { fn: (() => void) | null } = { fn: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/api/agents/queued")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: false, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/abandon") && opts?.method === "POST") {
          // Never resolves during the test so busy stays true.
          return new Promise((resolve) => {
            release.fn = () => resolve(json({ ok: true }));
          });
        }
        return json({ ok: true });
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    await wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "Stop work")!
      .trigger("click");
    await flush();
    await wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "Stop Work")!
      .trigger("click");
    await flush();

    expect(ui.saving && release.fn !== null, "stop request in flight").toBe(true);

    // Press ESC while busy — the modal must stay open.
    await wrapper.find(".stop-work-modal").trigger("keydown", { key: "Escape" });
    await flush();
    expect(confirmStopWorkVisible(wrapper)).toBe(true);

    // Release the in-flight request; now ESC closes the modal.
    release.fn?.();
    await flush();
  });
});

/** Whether the stop-work confirmation modal is currently rendered. */
function confirmStopWorkVisible(wrapper: ReturnType<typeof mount>): boolean {
  return wrapper.findAll(".stop-work-modal").length > 0;
}
