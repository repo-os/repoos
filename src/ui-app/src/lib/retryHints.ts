/**
 * Automatic auto-repair retry hints (#0271, extracted for #0385).
 *
 * When a Move-to-done job fails at `repoos check`, at merge-conflict
 * validation, or because a turn ended without a clean handoff signal,
 * `handoff.ts` silently resumes the engineer and increments a retry counter on
 * the task — no human action needed while the retry is in flight. The board
 * card (`TaskCard.vue`) and the task drawer's error card (`DoneErrorCard.vue`,
 * via `TaskDrawer.vue`) both render the same "being fixed automatically"
 * framing from those counters, so the mapping lives here once instead of in
 * two components that would drift.
 */

import type { Task } from "../types";

/** The label + tooltip (and board-card class) describing an in-flight retry. */
export interface RetryHint {
  label: string;
  title: string;
  /** Board-card class; the drawer's error card only uses label/title. */
  cls: string;
}

/** Mirrors handoff.ts's retry caps (not exported from the server module). */
export const MAX_CHECK_RETRY_ATTEMPTS = 2;
export const MAX_MERGE_CONFLICT_RETRY_ATTEMPTS = 2;
export const MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS = 2;

/** Mirrors the task watchdog's default staleness window (task-watchdog.ts) — a
 *  reasonable heuristic even though the server-configured value can differ. */
export const STUCK_SILENCE_MS = 5 * 60 * 1000;

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

/** Milliseconds since `at`, or null when no parseable timestamp is known. */
export function silentMs(now: number, at: string | undefined): number | null {
  if (!at || Number.isNaN(Date.parse(at))) return null;
  return now - Date.parse(at);
}

export function formatActivity(now: number, at: string | undefined): string | null {
  const ms = silentMs(now, at);
  if (ms === null) return null;
  const duration = formatDuration(ms);
  return duration === "just now" ? duration : `${duration} ago`;
}

export type RetryKind = "check" | "mergeConflict" | "handoffSignal";

/** Where each retry counter lives: first-class on BoardTask, inside `extra` on
 *  the full Task a `task.updated` SSE payload carries. Reading both is what
 *  keeps the hint live without a board reload. */
const RETRY_FIELDS: Record<RetryKind, { field: keyof Task; extraKey: string }> = {
  check: { field: "checkRetryCount", extraKey: "check_retry_count" },
  mergeConflict: { field: "mergeConflictRetryCount", extraKey: "merge_conflict_retry_count" },
  handoffSignal: { field: "handoffSignalRetryCount", extraKey: "handoff_signal_retry_count" },
};

/**
 * The retry counter for a task, or null when the task carries neither the
 * first-class field nor `extra` (an unknown value the caller may backfill).
 * A task with `extra` but no counter is a deliberate 0 (cleared on success).
 */
export function retryCountFrom(task: Task, kind: RetryKind): number | null {
  const { field, extraKey } = RETRY_FIELDS[kind];
  const direct = task[field];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return Math.max(0, Math.floor(direct));
  }
  if (task.extra) {
    const raw = task.extra[extraKey];
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
    return 0;
  }
  return null;
}

interface RetryText {
  /** Label while the agent is still producing output. */
  active: (activity: string) => string;
  /** Label when no activity timestamp is known yet. */
  retry: (count: number) => string;
  /** Explanatory tooltip for the normal case. */
  title: string;
  /** Explanatory tooltip when the agent has gone quiet past the threshold. */
  stuckTitle: string;
}

const RETRY_TEXT: Record<RetryKind, RetryText> = {
  check: {
    active: (activity) => `fixing check failure · active ${activity}`,
    retry: (count) => `fixing check failure (retry ${count}/${MAX_CHECK_RETRY_ATTEMPTS})`,
    title:
      "`repoos check` failed right after handoff — the engineer is automatically fixing it and will re-submit for review",
    stuckTitle:
      "agent is fixing a post-handoff check failure but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
  },
  mergeConflict: {
    active: (activity) => `fixing merge conflict · active ${activity}`,
    retry: (count) => `fixing merge conflict (retry ${count}/${MAX_MERGE_CONFLICT_RETRY_ATTEMPTS})`,
    title:
      "close-out hit a real merge conflict with main — the engineer is automatically resolving it in its own branch and close-out will retry once it's done",
    stuckTitle:
      "agent is resolving a merge conflict from close-out but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
  },
  handoffSignal: {
    active: (activity) => `confirming handoff · active ${activity}`,
    retry: (count) => `confirming handoff (retry ${count}/${MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS})`,
    title:
      "the previous turn ended without a detected handoff signal — the engineer was automatically resumed to finish and re-confirm",
    stuckTitle:
      "agent was auto-resumed after a missed handoff signal but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
  },
};

/** Build the hint for one retry kind at `retryCount`, given the agent's last
 *  activity timestamp. The silent/stuck variant is shared by all three. */
export function retryHint(
  kind: RetryKind,
  retryCount: number,
  lastActivity: string | undefined,
  now: number,
): RetryHint {
  const text = RETRY_TEXT[kind];
  const ms = silentMs(now, lastActivity);
  if (ms !== null && ms >= STUCK_SILENCE_MS) {
    return {
      label: `stuck · silent ${formatDuration(ms)}`,
      title: text.stuckTitle,
      cls: "tc-stuck",
    };
  }
  const activity = formatActivity(now, lastActivity);
  return {
    label: activity ? text.active(activity) : text.retry(retryCount),
    title: text.title,
    cls: "tc-coding",
  };
}

/**
 * The auto-repair hint currently in flight for a task, or null when no
 * covered retry is active. `running` must reflect a live agent session — once
 * the retry cap is reached the engineer is no longer resumed, so the caller
 * passes false and the normal dead-end error shows instead (#0385).
 */
export function autoRepairHint(opts: {
  task: Task;
  running: boolean;
  lastActivity: string | undefined;
  now: number;
}): RetryHint | null {
  const { task, running, lastActivity, now } = opts;
  if (!running) return null;
  if (task.status === "review") {
    const merge = retryCountFrom(task, "mergeConflict");
    if (merge) return retryHint("mergeConflict", merge, lastActivity, now);
    const check = retryCountFrom(task, "check");
    if (check) return retryHint("check", check, lastActivity, now);
    return null;
  }
  if (task.status === "active") {
    const signal = retryCountFrom(task, "handoffSignal");
    if (signal) return retryHint("handoffSignal", signal, lastActivity, now);
  }
  return null;
}
