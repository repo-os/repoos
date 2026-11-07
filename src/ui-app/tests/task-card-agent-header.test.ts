/**
 * #1054 — robot control stays in the card header row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import { EMPTY_COUNTS, json, makeTask } from "./component-test-helpers";

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("task card agent button placement", () => {
  it("renders the robot in the header row with and without a checks block", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        return json({ ok: true });
      }),
    );
    const task = makeTask({ status: "active" });
    const repo = useRepoStore();
    const props = { task, dragEnabled: false };
    let wrapper = mount(TaskCard, { props, global: { plugins: [pinia] } });
    await nextTick();
    const headerRobot = wrapper.find('[data-test-id="task-card-agent-btn"]');
    expect(headerRobot.exists()).toBe(true);
    expect(headerRobot.element.closest(".flex.items-center.gap-\\[7px\\]")).toBeTruthy();
    wrapper.unmount();

    repo.handoffSteps[task.id] = "check";
    repo.taskChecks[task.id] = [
      {
        id: "0001-gate",
        taskId: task.id,
        kind: "handoff-finalize",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
        running: true,
        passed: null,
        code: null,
        output: "",
        scope: "changed:main",
        machine: "air",
        testsDone: 3,
        testsTotal: 680,
      },
    ];
    wrapper = mount(TaskCard, { props, global: { plugins: [pinia] } });
    await nextTick();
    expect(wrapper.find('[data-test-id="task-card-check-progress"]').exists()).toBe(true);
    expect(wrapper.find('[data-test-id="task-card-agent-btn"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
