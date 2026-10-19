import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Status } from "./types.js";
import { parseDocument, serializeDocument } from "./frontmatter.js";
import {
  computeNextRun,
  formatNextRunPreview,
  isValidIanaTimezone,
  parseTimeOfDay,
  type ScheduleCadence,
} from "./schedule-time.js";

export type ScheduleLastResult = "success" | "failure" | "missed" | "";

export interface TaskSchedule {
  id: string;
  title: string;
  enabled: boolean;
  cadence: ScheduleCadence;
  timezone: string;
  timeOfDay: string;
  runAt: string;
  dayOfWeek: number | null;
  taskTitle: string;
  taskType: string;
  taskArea: string;
  taskPriority: string;
  taskAssignedTo: string;
  taskStatus: string;
  autoStartAgent: boolean;
  lastRunAt: string;
  lastResult: ScheduleLastResult;
  lastTaskId: string;
  lastError: string;
  lastOccurrenceKey: string;
  createdAt: string;
  updatedAt: string;
  path: string;
  body: string;
  /** Derived — not stored in frontmatter. */
  nextRunAt: string | null;
  nextRunPreview: string;
}

export type ScheduleCreateInput = {
  title: string;
  enabled?: boolean;
  cadence: ScheduleCadence;
  timezone: string;
  timeOfDay: string;
  runAt?: string;
  dayOfWeek?: number | null;
  taskTitle: string;
  taskType?: string;
  taskArea?: string;
  taskPriority?: string;
  taskAssignedTo?: string;
  taskStatus?: string;
  autoStartAgent?: boolean;
  body?: string;
};

export type SchedulePatch = Partial<
  Omit<ScheduleCreateInput, "cadence"> & { cadence: ScheduleCadence; enabled: boolean }
>;

const SCHEDULE_KEY_ORDER = [
  "id",
  "title",
  "enabled",
  "cadence",
  "timezone",
  "time_of_day",
  "run_at",
  "day_of_week",
  "task_title",
  "task_type",
  "task_area",
  "task_priority",
  "task_assigned_to",
  "task_status",
  "auto_start_agent",
  "last_run_at",
  "last_result",
  "last_task_id",
  "last_error",
  "last_occurrence_key",
  "created_at",
  "updated_at",
];

const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55) || "schedule";

const scheduleRoot = (c: RepoOSConfig) => c.schedulesDir ?? "schedules";
const dir = (c: RepoOSConfig) => join(c.root, scheduleRoot(c));

