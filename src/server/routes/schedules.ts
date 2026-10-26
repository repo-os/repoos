import { join } from "node:path";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  createSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
  validateScheduleInput,
  type ScheduleCreateInput,
  type SchedulePatch,
} from "../../core/schedule.js";
import { commitTaskFile } from "../../core/git.js";
import { deleteScheduleDataFile, PathGuardError, WriteError } from "../write.js";
import { computeNextRun, formatNextRunPreview } from "../../core/schedule-time.js";
import { scheduleTimingFromRow } from "../../core/schedule.js";
import {
  executeScheduleRun,
  findDueSchedule,
  tryAcquireScheduleOccurrenceLock,
  releaseScheduleOccurrenceLock,
} from "../schedule-runner.js";
import { maybeAutoStartScheduledTask } from "../schedule-auto-start.js";
import { scheduleHostileReason, scheduleRunRefusalMessage } from "../schedule-automation.js";

function commitSchedule(root: string, relPath: string, verb: string, id: string): void {
  commitTaskFile(root, join(root, relPath), `schedules(${id}): ${verb}`);
}

export const getSchedules: RouteHandler = (ctx, _req, res) =>
  json(res, 200, listSchedules(ctx.config));

export const postSchedule: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as Record<string, unknown>;
  const input = bodyFromRequest(body);
  const err = validateScheduleInput(input);
  if (err) return json(res, 400, { error: err });
  try {
    const created = createSchedule(ctx.config, input);
    commitSchedule(ctx.config.root, created.path, "create", created.id);
    ctx.emitEvent({ type: "schedule.changed", at: new Date().toISOString() });
    ctx.index.refreshAll();
    return json(res, 201, created);
  } catch (e) {
    return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
};

export const patchSchedule: RouteHandler = async (ctx, req, res, p) => {
  const id = p.param1;
  if (!id) return json(res, 400, { error: "id required" });
  const body = (await readBody(req)) as Record<string, unknown>;
  const patch = patchFromRequest(body);
  try {
    const updated = updateSchedule(ctx.config, id, patch);
    commitSchedule(ctx.config.root, updated.path, "update", id);
    ctx.emitEvent({ type: "schedule.changed", at: new Date().toISOString() });
    ctx.index.refreshAll();
    return json(res, 200, updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "schedule not found") return json(res, 404, { error: msg });
    return json(res, 400, { error: msg });
  }
};

export const deleteSchedule: RouteHandler = async (ctx, _req, res, p) => {
  const id = p.param1;
  if (!id) return json(res, 400, { error: "id required" });
  const existing = getSchedule(ctx.config, id);
  if (!existing) return json(res, 404, { error: "schedule not found" });
  try {
    await deleteScheduleDataFile(
      ctx.config,
      join(ctx.config.root, existing.path),
      `schedules(${id}): delete`,
    );
  } catch (err) {
    if (err instanceof PathGuardError) return json(res, 400, { error: err.message });
    if (err instanceof WriteError) return json(res, 404, { error: err.message });
    throw err;
  }
  ctx.emitEvent({ type: "schedule.changed", at: new Date().toISOString() });
  ctx.index.refreshAll();
  return json(res, 200, { ok: true });
};

export const postScheduleRun: RouteHandler = async (ctx, req, res, p) => {
  const id = p.param1;
  if (!id) return json(res, 400, { error: "id required" });
  const hostile = scheduleHostileReason(ctx.config, process.env, ctx.servePort);
  if (hostile) {
    return json(res, 403, { error: scheduleRunRefusalMessage(hostile) });
  }
  const row = getSchedule(ctx.config, id);
  if (!row) return json(res, 404, { error: "schedule not found" });
  const now = new Date();
  const due = findDueSchedule(row, now) ?? {
    dueAt: now,
    key: `manual:${now.toISOString()}`,
  };
  const body = (await readBody(req)) as Record<string, unknown>;
  const manual = body?.manual !== false;
  const lockKey = due.key;
  if (!tryAcquireScheduleOccurrenceLock(ctx.config, id, lockKey)) {
    return json(res, 409, { error: "This schedule occurrence is already running" });
  }
  try {
    const outcome = executeScheduleRun(ctx.repoos, ctx.config, id, due, { manual });
    if (!outcome.ok) {
      return json(res, outcome.skipped ? 400 : 500, { error: outcome.error, outcome });
    }
    if (outcome.ok) {
      await maybeAutoStartScheduledTask(
        {
          config: ctx.config,
          index: ctx.index,
          runner: ctx.runner,
          logger: ctx.logger,
          onServerStatusChange: ctx.onServerStatusChange,
        },
        id,
        outcome.taskId,
      );
    }
    ctx.index.refreshAll();
    ctx.emitEvent({
      type: "schedule.run",
      scheduleId: outcome.scheduleId,
      taskId: outcome.taskId,
      ok: true,
      at: new Date().toISOString(),
    });
    ctx.emitEvent({ type: "schedule.changed", at: new Date().toISOString() });
    return json(res, 200, outcome);
  } finally {
    releaseScheduleOccurrenceLock(ctx.config, id, lockKey);
  }
};

