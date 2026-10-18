/**
 * Timezone-aware schedule math without runtime dependencies.
 * See docs/scheduled-tasks.md for catch-up and occurrence-key policy.
 */

export type ScheduleCadence = "once" | "daily" | "weekly";

export interface ScheduleTimingInput {
  cadence: ScheduleCadence;
  timezone: string;
  /** Local time of day in `timezone`, `HH:MM` (24h). */
  timeOfDay: string;
  /** ISO 8601 instant for one-time schedules. */
  runAt?: string;
  /** 0 = Sunday … 6 = Saturday; required for weekly. */
  dayOfWeek?: number;
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** True when `Intl` accepts the zone (IANA id). */
export function isValidIanaTimezone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function parseTimeOfDay(raw: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function wallClockInZone(instant: Date, timeZone: string): WallClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}

/** UTC instant for a local wall time in `timeZone`. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const w = wallClockInZone(guess, timeZone);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const actual = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
    const diff = target - actual;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateKey(w: WallClock): string {
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

/** Stable id for a single firing — used for dedup and catch-up. */
export function occurrenceKey(timing: ScheduleTimingInput, dueAt: Date): string {
  if (timing.cadence === "once") {
    const w = wallClockInZone(dueAt, timing.timezone);
    return `once:${formatDateKey(w)}T${pad2(w.hour)}:${pad2(w.minute)}`;
  }
  const w = wallClockInZone(dueAt, timing.timezone);
  if (timing.cadence === "daily") return `daily:${formatDateKey(w)}`;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timing.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(dueAt);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `weekly:${y}-${m}-${d}`;
}

function addDaysLocal(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function nextWeeklyLocalDate(
  from: WallClock,
  targetDow: number,
): { year: number; month: number; day: number } {
  let delta = targetDow - from.weekday;
  if (delta < 0) delta += 7;
  return addDaysLocal(from.year, from.month, from.day, delta);
}

/**
 * Next run strictly after `after` (or at `after` when `inclusive`).
 * Returns null when cadence is `once` and the run time is in the past.
 */
export function computeNextRun(
  timing: ScheduleTimingInput,
  after: Date,
  inclusive = false,
): Date | null {
  if (!isValidIanaTimezone(timing.timezone)) return null;
  const tod = parseTimeOfDay(timing.timeOfDay);
  if (!tod) return null;

  if (timing.cadence === "once") {
    if (!timing.runAt) return null;
    const at = Date.parse(timing.runAt);
    if (Number.isNaN(at)) return null;
    const run = new Date(at);
    if (run.getTime() < after.getTime()) return null;
    if (!inclusive && run.getTime() === after.getTime()) return null;
    return run;
  }

  const nowWall = wallClockInZone(after, timing.timezone);
  let y = nowWall.year;
  let m = nowWall.month;
  let d = nowWall.day;

  if (timing.cadence === "weekly") {
    const dow = timing.dayOfWeek;
    if (dow === undefined || dow < 0 || dow > 6) return null;
    const next = nextWeeklyLocalDate(nowWall, dow);
    y = next.year;
    m = next.month;
    d = next.day;
    let candidate = zonedLocalToUtc(y, m, d, tod.hour, tod.minute, timing.timezone);
    if (candidate.getTime() <= after.getTime() && !inclusive) {
      const bumped = addDaysLocal(y, m, d, 7);
      candidate = zonedLocalToUtc(
        bumped.year,
        bumped.month,
        bumped.day,
        tod.hour,
        tod.minute,
        timing.timezone,
      );
    } else if (candidate.getTime() < after.getTime()) {
      const bumped = addDaysLocal(y, m, d, 7);
      candidate = zonedLocalToUtc(
        bumped.year,
        bumped.month,
        bumped.day,
        tod.hour,
        tod.minute,
        timing.timezone,
      );
    }
    return candidate;
  }

  // daily
  let candidate = zonedLocalToUtc(y, m, d, tod.hour, tod.minute, timing.timezone);
  if (candidate.getTime() <= after.getTime() && !inclusive) {
    const bumped = addDaysLocal(y, m, d, 1);
    candidate = zonedLocalToUtc(
      bumped.year,
      bumped.month,
      bumped.day,
      tod.hour,
      tod.minute,
      timing.timezone,
    );
  } else if (candidate.getTime() < after.getTime()) {
    const bumped = addDaysLocal(y, m, d, 1);
    candidate = zonedLocalToUtc(
      bumped.year,
      bumped.month,
      bumped.day,
      tod.hour,
      tod.minute,
      timing.timezone,
    );
  }
  return candidate;
}

/**
 * The occurrence that should fire for catch-up: if `now` is past a scheduled
 * instant and that occurrence was never recorded in `lastOccurrenceKey`, return
 * its due time and key. For recurring schedules only one catch-up fires per
 * restart window (the latest missed slot).
 */
export function dueOccurrence(
  timing: ScheduleTimingInput,
  now: Date,
  lastOccurrenceKey: string,
): { dueAt: Date; key: string } | null {
  if (timing.cadence === "once") {
    const next = computeNextRun(timing, new Date(0), true);
    if (!next) return null;
    if (next.getTime() > now.getTime()) return null;
    const key = occurrenceKey(timing, next);
    if (key === lastOccurrenceKey) return null;
    return { dueAt: next, key };
  }

  const next = computeNextRun(timing, now, false);
  if (!next) return null;

  // Walk backward to find the latest slot at or before `now`.
  let probe = next;
  let latestDue: Date | null = null;
  for (let i = 0; i < 400; i++) {
    if (probe.getTime() > now.getTime()) break;
    latestDue = probe;
    const w = wallClockInZone(probe, timing.timezone);
    const back =
      timing.cadence === "weekly"
        ? addDaysLocal(w.year, w.month, w.day, -7)
        : addDaysLocal(w.year, w.month, w.day, -1);
    const tod = parseTimeOfDay(timing.timeOfDay)!;
    probe = zonedLocalToUtc(back.year, back.month, back.day, tod.hour, tod.minute, timing.timezone);
  }
  if (!latestDue) return null;
  const key = occurrenceKey(timing, latestDue);
  if (key === lastOccurrenceKey) return null;
  if (latestDue.getTime() > now.getTime()) return null;
  return { dueAt: latestDue, key };
}

export function isScheduleDueNow(
  timing: ScheduleTimingInput,
  now: Date,
  lastOccurrenceKey: string,
): boolean {
  return dueOccurrence(timing, now, lastOccurrenceKey) !== null;
}

/** Human-readable preview of the next run in the schedule's timezone. */
export function formatNextRunPreview(next: Date | null, timeZone: string): string {
  if (!next) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(next);
  } catch {
    return next.toISOString();
  }
}
