import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { RepoOS } from "../core/repoos.js";
import type { RepoOSConfig } from "../core/types.js";
import {
  dueOccurrence,
  occurrenceKey,
  type ScheduleTimingInput,
} from "../core/schedule-time.js";
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
  return join(config.root, config.cacheDir ?? ".repoos", "locks", `schedule-${scheduleId}-${safe}.lock`);
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

export function findDueSchedule(
  row: TaskSchedule,
  now: Date,
): { dueAt: Date; key: string } | null {
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
    return { ok: false, scheduleId, occurrenceKey: due.key, error: "schedule disabled", skipped: true };
  }

  const timing = timingForSchedule(row);
  const key = options.manual
    ? `${occurrenceKey(timing, due.dueAt)}:manual:${Date.now()}`
    : due.key;

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
    commitTaskFile(config.root, task.absPath, `docs(${task.id}): scheduled task from #${scheduleId}`);
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

/** One due schedule per tick; guarded against overlap and duplicate occurrences. */
export function runScheduleTick(deps: ScheduleTickDeps, now = new Date()): void {
  if (scheduleTickState.inFlight) return;
  const dueRows = listDueSchedules(deps.config, now);
  if (!dueRows.length) return;
  const row = dueRows[0];
  const due = findDueSchedule(row, now);
  if (!due) return;
  if (!tryAcquireScheduleOccurrenceLock(deps.config, row.id, due.key)) return;
  scheduleTickState.inFlight = true;
  void Promise.resolve()
    .then(() => executeScheduleRun(deps.repoos, deps.config, row.id, due))
    .then((outcome) => {
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
    })
    .finally(() => {
      releaseScheduleOccurrenceLock(deps.config, row.id, due.key);
      scheduleTickState.inFlight = false;
    });
}

/** Test-only reset of the in-flight guard. */
export function resetScheduleTickStateForTests(): void {
  scheduleTickState.inFlight = false;
}