export const postSchedulePreview: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as Record<string, unknown>;
  const input = bodyFromRequest(body);
  const err = validateScheduleInput(input);
  if (err) return json(res, 400, { error: err });
  const timing = {
    cadence: input.cadence,
    timezone: input.timezone,
    timeOfDay: input.timeOfDay,
    runAt: input.runAt,
    dayOfWeek: input.dayOfWeek ?? undefined,
  };
  const next = computeNextRun(timing, new Date(), false);
  return json(res, 200, {
    nextRunAt: next?.toISOString() ?? null,
    preview: formatNextRunPreview(next, input.timezone),
  });
};

function bodyFromRequest(body: Record<string, unknown>): ScheduleCreateInput {
  return {
    title: String(body.title ?? ""),
    enabled: body.enabled !== false,
    cadence: body.cadence as ScheduleCreateInput["cadence"],
    timezone: String(body.timezone ?? "UTC"),
    timeOfDay: String(body.timeOfDay ?? body.time_of_day ?? "09:00"),
    runAt:
      typeof body.runAt === "string"
        ? body.runAt
        : typeof body.run_at === "string"
          ? body.run_at
          : undefined,
    dayOfWeek:
      typeof body.dayOfWeek === "number"
        ? body.dayOfWeek
        : typeof body.day_of_week === "number"
          ? body.day_of_week
          : null,
    taskTitle: String(body.taskTitle ?? body.task_title ?? body.title ?? ""),
    taskType:
      typeof body.taskType === "string"
        ? body.taskType
        : typeof body.task_type === "string"
          ? body.task_type
          : undefined,
    taskArea:
      typeof body.taskArea === "string"
        ? body.taskArea
        : typeof body.task_area === "string"
          ? body.task_area
          : undefined,
    taskPriority:
      typeof body.taskPriority === "string"
        ? body.taskPriority
        : typeof body.task_priority === "string"
          ? body.task_priority
          : undefined,
    taskAssignedTo:
      typeof body.taskAssignedTo === "string"
        ? body.taskAssignedTo
        : typeof body.task_assigned_to === "string"
          ? body.task_assigned_to
          : undefined,
    taskStatus:
      typeof body.taskStatus === "string"
        ? body.taskStatus
        : typeof body.task_status === "string"
          ? body.task_status
          : undefined,
    autoStartAgent: body.autoStartAgent === true || body.auto_start_agent === true,
    body:
      typeof body.body === "string"
        ? body.body
        : typeof body.spec === "string"
          ? body.spec
          : undefined,
  };
}

function patchFromRequest(body: Record<string, unknown>): SchedulePatch {
  const full = bodyFromRequest(body);
  const patch: SchedulePatch = {};
  if (body.title !== undefined) patch.title = full.title;
  if (body.enabled !== undefined) patch.enabled = full.enabled ?? true;
  if (body.cadence !== undefined) patch.cadence = full.cadence;
  if (body.timezone !== undefined) patch.timezone = full.timezone;
  if (body.timeOfDay !== undefined || body.time_of_day !== undefined)
    patch.timeOfDay = full.timeOfDay;
  if (body.runAt !== undefined || body.run_at !== undefined) patch.runAt = full.runAt;
  if (body.dayOfWeek !== undefined || body.day_of_week !== undefined)
    patch.dayOfWeek = full.dayOfWeek;
  if (body.taskTitle !== undefined || body.task_title !== undefined)
    patch.taskTitle = full.taskTitle;
  if (body.taskType !== undefined || body.task_type !== undefined) patch.taskType = full.taskType;
  if (body.taskArea !== undefined || body.task_area !== undefined) patch.taskArea = full.taskArea;
  if (body.taskPriority !== undefined || body.task_priority !== undefined)
    patch.taskPriority = full.taskPriority;
  if (body.taskAssignedTo !== undefined || body.task_assigned_to !== undefined)
    patch.taskAssignedTo = full.taskAssignedTo;
  if (body.taskStatus !== undefined || body.task_status !== undefined)
    patch.taskStatus = full.taskStatus;
  if (body.autoStartAgent !== undefined || body.auto_start_agent !== undefined)
    patch.autoStartAgent = full.autoStartAgent;
  if (body.body !== undefined || body.spec !== undefined) patch.body = full.body;
  return patch;
}
