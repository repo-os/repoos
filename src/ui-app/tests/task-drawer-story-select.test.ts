/**
 * Task drawer story dropdown (#0525): with stories enabled, Story replaces Assigned
 * to on the Area row and uses the shared Select components.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
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

async function mountDrawer(pinia: Pinia, task: Task, storiesEnabled: boolean): Promise<VueWrapper> {
  useConfigStore().data = { stories: { enabled: storiesEnabled } };
  useRepoStore().tasks = [task];
  useRepoStore().storyDefinitions = [
    {
      key: "alpha slice",
      name: "Alpha slice",
      number: "0001",
      path: "stories/alpha-slice.md",
      body: "# Alpha",
      createdAt: "2026-09-01T00:00:00Z",
      createdBy: "hello@repoos.org",
    },
  ];
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/stories", name: "stories", component: { template: "<div />" } }],
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

describe("task drawer story select (#0525)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("with stories enabled, shows Story beside Area with Select items (no Assigned to datalist)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ story: "Alpha slice", assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, true);

    const details = wrapper.find(".drawer-body");
    expect(details.text()).not.toContain("Assigned to");
    expect(details.find("datalist#story-options").exists()).toBe(false);

    const areaRow = details.find("#et-area").element.closest(".field-row");
    expect(areaRow, "Area should sit in a field-row with Story").toBeTruthy();
    expect(areaRow!.querySelector("#et-story")).toBeTruthy();
    expect(areaRow!.querySelector("#et-assignee")).toBeFalsy();

    const storyTrigger = wrapper.find("#et-story");
    expect(storyTrigger.attributes("role")).toBe("combobox");
    expect(storyTrigger.text()).toContain("Alpha slice");

    const drawerSource = readFileSync(
      join(resolve(__dirname, ".."), "src/components/TaskDrawer.vue"),
      "utf8",
    );
    expect(drawerSource).not.toContain('list="story-options"');
    expect(drawerSource).toContain('<SelectItem :value="STORY_NONE_SELECT">No story</SelectItem>');
    expect(drawerSource).toContain(
      '<SelectItem v-for="name in storyOptions" :key="name" :value="name">',
    );

    const openBtn = wrapper.find('button[aria-label^="Open story"]');
    expect(openBtn.exists()).toBe(true);
    expect(openBtn.attributes("aria-label")).toBe('Open story "Alpha slice" (#0001)');
  });

  it("hides the go-to-story button when the task has no story", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ story: "", assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, true);

    expect(wrapper.find('button[aria-label^="Open story"]').exists()).toBe(false);
  });

  it("closes the drawer and navigates to the story panel", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ story: "Alpha slice", assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, true);
    const ui = useUiStore();
    const router = wrapper.vm.$router;
    const push = vi.spyOn(router, "push");

    await wrapper.find('button[aria-label^="Open story"]').trigger("click");
    await flush();

    expect(ui.active).toBeNull();
    expect(push).toHaveBeenCalledWith({ name: "stories", query: { story: "0001" } });
  });

  it("navigates tag-only stories by key", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ story: "Tag only", assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, true);
    const router = wrapper.vm.$router;
    const push = vi.spyOn(router, "push");

    await wrapper.find('button[aria-label^="Open story"]').trigger("click");
    await flush();

    expect(push).toHaveBeenCalledWith({ name: "stories", query: { story: "tag only" } });
  });

  it("with stories disabled, keeps Assigned to and hides Story", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, false);

    const details = wrapper.find(".drawer-body");
    expect(details.text()).toContain("Assigned to");
    expect(details.find("#et-story").exists()).toBe(false);
    expect(details.find("#et-assignee").exists()).toBe(true);
    expect(wrapper.find('button[aria-label^="Open story"]').exists()).toBe(false);
  });

  it("with stories disabled, hides the go-to-story button even when the task has a story", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ story: "Alpha slice", assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, false);

    expect(wrapper.find("#et-story").exists()).toBe(false);
    expect(wrapper.find('button[aria-label^="Open story"]').exists()).toBe(false);
  });

  it("navigates to the story without saving unsaved drawer edits", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ story: "Alpha slice", title: "Original title", assignedTo: "ai" });
    stubApi(task);
    wrapper = await mountDrawer(pinia, task, true);
    const ui = useUiStore();
    const repo = useRepoStore();
    const patchSpy = vi.spyOn(repo, "patchTask").mockResolvedValue(task);

    const titleInput = wrapper.find("#et-title");
    await titleInput.setValue("Edited title");
    expect(wrapper.find(".save-bar").exists()).toBe(true);

    await wrapper.find('button[aria-label^="Open story"]').trigger("click");
    await flush();

    expect(patchSpy).not.toHaveBeenCalled();
    expect(ui.active).toBeNull();
  });
});
