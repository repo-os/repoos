/**
 * Debug-tab focus (#0458): clicking the integration pipeline's `check` stage
 * opens the task's Debug tab and asks it to reveal the merge-gate check run.
 * These tests mount DebugPanel directly and drive the shared `debugCheckFocus`
 * request — covering a run that already happened, and one that starts after the
 * click (the "not yet run" case).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import DebugPanel from "../src/components/DebugPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task, TaskCheckRun } from "../src/types";

const TASK = {
  id: "0042",
  title: "Fixture",
  body: "",
  status: "review",
  git: { worktreePath: null, dirty: false },
} as unknown as Task;

function mergeGateRun(over: Partial<TaskCheckRun> = {}): TaskCheckRun {
  return {
    id: "0042-merge-gate-1",
    taskId: "0042",
    kind: "merge-gate",
    startedAt: new Date("2026-09-20T07:00:00Z").toISOString(),
    finishedAt: null,
    durationMs: null,
    running: true,
    passed: null,
    code: null,
    output: "checking…",
    ...over,
  };
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ now: new Date("2026-09-20T07:01:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

function render() {
  return mount(DebugPanel, {
    props: { task: TASK },
    global: { plugins: [pinia], stubs: { teleport: true } },
  });
}

describe("DebugPanel check focus", () => {
  it("reveals and expands a check run that already exists", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.taskChecks[TASK.id] = [mergeGateRun()];
    ui.focusDebugCheck(TASK.id, "merge-gate");

    const wrapper = render();
    await nextTick();
    await nextTick();

    expect(ui.debugCheckFocus).toBeNull();
    const log = wrapper.find(".debug-log-inline");
    expect(log.exists()).toBe(true);
    expect(log.text()).toContain("checking…");
  });

  it("waits for a not-yet-started check, then reveals it when it begins", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.taskChecks[TASK.id] = [];
    ui.focusDebugCheck(TASK.id, "merge-gate");

    const wrapper = render();
    await nextTick();
    await nextTick();

    // Nothing to show yet — the focus is held, not silently dropped.
    expect(ui.debugCheckFocus).not.toBeNull();
    expect(wrapper.find(".debug-log-inline").exists()).toBe(false);

    repo.taskChecks[TASK.id] = [mergeGateRun({ output: "late output" })];
    await nextTick();
    await nextTick();

    expect(ui.debugCheckFocus).toBeNull();
    expect(wrapper.find(".debug-log-inline").text()).toContain("late output");
  });

  it("ignores focus aimed at a different task", async () => {
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.taskChecks[TASK.id] = [mergeGateRun()];
    ui.focusDebugCheck("9999", "merge-gate");

    const wrapper = render();
    await nextTick();
    await nextTick();

    expect(ui.debugCheckFocus).not.toBeNull();
    expect(wrapper.find(".debug-log-inline").exists()).toBe(false);
  });
});
