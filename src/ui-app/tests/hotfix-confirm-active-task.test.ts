import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, makeTask, FakeEventSource, json, flush } from "./component-test-helpers";

// jsdom has no Element.scrollTo; TaskDrawer calls it while streaming session output.
(Element.prototype as unknown as { scrollTo: () => void }).scrollTo ??= () => {};

describe("Hotfix confirm dialog (#0295-adjacent latent bug)", () => {
  it("still activates the hotfix when the dialog dismissed the drawer", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    const calls: Array<{ url: string; opts?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        calls.push({ url, opts });
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/api/agents/queued")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: false, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/hotfix") && opts?.method === "POST") return json({ ok: true });
        if (url.endsWith("/start") && opts?.method === "POST") return json({ ok: true });
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

    const hotfixBtn = wrapper.findAll("button").find((b) => b.text().trim() === "Hotfix");
    expect(hotfixBtn, "Hotfix button present").toBeTruthy();
    await hotfixBtn!.trigger("click");
    await flush();

    // Reproduce the radix modal dismiss the body-teleported dialog triggers.
    ui.close();
    await flush();
    expect(ui.active).toBeNull();

    const onBranch = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Hotfix on branch"));
    expect(onBranch, "dialog target button present").toBeTruthy();
    await onBranch!.trigger("click");
    await flush();

    expect(
      calls.some((c) => c.url.endsWith("/hotfix") && c.opts?.method === "POST"),
      "hotfix was activated",
    ).toBe(true);
    expect(
      calls.some((c) => c.url.endsWith("/start") && c.opts?.method === "POST"),
      "engineer was launched",
    ).toBe(true);
  });
});
