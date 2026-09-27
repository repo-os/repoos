/**
 * Stories page (#0480): the disabled gate, empty states, grouping and status
 * roll-up, ordering, the side panel that replaced inline expansion (#0502),
 * opening the task drawer, and the mobile layout rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import StoriesView from "../src/views/StoriesView.vue";
import { useConfigStore } from "../src/stores/config";
import { STORIES_PAGE_SORT_ORDER_OPTIONS, useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { makeTask } from "./component-test-helpers";

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const TaskCardStub = {
  name: "TaskCard",
  props: ["task", "dragEnabled"],
  template: '<div class="stub-task" :data-id="task.id"></div>',
};

const NewStoryPanelStub = { template: "<div />" };

/**
 * The panel has its own suite (story-panel.test.ts); here it is stubbed so
 * these tests stay about the list itself and never leave a teleported dialog
 * behind in `document.body`.
 */
const StoryPanelStub = {
  name: "StoryPanel",
  props: ["story", "pmWorking"],
  emits: ["close"],
  template: '<div v-if="story" class="stub-story-panel">{{ story.name }}</div>',
};

function mountView() {
  return mount(StoriesView, {
    global: {
      stubs: {
        TaskCard: TaskCardStub,
        NewStoryPanel: NewStoryPanelStub,
        StoryPanel: StoryPanelStub,
      },
    },
  });
}

function setTasks(tasks: ReturnType<typeof makeTask>[]): void {
  const repo = useRepoStore();
  repo.tasks = tasks;
}

describe("StoriesView disabled gate", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("shows the opt-in empty state and no stories when disabled", () => {
    const config = useConfigStore();
    config.data = {};
    setTasks([makeTask({ story: "Hidden slice" })]);
    const wrapper = mountView();
    expect(wrapper.text()).toContain("aren't enabled");
    expect(wrapper.findAll(".story-card")).toHaveLength(0);
  });

  it("does not render a story control or stories when the flag is malformed", () => {
    const config = useConfigStore();
    config.data = { stories: { enabled: "yes" } };
    setTasks([makeTask({ story: "Hidden slice" })]);
    const wrapper = mountView();
    expect(wrapper.findAll(".story-card")).toHaveLength(0);
  });
});

