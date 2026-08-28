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
});
