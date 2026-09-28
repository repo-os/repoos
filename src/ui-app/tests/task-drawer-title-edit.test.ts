/**
 * Task drawer in-place title editing (#0569): the header title is the only
 * title surface, and clicking it edits it in place — Enter/blur autosaves,
 * Esc cancels.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, json, makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function stubApi(task: Task): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountDrawer(pinia: Pinia, task: Task): Promise<VueWrapper> {
  useConfigStore().data = { stories: { enabled: false } };
  useRepoStore().tasks = [task];
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  const wrapper = mount(TaskDrawer, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: { teleport: false, Transition: true },
    },
  });
  const ui = useUiStore();
  ui.open(task);
  ui.activeTab = "details";
  await flush();
  return wrapper;
}

describe("task drawer in-place title (#0569)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  async function mountWith(task: Task): Promise<void> {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubApi(task);
    wrapper = await mountDrawer(pinia, task);
  }

  async function openEditor(): Promise<DOMWrapper<Element>> {
    await wrapper!.find(".task-title-text").trigger("click");
    await flush();
    return wrapper!.find(".task-title-input");
  }

  it("renders the title once — in the header, not the details form", async () => {
    await mountWith(makeTask({ title: "Original title" }));

    const texts = wrapper!.findAll(".task-title-text");
    expect(texts).toHaveLength(1);
    expect(texts[0].text()).toBe("Original title");

    const details = wrapper!.find(".drawer-body");
    expect(details.find("#et-title").exists()).toBe(false);
    expect(details.find('label[for="et-title"]').exists()).toBe(false);

    const drawerSource = readFileSync(
      join(resolve(__dirname, ".."), "src/components/TaskDrawer.vue"),
      "utf8",
    );
    expect(drawerSource).not.toContain('id="et-title"');
    expect(drawerSource).not.toContain('<div class="ro-value">{{ ui.active.title }}');
  });

  it("clicking the header title opens a focused, selected in-place input", async () => {
    await mountWith(makeTask({ title: "Original title" }));

    const input = await openEditor();
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("Original title");
    expect(document.activeElement).toBe(input.element);
    // The read text is gone while editing — exactly one title surface at a time.
    expect(wrapper!.find(".task-title-text").exists()).toBe(false);
  });

  it("Enter commits and autosaves, deriving the branch while planning", async () => {
    const task = makeTask({ title: "Original title", status: "ready", branch: "" });
    await mountWith(task);
    const repo = useRepoStore();
    const patchSpy = vi.spyOn(repo, "patchTask").mockResolvedValue(task);

    const input = await openEditor();
    await input.setValue("Renamed task");
    await input.trigger("keydown", { key: "Enter" });
    await flush();

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy.mock.calls[0][0]).toBe("0001");
    expect(patchSpy.mock.calls[0][1]).toEqual({
      title: "Renamed task",
      branch: "feat/renamed-task",
    });
    expect(wrapper!.find(".task-title-input").exists()).toBe(false);
  });

  it("blur commits the edit", async () => {
    const task = makeTask({ title: "Original title" });
    await mountWith(task);
    const patchSpy = vi.spyOn(useRepoStore(), "patchTask").mockResolvedValue(task);

    const input = await openEditor();
    await input.setValue("Blur saved");
    await input.trigger("blur");
    await flush();

    expect(patchSpy).toHaveBeenCalledWith("0001", expect.objectContaining({ title: "Blur saved" }));
  });

  it("Esc cancels without saving", async () => {
    const task = makeTask({ title: "Original title" });
    await mountWith(task);
    const patchSpy = vi.spyOn(useRepoStore(), "patchTask").mockResolvedValue(task);

    const input = await openEditor();
    await input.setValue("Discarded");
    await input.trigger("keydown", { key: "Escape" });
    await flush();

    expect(patchSpy).not.toHaveBeenCalled();
    expect(wrapper!.find(".task-title-input").exists()).toBe(false);
    expect(wrapper!.find(".task-title-text").text()).toBe("Original title");
  });

  it("ignores an empty title (reverts, saves nothing)", async () => {
    const task = makeTask({ title: "Original title" });
    await mountWith(task);
    const patchSpy = vi.spyOn(useRepoStore(), "patchTask").mockResolvedValue(task);

    const input = await openEditor();
    await input.setValue("   ");
    await input.trigger("keydown", { key: "Enter" });
    await flush();

    expect(patchSpy).not.toHaveBeenCalled();
    expect(wrapper!.find(".task-title-text").text()).toBe("Original title");
  });

  it("stays editable for an active task and never rewrites its branch", async () => {
    const task = makeTask({
      title: "Active task",
      status: "active",
      branch: "feat/active-task",
    });
    await mountWith(task);
    const patchSpy = vi.spyOn(useRepoStore(), "patchTask").mockResolvedValue(task);

    const input = await openEditor();
    await input.setValue("Renamed live task");
    await input.trigger("keydown", { key: "Enter" });
    await flush();

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy.mock.calls[0][1]).toEqual({ title: "Renamed live task" });
  });
});
