/**
 * Stories page (#0480): the disabled gate, empty states, grouping and status
 * roll-up, ordering, expanding to member tasks, retag recomputation, opening
 * the task drawer, and the mobile layout rule.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import StoriesView from "../src/views/StoriesView.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { makeTask } from "./component-test-helpers";

const TaskCardStub = {
  name: "TaskCard",
  props: ["task", "dragEnabled"],
  template: '<div class="stub-task" :data-id="task.id"></div>',
};

function mountView() {
  return mount(StoriesView, {
    global: { stubs: { TaskCard: TaskCardStub } },
  });
}

function setTasks(tasks: ReturnType<typeof makeTask>[]): void {
  const repo = useRepoStore();
  repo.tasks = tasks;
}

describe("StoriesView disabled gate", () => {
  beforeEach(() => setActivePinia(createPinia()));

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
    setActivePinia(createPinia());
    useConfigStore().data = { stories: { enabled: true } };
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

  it("orders attention-needed work first and completed stories last", () => {
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
    expect(names).toEqual(["Attention", "Active", "Quiet", "Complete"]);
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

describe("StoriesView expansion and selection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useConfigStore().data = { stories: { enabled: true } };
  });

  it("reveals member tasks on expand", async () => {
    setTasks([
      makeTask({ id: "0001", story: "Slice", status: "ready" }),
      makeTask({ id: "0002", story: "Slice", status: "active" }),
    ]);
    const wrapper = mountView();
    expect(wrapper.findAll(".stub-task")).toHaveLength(0);
    await wrapper.find(".story-head").trigger("click");
    expect(wrapper.findAll(".stub-task")).toHaveLength(2);
  });

  it("opens the normal task drawer when a live task row is selected", async () => {
    setTasks([makeTask({ id: "0007", story: "Slice", status: "active" })]);
    const wrapper = mountView();
    await wrapper.find(".story-live-row").trigger("click");
    expect(useUiStore().active?.id).toBe("0007");
  });
});

describe("StoriesView mobile layout", () => {
  it("collapses the member grid to one column at the shared page breakpoint", () => {
    const source = readFileSync(
      join(resolve(__dirname, ".."), "src/views/StoriesView.vue"),
      "utf8",
    );
    expect(source).toMatch(/@media \(max-width: 720px\)/);
    expect(source).toMatch(/\.story-members\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
