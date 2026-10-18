import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { RepoOS } from "../core/repoos.js";
import type { RepoOSConfig } from "../core/types.js";
import { dueOccurrence, type ScheduleTimingInput } from "../core/schedule-time.js";
import type { ScheduleAutoStartDeps } from "./schedule-auto-start.js";
import { maybeAutoStartScheduledTask } from "./schedule-auto-start.js";
import {
  getSchedule,
  listSchedules,
  recordScheduleRun,
  scheduleTimingFromRow,
  taskStatusOrDefault,
  type TaskSchedule,
} from "../core/schedule.js";
import { commitTaskFile } from "../core/git.js";

export type ScheduleRunOutcome =
  | { ok: true; scheduleId: string; taskId: string; occurrenceKey: string }
  | { ok: false; scheduleId: string; occurrenceKey: string; error: string; skipped?: boolean };

function lockPath(config: RepoOSConfig, scheduleId: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 120);
  return join(
    config.root,
    config.cacheDir ?? ".repoos",
    "locks",
    `schedule-${scheduleId}-${safe}.lock`,
  );
}

/** Exclusive lock — returns true when this process owns the occurrence. */
export function tryAcquireScheduleOccurrenceLock(
  config: RepoOSConfig,
  scheduleId: string,
  occurrenceKeyValue: string,
): boolean {
  const path = lockPath(config, scheduleId, occurrenceKeyValue);
  mkdirSync(join(config.root, config.cacheDir ?? ".repoos", "locks"), { recursive: true });
  try {
    const fd = openSync(path, "wx");
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

export function releaseScheduleOccurrenceLock(
  config: RepoOSConfig,
  scheduleId: string,
  occurrenceKeyValue: string,
): void {
  const path = lockPath(config, scheduleId, occurrenceKeyValue);
  try {
    unlinkSync(path);
  } catch {
    /* best-effort */
  }
}

export function timingForSchedule(row: TaskSchedule): ScheduleTimingInput {
  return scheduleTimingFromRow(row);
}

export function findDueSchedule(row: TaskSchedule, now: Date): { dueAt: Date; key: string } | null {
  if (!row.enabled) return null;
  const timing = timingForSchedule(row);
  return dueOccurrence(timing, now, row.lastOccurrenceKey);
}

/**
 * Create a task from a schedule and record the run. Caller must hold the
 * occurrence lock when invoked from the scheduler loop.
 */
export function executeScheduleRun(
  repoos: RepoOS,
  config: RepoOSConfig,
  scheduleId: string,
  due: { dueAt: Date; key: string },
  options: { manual?: boolean } = {},
): ScheduleRunOutcome {
  const row = getSchedule(config, scheduleId);
  if (!row) return { ok: false, scheduleId, occurrenceKey: due.key, error: "schedule not found" };
  if (!row.enabled && !options.manual) {
    return {
      ok: false,
      scheduleId,
      occurrenceKey: due.key,
      error: "schedule disabled",
      skipped: true,
    };
  }

  // Always persist `due.key` so a manual Run now while a slot is due consumes
  // the same occurrence the minute tick would fire (keys like `manual:…` are
  // only used when nothing is due).
  const key = due.key;

  try {
    const task = repoos.createTask({
      title: row.taskTitle,
      type: row.taskType,
      area: row.taskArea,
      priority: row.taskPriority,
      assignedTo: row.taskAssignedTo,
      status: taskStatusOrDefault(row.taskStatus, config.defaultStatus),
      body: row.body,
      createdBy: "schedule",
    });
    commitTaskFile(
      config.root,
      task.absPath,
      `docs(${task.id}): scheduled task from #${scheduleId}`,
    );
    recordScheduleRun(config, scheduleId, {
      occurrenceKey: key,
      taskId: task.id,
      result: "success",
    });
    return { ok: true, scheduleId, taskId: task.id, occurrenceKey: key };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordScheduleRun(config, scheduleId, {
      occurrenceKey: key,
      result: "failure",
      error: message,
    });
    return { ok: false, scheduleId, occurrenceKey: key, error: message };
  }
}

export function listDueSchedules(config: RepoOSConfig, now = new Date()): TaskSchedule[] {
  return listSchedules(config).filter((row) => findDueSchedule(row, now) !== null);
}

export type ScheduleTickDeps = {
  config: RepoOSConfig;
  repoos: RepoOS;
  autoStart?: ScheduleAutoStartDeps;
  emitEvent: (event: {
    type: "schedule.run";
    scheduleId: string;
    taskId: string | null;
    ok: boolean;
    error?: string;
    at: string;
  }) => void;
};

const scheduleTickState = { inFlight: false };

/** Runs every due schedule once per tick (sequential); overlap guarded globally. */
export function runScheduleTick(deps: ScheduleTickDeps, now = new Date()): void {
  if (scheduleTickState.inFlight) return;
  const dueRows = listDueSchedules(deps.config, now);
  if (!dueRows.length) return;
  scheduleTickState.inFlight = true;

  const runAt = async (index: number): Promise<void> => {
    if (index >= dueRows.length) {
      scheduleTickState.inFlight = false;
      return;
    }
    const row = dueRows[index];
    const due = findDueSchedule(row, now);
    if (!due || !tryAcquireScheduleOccurrenceLock(deps.config, row.id, due.key)) {
      await runAt(index + 1);
      return;
    }
    try {
      const outcome = executeScheduleRun(deps.repoos, deps.config, row.id, due);
      if (outcome.ok && deps.autoStart) {
        await maybeAutoStartScheduledTask(deps.autoStart, row.id, outcome.taskId);
      }
      deps.emitEvent({
        type: "schedule.run",
        scheduleId: outcome.scheduleId,
        taskId: outcome.ok ? outcome.taskId : null,
        ok: outcome.ok,
        error: outcome.ok ? undefined : outcome.error,
        at: new Date().toISOString(),
      });
      if (!outcome.ok && !outcome.skipped) {
        console.error(`[schedules] run of #${row.id} failed: ${outcome.error}`);
      }
    } finally {
      releaseScheduleOccurrenceLock(deps.config, row.id, due.key);
      await runAt(index + 1);
    }
  };

  void runAt(0);
}

/** Test-only reset of the in-flight guard. */
export function resetScheduleTickStateForTests(): void {
  scheduleTickState.inFlight = false;
}