describe("StoriesView grouping and roll-up", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useConfigStore().data = { stories: { enabled: true } };
  });

  it("shows a registered story with zero tasks", () => {
    setTasks([makeTask({ id: "0001", status: "ready" })]);
    useRepoStore().storyDefinitions = [
      {
        key: "planned",
        name: "Planned slice",
        path: "stories/planned-slice.md",
        body: "Scope for later.",
        createdAt: "2026-09-01T00:00:00Z",
        createdBy: "hello@repoos.org",
      },
    ];
    const wrapper = mountView();
    expect(wrapper.findAll(".story-card")).toHaveLength(1);
    expect(wrapper.text()).toContain("Planned slice");
    expect(wrapper.text()).toContain("No tasks tagged yet");
  });

  it("groups tagged tasks and ignores untagged ones", () => {
    setTasks([
      makeTask({ id: "0001", story: "Project updates email", status: "done" }),
      makeTask({ id: "0002", story: "project updates email", status: "active" }),
      makeTask({ id: "0003", story: "Other slice", status: "ready" }),
      makeTask({ id: "0004", status: "ready" }),
    ]);
    const wrapper = mountView();
    const cards = wrapper.findAll(".story-card");
    expect(cards).toHaveLength(2);
    const emailCard = cards.find((c) => /project updates email/i.test(c.text()))!;
    expect(emailCard.find(".story-frac").text()).toBe("1/2");
    expect(emailCard.findAll(".story-chip").length).toBeGreaterThan(0);
  });

  it("derives completion and marks the card quiet only when all tasks are done", () => {
    setTasks([
      makeTask({ id: "0001", story: "Shipped", status: "done" }),
      makeTask({ id: "0002", story: "Shipped", status: "done" }),
      makeTask({ id: "0003", story: "In flight", status: "active" }),
    ]);
    const wrapper = mountView();
    const shipped = wrapper.findAll(".story-card").find((c) => c.text().includes("Shipped"))!;
    expect(shipped.classes()).toContain("complete");
    expect(shipped.text()).toContain("complete");
  });

  it("defaults to most recently updated first", () => {
    setTasks([
      makeTask({
        id: "0001",
        story: "Complete",
        status: "done",
        updated_at: "2026-09-09T00:00:00Z",
      }),
      makeTask({ id: "0002", story: "Quiet", status: "ready", updated_at: "2026-09-08T00:00:00Z" }),
      makeTask({
        id: "0003",
        story: "Active",
        status: "active",
        updated_at: "2026-09-07T00:00:00Z",
      }),
      makeTask({
        id: "0004",
        story: "Attention",
        status: "active",
        needsInput: true,
        updated_at: "2026-09-06T00:00:00Z",
      }),
    ]);
    const names = mountView()
      .findAll(".story-name")
      .map((n) => n.text());
    expect(names).toEqual(["Complete", "Quiet", "Active", "Attention"]);
  });

  it("shows New story in the header when enabled", () => {
    setTasks([]);
    const wrapper = mountView();
    expect(wrapper.text()).toContain("New story");
    expect(wrapper.find(".new-btn").exists()).toBe(true);
  });

  it("shows an empty state when nothing is tagged", () => {
    setTasks([makeTask({ id: "0001", status: "ready" })]);
    const wrapper = mountView();
    expect(wrapper.text()).toContain("No stories yet");
  });

  it("refreshes the roll-up when a task is retagged", async () => {
    const tasks = [
      makeTask({ id: "0001", story: "Alpha", status: "ready" }),
      makeTask({ id: "0002", story: "Alpha", status: "ready" }),
    ];
    setTasks(tasks);
    const wrapper = mountView();
    expect(wrapper.findAll(".story-card")).toHaveLength(1);

    const repo = useRepoStore();
    repo.tasks = [{ ...tasks[0], story: "Beta" }, { ...tasks[1] }];
    await wrapper.vm.$nextTick();
    const names = wrapper.findAll(".story-name").map((n) => n.text());
    expect(names.sort()).toEqual(["Alpha", "Beta"]);
  });
});

describe("StoriesView sort dropdown (#0536)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useConfigStore().data = { stories: { enabled: true } };
  });

  it("renders the sort control and excludes priority from its option set", () => {
    setTasks([makeTask({ id: "0001", story: "Slice", status: "ready" })]);
    const wrapper = mountView();
    expect(wrapper.find('[role="combobox"]').exists()).toBe(true);
    expect(STORIES_PAGE_SORT_ORDER_OPTIONS).toHaveLength(3);
    expect(STORIES_PAGE_SORT_ORDER_OPTIONS.some((o) => o.label === "Priority level")).toBe(false);
  });

  it("re-orders the list when story number sort is selected", async () => {
    setTasks([
      makeTask({ id: "0001", story: "Alpha", status: "ready", updated_at: "2026-09-09T00:00:00Z" }),
      makeTask({ id: "0002", story: "Beta", status: "ready", updated_at: "2026-09-01T00:00:00Z" }),
    ]);
    useRepoStore().storyDefinitions = [
      {
        key: "alpha",
        name: "Alpha",
        number: "0001",
        path: "stories/alpha.md",
        body: "",
        createdAt: "2026-09-01T00:00:00Z",
        createdBy: "hello@repoos.org",
      },
      {
        key: "beta",
        name: "Beta",
        number: "0099",
        path: "stories/beta.md",
        body: "",
        createdAt: "2026-09-01T00:00:00Z",
        createdBy: "hello@repoos.org",
      },
    ];
    const repo = useRepoStore();
    repo.setStoriesPageSortOrder("taskNumberNewest");
    const wrapper = mountView();
    await wrapper.vm.$nextTick();
    const names = wrapper.findAll(".story-name").map((n) => n.text());
    expect(names).toEqual(["Beta", "Alpha"]);
  });
});

