/**
 * `repoos schedule` — list, create, update, enable/disable, run, and delete
 * task schedules under `schedules/` (#0093). File-level writes (same contract as
 * `repoos story`): land on the board root, commit when git tracks the file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boardRoot, loadConfig } from "../core/config.js";
import { commitTaskFile } from "../core/git.js";
import { c } from "../cli/colors.js";
import { createRepoOS } from "../core/repoos.js";
import {
  computeNextRun,
  formatNextRunPreview,
  type ScheduleCadence,
} from "../core/schedule-time.js";
import {
  createSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
  validateScheduleInput,
  type ScheduleCreateInput,
  type SchedulePatch,
  type TaskSchedule,
} from "../core/schedule.js";
import {
  executeScheduleRun,
  findDueSchedule,
  releaseScheduleOccurrenceLock,
  tryAcquireScheduleOccurrenceLock,
} from "../server/schedule-runner.js";
import { scheduleHostileReason, scheduleRunRefusalMessage } from "../server/schedule-automation.js";
import { deleteScheduleDataFile } from "../server/write.js";

export const SCHEDULE_LIST_USAGE = "  Usage: repoos schedule list [--json]";
export const SCHEDULE_RUN_USAGE = "  Usage: repoos schedule run <id>";
export const SCHEDULE_ENABLE_USAGE = "  Usage: repoos schedule enable <id>";
export const SCHEDULE_DISABLE_USAGE = "  Usage: repoos schedule disable <id>";
export const SCHEDULE_DELETE_USAGE = "  Usage: repoos schedule delete <id> --yes";
export const SCHEDULE_PREVIEW_USAGE =
  "  Usage: repoos schedule preview --cadence daily|weekly|once --timezone <iana> --time-of-day HH:MM [--run-at ISO] [--day-of-week N]";
export const SCHEDULE_NEW_USAGE =
  '  Usage: repoos schedule new --title "<name>" --task-title "<task>" --cadence once|daily|weekly --timezone <iana> --time-of-day HH:MM [--body <text|->] [schedule fields…]';
export const SCHEDULE_UPDATE_USAGE =
  "  Usage: repoos schedule update <id> [--title …] [--enabled true|false] [same fields as new]";

function boardConfig() {
  const { root, fromWorktree } = boardRoot();
  if (fromWorktree) {
    console.error(
      c.yellow("  ⚠ ") +
        c.dim("running from inside a linked worktree — writing the MAIN checkout's schedules (") +
        c.cyan(root) +
        c.dim(")"),
    );
  }
  return loadConfig(root);
}

function commitSchedule(root: string, relPath: string, id: string, verb: string): boolean {
  return commitTaskFile(root, join(root, relPath), `schedules(${id}): ${verb}`);
}

function resolveSchedule(config: ReturnType<typeof loadConfig>, ref: string): TaskSchedule | null {
  const id = ref.trim().replace(/^#/, "").padStart(4, "0");
  return getSchedule(config, id);
}

type ScheduleFlags = {
  title?: string;
  enabled?: boolean;
  cadence?: ScheduleCadence;
  timezone?: string;
  timeOfDay?: string;
  runAt?: string;
  dayOfWeek?: number;
  taskTitle?: string;
  taskType?: string;
  taskArea?: string;
  taskPriority?: string;
  taskAssignedTo?: string;
  taskStatus?: string;
  autoStartAgent?: boolean;
  body?: string;
  json?: boolean;
  yes?: boolean;
};

function parseScheduleFlags(
  args: string[],
  opts: { requireYes?: boolean } = {},
): {
  positional: string[];
  flags: ScheduleFlags;
  error?: string;
} {
  const positional: string[] = [];
  const flags: ScheduleFlags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      flags.json = true;
      continue;
    }
    if (a === "--yes") {
      flags.yes = true;
      continue;
    }
    if (a === "--body") {
      const raw = args[++i];
      if (raw === undefined) return { positional, flags, error: "Missing value for --body" };
      flags.body = raw === "-" ? readFileSync(0, "utf8") : raw;
      continue;
    }
    const kv: Record<string, keyof ScheduleFlags> = {
      "--title": "title",
      "--cadence": "cadence",
      "--timezone": "timezone",
      "--time-of-day": "timeOfDay",
      "--run-at": "runAt",
      "--day-of-week": "dayOfWeek",
      "--task-title": "taskTitle",
      "--task-type": "taskType",
      "--task-area": "taskArea",
      "--task-priority": "taskPriority",
      "--task-assigned-to": "taskAssignedTo",
      "--task-status": "taskStatus",
      "--enabled": "enabled",
    };
    if (a in kv) {
      const raw = args[++i];
      if (raw === undefined) return { positional, flags, error: `Missing value for ${a}` };
      const key = kv[a];
      if (key === "enabled") flags.enabled = raw === "true";
      else if (key === "cadence") flags.cadence = raw as ScheduleCadence;
      else if (key === "dayOfWeek") flags.dayOfWeek = Number(raw);
      else if (key === "autoStartAgent") flags.autoStartAgent = raw === "true";
      else (flags as Record<string, unknown>)[key] = raw;
      continue;
    }
    if (a === "--auto-start-agent") {
      const raw = args[++i];
      if (raw === undefined)
        return { positional, flags, error: "Missing value for --auto-start-agent" };
      flags.autoStartAgent = raw === "true";
      continue;
    }
    if (a.startsWith("--")) return { positional, flags, error: `Unknown flag ${a}` };
    positional.push(a);
  }
  if (opts.requireYes && !flags.yes) {
    return { positional, flags, error: "Pass --yes to confirm deletion" };
  }
  return { positional, flags };
}

function flagsToCreateInput(
  flags: ScheduleFlags,
  fallback?: TaskSchedule,
): ScheduleCreateInput | null {
  const title = flags.title ?? fallback?.title;
  const cadence = flags.cadence ?? fallback?.cadence;
  const timezone = flags.timezone ?? fallback?.timezone;
  const timeOfDay = flags.timeOfDay ?? fallback?.timeOfDay;
  if (!title || !cadence || !timezone || !timeOfDay) return null;
  return {
    title,
    enabled: flags.enabled ?? fallback?.enabled ?? true,
    cadence,
    timezone,
    timeOfDay,
    runAt: flags.runAt ?? fallback?.runAt,
    dayOfWeek: flags.dayOfWeek ?? fallback?.dayOfWeek,
    taskTitle: flags.taskTitle ?? fallback?.taskTitle ?? title,
    taskType: flags.taskType ?? fallback?.taskType,
    taskArea: flags.taskArea ?? fallback?.taskArea,
    taskPriority: flags.taskPriority ?? fallback?.taskPriority,
    taskAssignedTo: flags.taskAssignedTo ?? fallback?.taskAssignedTo,
    taskStatus: flags.taskStatus ?? fallback?.taskStatus,
    autoStartAgent: flags.autoStartAgent ?? fallback?.autoStartAgent,
    body: flags.body ?? fallback?.body,
  };
}

export function cmdScheduleList(args: string[]): void {
  const { flags, error } = parseScheduleFlags(args);
  if (error) {
    console.error(c.red(`  ${error}\n${SCHEDULE_LIST_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const rows = listSchedules(boardConfig());
  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log(c.dim("  (no schedules)"));
    return;
  }
  for (const row of rows) {
    const state = row.enabled ? c.green("on ") : c.dim("off");
    console.log(
      `  ${state} #${row.id}  ${row.title}  ${c.dim(row.cadence)}  next: ${row.nextRunPreview}`,
    );
  }
}

export function cmdSchedulePreview(args: string[]): void {
  const { flags, error } = parseScheduleFlags(args);
  if (error) {
    console.error(c.red(`  ${error}\n${SCHEDULE_PREVIEW_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const input = flagsToCreateInput(flags);
  if (!input) {
    console.error(c.red(`  Missing required fields\n${SCHEDULE_PREVIEW_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const err = validateScheduleInput(input);
  if (err) {
    console.error(c.red(`  ${err}`));
    process.exitCode = 1;
    return;
  }
  const timing = {
    cadence: input.cadence,
    timezone: input.timezone,
    timeOfDay: input.timeOfDay,
    runAt: input.runAt,
    dayOfWeek: input.dayOfWeek ?? undefined,
  };
  const next = computeNextRun(timing, new Date(), false);
  const out = {
    nextRunAt: next?.toISOString() ?? null,
    preview: formatNextRunPreview(next, input.timezone),
  };
  if (flags.json) console.log(JSON.stringify(out, null, 2));
  else console.log(`  ${out.preview}`);
}

export function cmdScheduleNew(args: string[]): void {
  const { flags, error } = parseScheduleFlags(args);
  if (error) {
    console.error(c.red(`  ${error}\n${SCHEDULE_NEW_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const input = flagsToCreateInput(flags);
  if (!input) {
    console.error(c.red(`  Missing required fields\n${SCHEDULE_NEW_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const config = boardConfig();
  try {
    const created = createSchedule(config, input);
    const committed = commitSchedule(config.root, created.path, created.id, "create");
    console.log(c.green(`  created schedule #${created.id}  ${created.title}`));
    if (!committed) console.log(c.yellow("  warning: ") + c.dim("file left uncommitted"));
  } catch (err) {
    console.error(c.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
  }
}

export function cmdScheduleUpdate(args: string[]): void {
  const { positional, flags, error } = parseScheduleFlags(args);
  if (error) {
    console.error(c.red(`  ${error}\n${SCHEDULE_UPDATE_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const ref = positional[0];
  if (!ref) {
    console.error(c.red(SCHEDULE_UPDATE_USAGE));
    process.exitCode = 1;
    return;
  }
  const config = boardConfig();
  const existing = resolveSchedule(config, ref);
  if (!existing) {
    console.error(c.red(`  schedule not found: ${ref}`));
    process.exitCode = 1;
    return;
  }
  const patch: SchedulePatch = {};
  if (flags.title !== undefined) patch.title = flags.title;
  if (flags.enabled !== undefined) patch.enabled = flags.enabled;
  if (flags.cadence !== undefined) patch.cadence = flags.cadence;
  if (flags.timezone !== undefined) patch.timezone = flags.timezone;
  if (flags.timeOfDay !== undefined) patch.timeOfDay = flags.timeOfDay;
  if (flags.runAt !== undefined) patch.runAt = flags.runAt;
  if (flags.dayOfWeek !== undefined) patch.dayOfWeek = flags.dayOfWeek;
  if (flags.taskTitle !== undefined) patch.taskTitle = flags.taskTitle;
  if (flags.taskType !== undefined) patch.taskType = flags.taskType;
  if (flags.taskArea !== undefined) patch.taskArea = flags.taskArea;
  if (flags.taskPriority !== undefined) patch.taskPriority = flags.taskPriority;
  if (flags.taskAssignedTo !== undefined) patch.taskAssignedTo = flags.taskAssignedTo;
  if (flags.taskStatus !== undefined) patch.taskStatus = flags.taskStatus;
  if (flags.autoStartAgent !== undefined) patch.autoStartAgent = flags.autoStartAgent;
  if (flags.body !== undefined) patch.body = flags.body;
  try {
    const updated = updateSchedule(config, existing.id, patch);
    const committed = commitSchedule(config.root, updated.path, updated.id, "update");
    console.log(c.green(`  updated schedule #${updated.id}`));
    if (!committed) console.log(c.yellow("  warning: ") + c.dim("file left uncommitted"));
  } catch (err) {
    console.error(c.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
  }
}

export function cmdScheduleEnable(args: string[], enabled: boolean): void {
  const id = args[0]?.trim();
  if (!id) {
    console.error(c.red(enabled ? SCHEDULE_ENABLE_USAGE : SCHEDULE_DISABLE_USAGE));
    process.exitCode = 1;
    return;
  }
  const config = boardConfig();
  const existing = resolveSchedule(config, id);
  if (!existing) {
    console.error(c.red(`  schedule not found: ${id}`));
    process.exitCode = 1;
    return;
  }
  try {
    const updated = updateSchedule(config, existing.id, { enabled });
    commitSchedule(config.root, updated.path, updated.id, enabled ? "enable" : "disable");
    console.log(c.green(`  schedule #${updated.id} ${enabled ? "enabled" : "disabled"}`));
  } catch (err) {
    console.error(c.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
  }
}

export async function cmdScheduleDelete(args: string[]): Promise<void> {
  const { positional, error } = parseScheduleFlags(args, { requireYes: true });
  if (error) {
    console.error(c.red(`  ${error}\n${SCHEDULE_DELETE_USAGE}`));
    process.exitCode = 1;
    return;
  }
  const id = positional[0];
  if (!id) {
    console.error(c.red(SCHEDULE_DELETE_USAGE));
    process.exitCode = 1;
    return;
  }
  const config = boardConfig();
  const existing = resolveSchedule(config, id);
  if (!existing) {
    console.error(c.red(`  schedule not found: ${id}`));
    process.exitCode = 1;
    return;
  }
  try {
    await deleteScheduleDataFile(
      config,
      join(config.root, existing.path),
      `schedules(${existing.id}): delete`,
    );
    console.log(c.green(`  deleted schedule #${existing.id}`));
  } catch (err) {
    console.error(c.red(`  ${(err as Error).message}`));
    process.exitCode = 1;
  }
}

export function cmdScheduleRun(args: string[]): void {
  const id = args[0]?.trim();
  if (!id) {
    console.error(c.red(SCHEDULE_RUN_USAGE));
    process.exitCode = 1;
    return;
  }
  const config = boardConfig();
  const hostile = scheduleHostileReason(config, process.env);
  if (hostile) {
    console.error(c.red(`  ${scheduleRunRefusalMessage(hostile)}`));
    process.exitCode = 1;
    return;
  }
  const existing = resolveSchedule(config, id.replace(/^#/, "").padStart(4, "0"));
  if (!existing) {
    console.error(c.red(`  schedule not found: ${id}`));
    process.exitCode = 1;
    return;
  }
  const repoos = createRepoOS(config.root);
  const now = new Date();
  const due = findDueSchedule(existing, now) ?? {
    dueAt: now,
    key: `manual:${now.toISOString()}`,
  };
  const lockKey = due.key;
  if (!tryAcquireScheduleOccurrenceLock(config, existing.id, lockKey)) {
    console.error(c.red("  This schedule occurrence is already running"));
    process.exitCode = 1;
    return;
  }
  try {
    const outcome = executeScheduleRun(repoos, config, existing.id, due, { manual: true });
    if (!outcome.ok) {
      console.error(c.red(`  ${outcome.error}`));
      process.exitCode = 1;
      return;
    }
    console.log(c.green(`  created task #${outcome.taskId} from schedule #${existing.id}`));
  } finally {
    releaseScheduleOccurrenceLock(config, existing.id, lockKey);
  }
}

export function cmdSchedule(args: string[]): void {
  const [sub, ...rest] = args;
  switch (sub) {
    case "list":
    case "ls":
      cmdScheduleList(rest);
      return;
    case "run":
      cmdScheduleRun(rest);
      return;
    case "enable":
      cmdScheduleEnable(rest, true);
      return;
    case "disable":
      cmdScheduleEnable(rest, false);
      return;
    case "delete":
    case "rm":
      cmdScheduleDelete(rest);
      return;
    case "new":
      cmdScheduleNew(rest);
      return;
    case "update":
      cmdScheduleUpdate(rest);
      return;
    case "preview":
      cmdSchedulePreview(rest);
      return;
    default:
      console.error(
        c.red(`  Unknown schedule subcommand: ${sub ?? "(none)"}`) +
          "\n" +
          c.dim(
            [
              SCHEDULE_LIST_USAGE,
              SCHEDULE_RUN_USAGE,
              SCHEDULE_ENABLE_USAGE,
              SCHEDULE_DISABLE_USAGE,
              SCHEDULE_DELETE_USAGE,
              SCHEDULE_NEW_USAGE,
              SCHEDULE_UPDATE_USAGE,
              SCHEDULE_PREVIEW_USAGE,
            ].join("\n"),
          ),
      );
      process.exitCode = 1;
  }
}
