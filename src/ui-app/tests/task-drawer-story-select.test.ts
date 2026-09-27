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
import Select from "../src/components/ui/select/root.vue";
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
    expect(openBtn.text()).toBe("go to story ↗");
    expect(openBtn.element.parentElement?.classList.contains("field-header")).toBe(true);
    expect(storyTrigger.element.parentElement).toBe(openBtn.element.parentElement?.parentElement);
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

/**
 * The New task panel's story field (#0555): the Story panel hands its story to
 * `ui.openNewTask`, and BOTH create modes have to carry it — Freeform is the
 * default, so a story that only rides the Manual path is a story most users
 * silently lose.
 */
describe("new task panel story (#0555)", () => {
  let wrapper: VueWrapper | undefined;
  let push: ReturnType<typeof vi.spyOn>;

  const ALPHA_DEF = {
    key: "alpha slice",
    name: "Alpha slice",
    number: "0001",
    path: "stories/alpha-slice.md",
    body: "# Alpha",
    createdAt: "2026-09-01T00:00:00Z",
    createdBy: "hello@repoos.org",
  };

  /** Every route the two create paths can navigate to. */
  const routes = [
    { path: "/stories", name: "stories", component: { template: "<div />" } },
    { path: "/work", name: "work", component: { template: "<div />" } },
    { path: "/", component: { template: "<div />" } },
  ];

  function stubNewTaskApi(): void {
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (u.includes("/api/index") || u.includes("/api/board"))
          return json({
            tasks: [],
            counts: { ...EMPTY_COUNTS },
            taskCount: 0,
            storyDefinitions: [ALPHA_DEF],
          });
        if (u.includes("/api/agents/running")) return json({ tasks: [] });
        if (u.includes("/api/tasks/freeform"))
          return json({
            ok: true,
            fallback: false,
            // The server marks the run in flight before responding, so the
            // response task carries pmWorking (the optimistic local flag).
            task: makeTask({ id: "0555", path: "work/0555-test.md", pmWorking: true }),
          });
        if (u.includes("/api/tasks")) return json(makeTask({ id: "0555" }));
        return json({ ok: true, tasks: [], agents: [] });
      }),
    );
  }

  async function mountNewTask(
    opts: { storiesEnabled?: boolean; story?: string } = {},
  ): Promise<VueWrapper> {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubNewTaskApi();
    useConfigStore().data = { stories: { enabled: opts.storiesEnabled ?? true } };
    const repo = useRepoStore();
    repo.tasks = [makeTask({ id: "0001", story: "Alpha slice" })];
    repo.storyDefinitions = [ALPHA_DEF];

    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/");
    await router.isReady();

    wrapper = mount(TaskDrawer, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: { teleport: false, Transition: true },
      },
    });
    push = vi.spyOn(router, "push");
    useUiStore().openNewTask("", opts.story ?? "");
    await flush();
    return wrapper;
  }

  /** The Manual tab's Create button (not Freeform's "Create task"/"draft"). */
  async function goManual(): Promise<void> {
    const manual = wrapper!
      .findAll(".drawer-tabs .tab-btn")
      .find((b) => b.text().includes("Manual"));
    expect(manual, "Manual tab missing").toBeTruthy();
    await manual!.trigger("click");
    await flush();
  }

  async function createManual(title: string): Promise<void> {
    await goManual();
    await wrapper!.find("#nt-title").setValue(title);
    const create = wrapper!.findAll("button").find((b) => b.text().trim() === "Create");
    expect(create, "manual Create button missing").toBeTruthy();
    await create!.trigger("click");
    await flush();
  }

  /** Type a description and submit the Freeform form — the default mode. */
  async function submitFreeform(): Promise<void> {
    expect(wrapper!.find("#nt-freeform").exists()).toBe(true);
    await wrapper!.find("#nt-freeform").setValue("Add a company dashboard");
    const create = wrapper!.findAll("button").find((b) => b.text().trim() === "Create task");
    expect(create, "freeform Create task button missing").toBeTruthy();
    await create!.trigger("click");
    await flush();
  }

  /** Click a control by exact label on the acknowledgment panel. */
  async function clickAckButton(label: string): Promise<void> {
    expect(wrapper!.find(".ff-done").exists(), "acknowledgment panel not showing").toBe(true);
    const btn = wrapper!.findAll("button").find((b) => b.text().trim() === label);
    expect(btn, `no "${label}" button on the acknowledgment panel`).toBeTruthy();
    await btn!.trigger("click");
    await flush();
  }

  /**
   * Body of the POST to `path`. `/api/tasks` also matches the freeform route,
   * so the freeform test passes `freeform` to select that one specifically.
   */
  function postBody(path: string, freeform = false): Record<string, unknown> {
    const call = vi.mocked(fetch).mock.calls.find((c) => {
      const u = String(c[0]);
      if (!u.includes(path)) return false;
      return freeform ? u.includes("freeform") : !u.includes("freeform");
    });
    expect(call, `no POST to ${path}`).toBeTruthy();
    return JSON.parse(String((call![1] as RequestInit | undefined)?.body ?? "{}")) as Record<
      string,
      unknown
    >;
  }

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("shows the preset story as visible text, in one control shared by both modes", async () => {
    await mountNewTask({ story: "Alpha slice" });

    // Visible as text — a hidden prefilled value would not tell the user where
    // the task is about to land.
    const trigger = wrapper!.find("#nt-story");
    expect(trigger.exists()).toBe(true);
    expect(trigger.text()).toContain("Alpha slice");
    // The details form's control is a different mode's; never both at once.
    expect(wrapper!.find("#et-story").exists()).toBe(false);
    expect(wrapper!.findAll("#nt-story")).toHaveLength(1);

    await goManual();
    expect(wrapper!.findAll("#nt-story")).toHaveLength(1);
    expect(wrapper!.find("#et-story").exists()).toBe(false);
    expect(wrapper!.find("#nt-story").text()).toContain("Alpha slice");
  });

  it("renders no Story control at all when stories are disabled", async () => {
    await mountNewTask({ storiesEnabled: false, story: "Alpha slice" });
    expect(wrapper!.find("#nt-story").exists()).toBe(false);
    await goManual();
    expect(wrapper!.find("#nt-story").exists()).toBe(false);
  });

  it("offers the shared options and the same none sentinel, and reflects a cleared value", async () => {
    await mountNewTask({ story: "Alpha slice" });
    const drawerSource = readFileSync(
      join(resolve(__dirname, ".."), "src/components/TaskDrawer.vue"),
      "utf8",
    );
    expect(drawerSource).toContain('<SelectItem :value="STORY_NONE_SELECT">No story</SelectItem>');
    expect(drawerSource).toContain(
      '<SelectItem v-for="name in storyOptions" :key="name" :value="name">',
    );

    // A cleared control reads "No story" rather than a stale preset.
    useUiStore().nt.story = "";
    await flush();
    expect(wrapper!.find("#nt-story").text()).toContain("No story");
  });

  it("presets nothing for a plain New task from the Work page, Dashboard or NeedsYou", async () => {
    await mountNewTask({ story: "Alpha slice" });
    const ui = useUiStore();

    ui.close();
    ui.openNewTask(); // Work page header / Dashboard
    expect(ui.nt.story).toBe("");
    ui.openNewTask("human"); // NeedsYouPanel
    expect(ui.nt.story).toBe("");
  });

  it("normalizes a preset with normalizeStoryName so it cannot fork a second story", async () => {
    await mountNewTask();
    const ui = useUiStore();
    ui.openNewTask("", "  Alpha \t  slice  ");
    expect(ui.nt.story).toBe("Alpha slice");
    expect(ui.nt.story).not.toMatch(/\s{2,}/);
  });

  it("creates an untagged task when the Story control is cleared before submitting", async () => {
    await mountNewTask({ story: "Alpha slice" });
    const ui = useUiStore();
    expect(ui.nt.story).toBe("Alpha slice");

    // Drive the control itself — the shared Select's update event, which is
    // what picking the "No story" item emits — rather than poking the store,
    // so the binding from the control to the form is what's under test.
    const select = wrapper!
      .findAllComponents(Select)
      .find((c) => c.html().includes('id="nt-story"'));
    expect(select, "the new task panel's Story select was not found").toBeTruthy();
    select!.vm.$emit("update:modelValue", "__none__"); // STORY_NONE_SELECT
    await flush();

    expect(ui.nt.story).toBe("");
    expect(wrapper!.find("#nt-story").text()).toContain("No story");

    // …and the create that follows is untagged, landing on /work like any
    // other create with no story.
    await createManual("Add company dashboard");
    expect(postBody("/api/tasks").story ?? "").toBe("");
    expect(push).toHaveBeenCalledWith("/work");
  });

  it("sends the story on the freeform (default) create, then resets it", async () => {
    await mountNewTask({ story: "Alpha slice" });
    await submitFreeform();

    expect(postBody("/api/tasks/freeform", true).story).toBe("Alpha slice");
    // Per-open context: the tag went with the create, not into the next one.
    expect(useUiStore().nt.story).toBe("");
    // …but the acknowledgment panel still knows it, for the way out.
    expect(wrapper!.find(".ff-done").exists()).toBe(true);
  });

  it("lands back on the story when the acknowledgment is dismissed with Done", async () => {
    await mountNewTask({ story: "Alpha slice" });
    await submitFreeform();
    // `nt.story` was already cleared at submit — the panel must not read it back.
    expect(useUiStore().nt.story).toBe("");

    await clickAckButton("Done");

    expect(push).toHaveBeenCalledWith({ name: "stories", query: { story: "0001" } });
    expect(useUiStore().isNew).toBe(false);
    expect(useUiStore().active).toBeNull();
  });

  it("keeps Done's navigation-free dismissal when the create carried no story", async () => {
    await mountNewTask();
    await submitFreeform();

    await clickAckButton("Done");

    expect(push).not.toHaveBeenCalled();
    expect(useUiStore().isNew).toBe(false);
  });

  it("lands back on the story when the PM finishes while the acknowledgment is up", async () => {
    await mountNewTask({ story: "Alpha slice" });
    await submitFreeform();

    const repo = useRepoStore();
    // Set optimistically from the freeform response — the run is live.
    expect(repo.pmWorkingFor("0555")).toBe(true);
    // The run's exit reconciles the flag exactly as `task.pmFinished` does, so
    // the drawer's auto-open watcher fires while the acknowledgment is showing.
    await repo.refresh();
    await flush();

    expect(push).toHaveBeenCalledWith({ name: "stories", query: { story: "0001" } });
    expect(useUiStore().isNew).toBe(false);
    expect(wrapper!.find(".ff-done").exists()).toBe(false);
  });

  it("sends the story on the manual create and lands back on that story", async () => {
    await mountNewTask({ story: "Alpha slice" });

    await createManual("Add company dashboard");

    expect(postBody("/api/tasks").story).toBe("Alpha slice");
    expect(push).toHaveBeenCalledWith({ name: "stories", query: { story: "0001" } });
    expect(useUiStore().nt.story).toBe("");
  });

  it("lands a tag-only story's create back on that story, by key", async () => {
    await mountNewTask({ story: "Tag only" });
    useRepoStore().storyDefinitions = [];

    await createManual("Add company dashboard");

    expect(postBody("/api/tasks").story).toBe("Tag only");
    expect(push).toHaveBeenCalledWith({ name: "stories", query: { story: "tag only" } });
  });

  it("keeps landing a create with no story on /work exactly as before", async () => {
    await mountNewTask();

    await createManual("Add company dashboard");

    expect(postBody("/api/tasks").story ?? "").toBe("");
    expect(push).toHaveBeenCalledWith("/work");
    expect(push).not.toHaveBeenCalledWith(expect.objectContaining({ name: "stories" }));
  });
});
