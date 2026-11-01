import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS,
  planActiveWithoutEngineerRecovery,
} from "../../core/active-without-engineer-recovery.js";
import { taskCountsTowardEngineerCap, countEngineerCapUsage } from "../../core/engineer-slot.js";
import { clearTerminalStateForDone } from "../../core/done-task-cleanup.js";
import type { Task } from "../../core/types.js";

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "0001",
    title: "t",
    type: "bug",
    status: "active",
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    body: "",
    absPath: "/x",
    isArchived: false,
    ...overrides,
  } as Task;
}

describe("planActiveWithoutEngineerRecovery (#0993)", () => {
  it("recovers after the window with no live engineer", () => {
    const plan = planActiveWithoutEngineerRecovery({
      task: baseTask(),
      now: Date.now(),
      windowMs: DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS,
      running: false,
      queued: false,
      handoffInFlight: false,
      pendingHandoff: false,
      paused: false,
      held: false,
      humanAssigned: false,
      closingOut: false,
      stoppedByPerson: false,
      idleMs: DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS + 1,
    });
    expect(plan).toEqual({ action: "recover" });
  });

  it("skips held and human-assigned tasks", () => {
    expect(
      planActiveWithoutEngineerRecovery({
        task: baseTask(),
        now: Date.now(),
        windowMs: DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS,
        running: false,
        queued: false,
        handoffInFlight: false,
        pendingHandoff: false,
        paused: false,
        held: true,
        humanAssigned: false,
        closingOut: false,
        stoppedByPerson: false,
        idleMs: DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS + 1,
      }).action,
    ).toBe("skip");
  });
});

describe("engineer cap (#0993)", () => {
  it("does not count active tasks without a live engineer", () => {
    const signals = { isRunning: () => false, isQueued: () => false };
    expect(taskCountsTowardEngineerCap(baseTask(), signals)).toBe(false);
    expect(countEngineerCapUsage([baseTask()], signals)).toBe(0);
  });

  it("counts a task with a running engineer", () => {
    const signals = { isRunning: (id: string) => id === "0001" };
    expect(countEngineerCapUsage([baseTask()], signals)).toBe(1);
  });
});

describe("clearTerminalStateForDone (#0993)", () => {
  it("clears needs_input, debug tl;dr, and hold fields", () => {
    const task = baseTask({
      status: "done",
      needsInput: true,
      needsInputReason: "dev-error",
      needsInputDetail: "x",
      debugTldr: "y",
      isHeld: true,
      holdReason: "old",
      tags: ["hold"],
    });
    expect(clearTerminalStateForDone(task)).toBe(true);
    expect(task.needsInput).toBe(false);
    expect(task.needsInputDetail).toBeUndefined();
    expect(task.debugTldr).toBeUndefined();
    expect(task.isHeld).toBe(false);
    expect(task.tags).toEqual([]);
  });
});
