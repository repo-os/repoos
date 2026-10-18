import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRepoOS } from "../../core/repoos.js";
import { loadConfig } from "../../core/config.js";
import { createSchedule, getSchedule } from "../../core/schedule.js";
import {
  executeScheduleRun,
  findDueSchedule,
  listDueSchedules,
  resetScheduleTickStateForTests,
} from "../../server/schedule-runner.js";

describe("schedule runner manual vs tick", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
    resetScheduleTickStateForTests();
  });

  it("manual run while due records the real occurrence key so the tick does not double-fire", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-sched-manual-due-"));
    mkdirSync(join(root, "work"), { recursive: true });
    const config = loadConfig(root);
    const repoos = createRepoOS(root);

    const created = createSchedule(config, {
      title: "Due daily",
      taskTitle: "Task",
      cadence: "daily",
      timezone: "UTC",
      timeOfDay: "09:00",
      body: "body",
    });

    const now = new Date("2020-01-07T12:00:00Z");
    const row = getSchedule(config, created.id)!;
    const due = findDueSchedule(row, now);
    expect(due).not.toBeNull();

    const outcome = executeScheduleRun(repoos, config, created.id, due!, { manual: true });
    expect(outcome.ok).toBe(true);

    const after = getSchedule(config, created.id)!;
    expect(after.lastOccurrenceKey).toBe(due!.key);
    expect(after.lastOccurrenceKey).not.toMatch(/:manual:/);

    const stillDue = listDueSchedules(config, now);
    expect(stillDue.find((s) => s.id === created.id)).toBeUndefined();
  });
});
