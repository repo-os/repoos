import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import HoldTaskDialog from "../src/components/HoldTaskDialog.vue";
import TaskCard from "../src/components/TaskCard.vue";
import type { Task } from "../src/types";
import { isHoldActive } from "../../core/task-selection.js";

const task = (over: Partial<Task> = {}): Task => ({
  id: "0042",
  title: "Held task",
  type: "feature",
  status: "done",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0042-held.md",
  absPath: "/tmp/work/0042-held.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  ...over,
});

describe("held task UI", () => {
  it.each([
    ["flag", { isHeld: true }, true],
    ["tag", { tags: ["hold"] }, true],
    ["expired hold", { isHeld: true, holdUntil: "2020-01-01T00:00:00Z" }, false],
    ["unheld", { isHeld: false, tags: [] }, false],
  ])("uses isHoldActive for %s", (_label, task, expected) => {
    expect(isHoldActive(task, Date.parse("2026-01-01T00:00:00Z"))).toBe(expected);
  });

  it("requires a reason and emits the hold request with the optional date", async () => {
    const wrapper = mount(HoldTaskDialog, { props: { open: true } });
    const submit = wrapper.findAll("button").find((button) => button.text().includes("Hold task"))!;
    expect(submit.attributes("disabled")).toBeDefined();
    await wrapper.find("textarea").setValue("Waiting for a dependency");
    await wrapper.find('input[type="date"]').setValue("2026-12-01");
    expect(submit.attributes("disabled")).toBeUndefined();
    await submit.trigger("click");
    expect(wrapper.emitted("hold")?.[0]?.[0]).toMatchObject({ reason: "Waiting for a dependency" });
    expect(Date.parse((wrapper.emitted("hold")?.[0]?.[0] as { until: string }).until)).toBeTruthy();
  });

  it.each([
    ["flag", { isHeld: true }, true],
    ["tag", { tags: ["hold"] }, true],
    ["expired", { isHeld: true, holdUntil: "2020-01-01T00:00:00Z" }, false],
    ["clear", { isHeld: false }, false],
  ])("renders the card chip for %s state", async (_label, holdFields, visible) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(TaskCard, {
      props: { task: task(holdFields), dragEnabled: false },
      global: { plugins: [pinia], stubs: { ActivityIndicator: true } },
    });
    const chip = wrapper.find(".tc-held");
    expect(chip.exists()).toBe(visible);
    if (visible) {
      expect(chip.attributes("role")).toBe("img");
      expect(chip.attributes("aria-label")).toContain("Task held");
    }
    wrapper.unmount();
  });

  it("shows the short auto-release date on the chip", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(TaskCard, {
      props: {
        task: task({ isHeld: true, holdUntil: "2030-12-01T00:00:00Z" }),
        dragEnabled: false,
      },
      global: { plugins: [pinia], stubs: { ActivityIndicator: true } },
    });
    const untilLabel = new Date("2030-12-01T00:00:00Z").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    expect(wrapper.find(".tc-held").text()).toContain(`until ${untilLabel}`);
    wrapper.unmount();
  });

  it("keeps the held status hint separate from the held chip on active cards", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(TaskCard, {
      props: {
        task: task({ status: "active", isHeld: true, holdReason: "Waiting for review" }),
        dragEnabled: false,
      },
      global: { plugins: [pinia], stubs: { ActivityIndicator: true } },
    });

    expect(wrapper.find(".tc-held").exists()).toBe(true);
    expect(wrapper.find(".tc-held-hint").text()).toContain("held");
    expect(wrapper.find(".tc-held-hint").classes()).not.toContain("tc-held");
    wrapper.unmount();
  });
});