describe("StoriesView copy-link number (#0515)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useConfigStore().data = { stories: { enabled: true } };
  });

  it("leads each registered story's card with the number, in the upper left", () => {
    setTasks([makeTask({ id: "0001", story: "Slice", status: "ready" })]);
    useRepoStore().storyDefinitions = [
      {
        key: "slice",
        name: "Slice",
        number: "0042",
        path: "stories/slice.md",
        body: "Scope.",
        createdAt: "2026-09-01T00:00:00Z",
        createdBy: "hello@repoos.org",
      },
    ];
    const card = mountView().find(".story-card");
    const number = card.find(".copyable-number");
    expect(number.text()).toBe("#0042");
    expect(number.attributes("aria-label")).toBe("Copy link to story 0042");
    // Upper left: the chip row is the card's first child, above the head button
    // that carries the name.
    expect(card.element.firstElementChild!.classList.contains("story-number-row")).toBe(true);
    expect(card.find(".story-number-row").find(".copyable-number").exists()).toBe(true);
  });

  it("keeps the copy button out of the card's own button, which is invalid markup", () => {
    setTasks([makeTask({ id: "0001", story: "Slice", status: "ready" })]);
    useRepoStore().storyDefinitions = [
      {
        key: "slice",
        name: "Slice",
        number: "0042",
        path: "stories/slice.md",
        body: "Scope.",
        createdAt: "2026-09-01T00:00:00Z",
        createdBy: "hello@repoos.org",
      },
    ];
    const head = mountView().find(".story-head");
    expect(head.find(".copyable-number").exists()).toBe(false);
  });

  it("leaves a tag-only story without a number, having nothing stable to show", () => {
    setTasks([makeTask({ id: "0001", story: "Tag only", status: "ready" })]);
    useRepoStore().storyDefinitions = [];
    expect(mountView().find(".copyable-number").exists()).toBe(false);
  });
});

describe("StoriesView side panel selection", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useConfigStore().data = { stories: { enabled: true } };
  });

  it("opens the story side panel when a story row is selected", async () => {
    setTasks([makeTask({ id: "0001", story: "Slice", status: "ready" })]);
    const wrapper = mountView();
    expect(wrapper.find(".stub-story-panel").exists()).toBe(false);
    await wrapper.find(".story-head").trigger("click");
    expect(wrapper.find(".stub-story-panel").text()).toBe("Slice");
  });

  it("marks the row as opening a dialog rather than expanding in place", async () => {
    setTasks([makeTask({ id: "0001", story: "Slice", status: "ready" })]);
    const wrapper = mountView();
    const head = wrapper.find(".story-head");
    expect(head.attributes("aria-haspopup")).toBe("dialog");
    // The inline expand is gone — #0502 replaced it with the panel, so a
    // click must not leave member cards behind in the list.
    expect(wrapper.findAll(".stub-task")).toHaveLength(0);
    await head.trigger("click");
    expect(wrapper.findAll(".stub-task")).toHaveLength(0);
  });

  it("swaps the panel's story when a second row is selected", async () => {
    setTasks([
      makeTask({
        id: "0001",
        story: "Slice",
        status: "active",
        updated_at: "2026-09-09T00:00:00Z",
      }),
      makeTask({
        id: "0002",
        story: "Other",
        status: "ready",
        updated_at: "2026-09-01T00:00:00Z",
      }),
    ]);
    const wrapper = mountView();
    const heads = wrapper.findAll(".story-head");
    await heads[0].trigger("click");
    expect(wrapper.find(".stub-story-panel").text()).toBe("Slice");
    await heads[1].trigger("click");
    expect(wrapper.find(".stub-story-panel").text()).toBe("Other");
  });

  it("opens the normal task drawer when a live task row is selected", async () => {
    setTasks([makeTask({ id: "0007", story: "Slice", status: "active" })]);
    const wrapper = mountView();
    await wrapper.find(".story-live-row").trigger("click");
    expect(useUiStore().active?.id).toBe("0007");
  });
});

describe("StoriesView mobile layout", () => {
  it("collapses the story head's progress bar to the full width at the page breakpoint", () => {
    const source = readFileSync(
      join(resolve(__dirname, ".."), "src/views/StoriesView.vue"),
      "utf8",
    );
    expect(source).toMatch(/@media \(max-width: 720px\)/);
    expect(source).toMatch(/\.story-progress-wrap\s*\{[^}]*width:\s*100%/);
  });
});