function nextScheduleId(c: RepoOSConfig): string {
  let max = 0;
  for (const s of listSchedules(c)) {
    const n = parseInt(s.id, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, "0");
}

function boolField(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return fallback;
}

function cadenceField(v: unknown): ScheduleCadence | null {
  if (v === "once" || v === "daily" || v === "weekly") return v;
  return null;
}

function enrichSchedule(
  c: RepoOSConfig,
  raw: Record<string, unknown>,
  path: string,
  body: string,
): TaskSchedule | null {
  if (typeof raw.id !== "string") return null;
  const cadence = cadenceField(raw.cadence);
  if (!cadence) return null;
  const timezone = typeof raw.timezone === "string" ? raw.timezone : "UTC";
  const timeOfDay = typeof raw.time_of_day === "string" ? raw.time_of_day : "09:00";
  const timing = {
    cadence,
    timezone,
    timeOfDay,
    runAt: typeof raw.run_at === "string" ? raw.run_at : undefined,
    dayOfWeek:
      typeof raw.day_of_week === "number"
        ? raw.day_of_week
        : typeof raw.day_of_week === "string" && /^\d+$/.test(raw.day_of_week)
          ? Number(raw.day_of_week)
          : undefined,
  };
  const next = computeNextRun(timing, new Date(), false);
  const schedule: TaskSchedule = {
    id: raw.id,
    title: String(raw.title ?? "Untitled schedule"),
    enabled: boolField(raw.enabled, true),
    cadence,
    timezone,
    timeOfDay,
    runAt: typeof raw.run_at === "string" ? raw.run_at : "",
    dayOfWeek:
      typeof raw.day_of_week === "number"
        ? raw.day_of_week
        : typeof raw.day_of_week === "string" && /^\d+$/.test(raw.day_of_week)
          ? Number(raw.day_of_week)
          : null,
    taskTitle: String(raw.task_title ?? raw.title ?? "Scheduled task"),
    taskType: String(raw.task_type ?? "chore"),
    taskArea: String(raw.task_area ?? "general"),
    taskPriority: String(raw.task_priority ?? "p2"),
    taskAssignedTo: String(raw.task_assigned_to ?? ""),
    taskStatus: String(raw.task_status ?? "ready"),
    autoStartAgent: boolField(raw.auto_start_agent, false),
    lastRunAt: typeof raw.last_run_at === "string" ? raw.last_run_at : "",
    lastResult: (raw.last_result === "success" ||
    raw.last_result === "failure" ||
    raw.last_result === "missed"
      ? raw.last_result
      : "") as ScheduleLastResult,
    lastTaskId: typeof raw.last_task_id === "string" ? raw.last_task_id : "",
    lastError: typeof raw.last_error === "string" ? raw.last_error : "",
    lastOccurrenceKey: typeof raw.last_occurrence_key === "string" ? raw.last_occurrence_key : "",
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    path,
    body: body.trim(),
    nextRunAt: next ? next.toISOString() : null,
    nextRunPreview: formatNextRunPreview(next, timezone),
  };
  return schedule;
}

export function listSchedules(c: RepoOSConfig): TaskSchedule[] {
  if (!existsSync(dir(c))) return [];
  return readdirSync(dir(c))
    .filter((n) => n.endsWith(".md"))
    .flatMap((name) => {
      const path = join(scheduleRoot(c), name);
      const parsed = parseDocument(readFileSync(join(dir(c), name), "utf8"));
      const row = enrichSchedule(c, parsed.data, path, parsed.body);
      return row ? [row] : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getSchedule(c: RepoOSConfig, id: string): TaskSchedule | null {
  return listSchedules(c).find((s) => s.id === id) ?? null;
}

export function validateScheduleInput(input: ScheduleCreateInput): string | null {
  if (!input.title.trim()) return "title is required";
  if (!input.taskTitle.trim()) return "task title is required";
  if (!cadenceField(input.cadence)) return "invalid cadence";
  if (!isValidIanaTimezone(input.timezone)) return "invalid timezone";
  if (!parseTimeOfDay(input.timeOfDay)) return "time_of_day must be HH:MM";
  if (
    input.cadence === "weekly" &&
    (input.dayOfWeek == null || input.dayOfWeek < 0 || input.dayOfWeek > 6)
  ) {
    return "day_of_week is required for weekly schedules (0=Sunday … 6=Saturday)";
  }
  if (input.cadence === "once" && !input.runAt) return "run_at is required for one-time schedules";
  if (input.cadence === "once" && input.runAt && Number.isNaN(Date.parse(input.runAt))) {
    return "run_at must be a valid ISO timestamp";
  }
  return null;
}

function toFrontmatter(
  input: ScheduleCreateInput & { id: string; createdAt: string; updatedAt: string },
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: input.id,
    title: input.title.trim(),
    enabled: input.enabled ?? true,
    cadence: input.cadence,
    timezone: input.timezone.trim(),
    time_of_day: input.timeOfDay.trim(),
    run_at: input.runAt ?? "",
    day_of_week: input.dayOfWeek ?? "",
    task_title: input.taskTitle.trim(),
    task_type: input.taskType ?? "chore",
    task_area: input.taskArea ?? "general",
    task_priority: input.taskPriority ?? "p2",
    task_assigned_to: input.taskAssignedTo ?? "",
    task_status: input.taskStatus ?? "ready",
    auto_start_agent: input.autoStartAgent ?? false,
    last_run_at: "",
    last_result: "",
    last_task_id: "",
    last_error: "",
    last_occurrence_key: "",
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    ...extra,
  };
}

export function createSchedule(c: RepoOSConfig, input: ScheduleCreateInput): TaskSchedule {
  const err = validateScheduleInput(input);
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  const id = nextScheduleId(c);
  const name = `${id}-${slug(input.title)}.md`;
  mkdirSync(dir(c), { recursive: true });
  const data = toFrontmatter({ ...input, id, createdAt: now, updatedAt: now });
  const body = (input.body ?? "").trim();
  writeFileSync(
    join(dir(c), name),
    serializeDocument(data, body ? `${body}\n` : "", SCHEDULE_KEY_ORDER),
  );
  return getSchedule(c, id)!;
}

export function updateSchedule(c: RepoOSConfig, id: string, patch: SchedulePatch): TaskSchedule {
  const existing = getSchedule(c, id);
  if (!existing) throw new Error("schedule not found");
  const merged: ScheduleCreateInput = {
    title: patch.title ?? existing.title,
    enabled: patch.enabled ?? existing.enabled,
    cadence: patch.cadence ?? existing.cadence,
    timezone: patch.timezone ?? existing.timezone,
    timeOfDay: patch.timeOfDay ?? existing.timeOfDay,
    runAt: patch.runAt ?? existing.runAt,
    dayOfWeek: patch.dayOfWeek !== undefined ? patch.dayOfWeek : existing.dayOfWeek,
    taskTitle: patch.taskTitle ?? existing.taskTitle,
    taskType: patch.taskType ?? existing.taskType,
    taskArea: patch.taskArea ?? existing.taskArea,
    taskPriority: patch.taskPriority ?? existing.taskPriority,
    taskAssignedTo: patch.taskAssignedTo ?? existing.taskAssignedTo,
    taskStatus: patch.taskStatus ?? existing.taskStatus,
    autoStartAgent: patch.autoStartAgent ?? existing.autoStartAgent,
    body: patch.body !== undefined ? patch.body : existing.body,
  };
  const err = validateScheduleInput(merged);
  if (err) throw new Error(err);
  const file = join(c.root, existing.path);
  const parsed = parseDocument(readFileSync(file, "utf8"));
  const updatedAt = new Date().toISOString();
  const data: Record<string, unknown> = {
    ...parsed.data,
    title: merged.title.trim(),
    enabled: merged.enabled ?? true,
    cadence: merged.cadence,
    timezone: merged.timezone.trim(),
    time_of_day: merged.timeOfDay.trim(),
    run_at: merged.runAt ?? "",
    day_of_week: merged.dayOfWeek ?? "",
    task_title: merged.taskTitle.trim(),
    task_type: merged.taskType ?? "chore",
    task_area: merged.taskArea ?? "general",
    task_priority: merged.taskPriority ?? "p2",
    task_assigned_to: merged.taskAssignedTo ?? "",
    task_status: merged.taskStatus ?? "ready",
    auto_start_agent: merged.autoStartAgent ?? false,
    updated_at: updatedAt,
  };
  const body = (merged.body ?? "").trim();
  writeFileSync(file, serializeDocument(data, body ? `${body}\n` : "", SCHEDULE_KEY_ORDER));
  return getSchedule(c, id)!;
}

export function recordScheduleRun(
  c: RepoOSConfig,
  id: string,
  outcome: {
    occurrenceKey: string;
    taskId?: string;
    result: ScheduleLastResult;
    error?: string;
  },
): TaskSchedule {
  const existing = getSchedule(c, id);
  if (!existing) throw new Error("schedule not found");
  const file = join(c.root, existing.path);
  const parsed = parseDocument(readFileSync(file, "utf8"));
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    ...parsed.data,
    last_run_at: now,
    last_result: outcome.result,
    last_task_id: outcome.taskId ?? "",
    last_error: outcome.error ?? "",
    last_occurrence_key: outcome.occurrenceKey,
    updated_at: now,
  };
  writeFileSync(file, serializeDocument(data, parsed.body, SCHEDULE_KEY_ORDER));
  return getSchedule(c, id)!;
}

export function deleteScheduleFile(c: RepoOSConfig, id: string): void {
  const existing = getSchedule(c, id);
  if (!existing) throw new Error("schedule not found");
  unlinkSync(join(c.root, existing.path));
}

export function scheduleTimingFromRow(row: TaskSchedule) {
  return {
    cadence: row.cadence,
    timezone: row.timezone,
    timeOfDay: row.timeOfDay,
    runAt: row.runAt || undefined,
    dayOfWeek: row.dayOfWeek ?? undefined,
  };
}

export function taskStatusOrDefault(status: string, fallback: Status): Status {
  const allowed: Status[] = ["inbox", "ready", "active", "review", "done", "draft"];
  return allowed.includes(status as Status) ? (status as Status) : fallback;
}
