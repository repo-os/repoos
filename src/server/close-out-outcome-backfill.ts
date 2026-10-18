/**
 * One-time, idempotent backfill for legacy close-out outcome rows that
 * succeeded before #0814 started recording {@link CloseOutOutcomeEvent.durationMs}.
 * Derives wall-clock duration from integration task logs when possible.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEntry } from "../core/logger.js";
import type { CloseOutOutcomeEvent } from "./close-out-outcome.js";

export const CLOSE_OUT_COMPLETE_LOG = "close-out complete — published to main";
const PROCESSING_PHASE_PREFIX = "Processing job phase:";
/** Match `status review→done, release:success` and legacy variants. */
export const DONE_ACTIVITY_RE =
  /^- (\d{4}-\d{2}-\d{2}T[^\s]+) · status [a-z]+→done(?:, release:success)?\s*$/;

/** How far a log line's timestamp may drift from the stored `finishedAt`. */
export const CLOSE_OUT_FINISHED_AT_SKEW_MS = 120_000;

function parseTaskLogFile(root: string, taskId: string): LogEntry[] {
  const path = join(root, ".repoos", "logs", "tasks", `${taskId}.log`);
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
    const entries: LogEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as LogEntry);
      } catch {
        /* skip malformed */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function readIntegrationJobStartedAt(root: string, taskId: string): string | null {
  const path = join(root, ".repoos", "integration-jobs", `${taskId}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { startedAt?: unknown };
    return typeof raw.startedAt === "string" ? raw.startedAt : null;
  } catch {
    return null;
  }
}

/**
 * Derive close-out wall-clock timing from chronological integration log lines
 * for one successful publish, aligned to the outcome's `finishedAt`.
 */
export function deriveCloseOutDurationFromIntegrationLogs(
  logs: LogEntry[],
  finishedAt: string,
  maxSkewMs = CLOSE_OUT_FINISHED_AT_SKEW_MS,
): { startedAt: string; durationMs: number } | null {
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(finishedMs)) return null;

  let completeIdx = -1;
  let bestSkew = Infinity;
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    if (entry.component !== "integration" || entry.message !== CLOSE_OUT_COMPLETE_LOG) continue;
    const ts = Date.parse(entry.timestamp);
    if (!Number.isFinite(ts)) continue;
    const skew = Math.abs(ts - finishedMs);
    if (skew <= maxSkewMs && skew < bestSkew) {
      bestSkew = skew;
      completeIdx = i;
    }
  }
  if (completeIdx < 0) return null;

  const completeAt = logs[completeIdx]!.timestamp;
  const completeMs = Date.parse(completeAt);
  if (!Number.isFinite(completeMs)) return null;

  let windowStart = 0;
  for (let i = completeIdx - 1; i >= 0; i--) {
    const entry = logs[i];
    if (entry.component === "integration" && entry.message === CLOSE_OUT_COMPLETE_LOG) {
      windowStart = i + 1;
      break;
    }
  }

  let startedAt: string | null = null;
  for (let i = windowStart; i <= completeIdx; i++) {
    const entry = logs[i];
    if (entry.component !== "integration") continue;
    if (!entry.message.startsWith(PROCESSING_PHASE_PREFIX)) continue;
    startedAt = entry.timestamp;
    break;
  }
  if (!startedAt) return null;

  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs) || completeMs < startedMs) return null;
  return { startedAt, durationMs: completeMs - startedMs };
}

/** True when this outcome row can receive a derived duration sample. */
export function needsCloseOutDurationBackfill(event: CloseOutOutcomeEvent): boolean {
  return (
    event.outcome === "succeeded" &&
    (event.durationMs === undefined ||
      event.durationMs === null ||
      !Number.isFinite(event.durationMs) ||
      event.durationMs < 0)
  );
}

/**
 * Fill missing `durationMs` / `startedAt` on succeeded outcomes from task logs
 * (and, when still present, the integration job record). Returns a new array
 * when anything changed; otherwise the original reference.
 */
export function backfillCloseOutOutcomeDurations(
  root: string,
  events: CloseOutOutcomeEvent[],
): CloseOutOutcomeEvent[] {
  let changed = false;
  const next = events.map((event) => {
    if (!needsCloseOutDurationBackfill(event)) return event;

    const logs = parseTaskLogFile(root, event.taskId);
    let derived = deriveCloseOutDurationFromIntegrationLogs(logs, event.finishedAt);

    if (!derived) {
      const jobStartedAt = readIntegrationJobStartedAt(root, event.taskId);
      const finishedMs = Date.parse(event.finishedAt);
      const startedMs = jobStartedAt ? Date.parse(jobStartedAt) : Number.NaN;
      if (Number.isFinite(finishedMs) && Number.isFinite(startedMs) && finishedMs >= startedMs) {
        derived = { startedAt: jobStartedAt!, durationMs: finishedMs - startedMs };
      }
    }

    if (!derived) return event;
    changed = true;
    return { ...event, startedAt: derived.startedAt, durationMs: derived.durationMs };
  });
  return changed ? next : events;
}
