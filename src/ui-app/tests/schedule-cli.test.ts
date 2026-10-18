import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cmdScheduleList, cmdScheduleNew, cmdScheduleRun } from "../../commands/schedule.js";
import { listSchedules } from "../../core/schedule.js";
import { loadConfig } from "../../core/config.js";

describe("repoos schedule CLI", () => {
  let root = "";
  let prev = process.cwd();

  afterEach(() => {
    process.chdir(prev);
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("creates and lists a schedule from the board root", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-schedule-cli-"));
    mkdirSync(join(root, "work"), { recursive: true });
    process.chdir(root);
    cmdScheduleNew([
      "--title",
      "CLI schedule",
      "--task-title",
      "From CLI",
      "--cadence",
      "daily",
      "--timezone",
      "UTC",
      "--time-of-day",
      "09:00",
      "--body",
      "Spec",
    ]);
    expect(process.exitCode).not.toBe(1);
    const rows = listSchedules(loadConfig(root));
    expect(rows).toHaveLength(1);
    expect(rows[0].taskTitle).toBe("From CLI");
    cmdScheduleList([]);
    cmdScheduleRun([rows[0].id]);
    expect(process.exitCode).not.toBe(1);
  });
});
