import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TaskDependencyPicker from "../src/components/TaskDependencyPicker.vue";
import type { Task } from "../src/types";

const tasks = [
  { id: "0101", title: "Build API", status: "ready" },
  { id: "0102", title: "Write docs", status: "inbox" },
  { id: "0103", title: "Create tests", status: "active" },
] as Task[];

describe("TaskDependencyPicker", () => {
  it("filters candidates, excludes the current task, and emits selected prerequisite IDs", async () => {
    const wrapper = mount(TaskDependencyPicker, {
      props: { id: "deps", tasks, modelValue: [], excludeId: "0102" },
    });

    expect(wrapper.text()).toContain("Build API");
    expect(wrapper.text()).not.toContain("Write docs");
    expect(wrapper.text()).toContain("Create tests");

    await wrapper.get("input").setValue("doc");
    expect(wrapper.text()).toContain("No matching tasks.");
    await wrapper.get("input").setValue("api");
    await wrapper.get(".dependency-option").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual(["0101"]);
  });

  it("removes a previously selected prerequisite", async () => {
    const wrapper = mount(TaskDependencyPicker, {
      props: { id: "deps", tasks, modelValue: ["0101"] },
    });

    await wrapper.get('[aria-label="Remove dependency 0101"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual([]);
  });
});
