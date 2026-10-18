import type { CloseOutOutcomeEvent, IntegrationPipelineSnapshot } from "../types";
import { formatDuration } from "./time";

/** Default stall window when the active close-out reports no stage progress (#0740). */
export const DEFAULT_INTEGRATION_STALL_MS = 3 * 60 * 1000;

/** How many recent completed runs feed the status bar's median (#0814). */
export const INTEGRATION_MEDIAN_SAMPLE = 15;

export interface IntegrationDurationHistory {
  /** Median wall-clock duration of the sampled close-outs, in ms. */
  medianMs: number;
  /** Number of runs used (at most {@link INTEGRATION_MEDIAN_SAMPLE}). */
  count: number;
}

/**
 * The most recent SUCCEEDED close-outs that recorded a duration, newest first.
 * A failed or timed-out run is not a run a reviewer should measure a normal
 * close-out against, so it is excluded (#0819). Runs without timing (legacy
 * outcome rows) are skipped rather than counted as zero. `limit` defaults to
 * the status bar's 15-run window (#0814).
 */
export function integrationDurationSamples(
  outcomes: CloseOutOutcomeEvent[] | null | undefined,
  limit = INTEGRATION_MEDIAN_SAMPLE,
): number[] {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];
  return (outcomes ?? [])
    .filter(
      (o): o is CloseOutOutcomeEvent & { durationMs: number } =>
        o.outcome === "succeeded" &&
        typeof o.durationMs === "number" &&
        Number.isFinite(o.durationMs) &&
        o.durationMs >= 0,
    )
    .slice()
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, max)
    .map((o) => o.durationMs);
}

/** Median of the last few SUCCEEDED timed close-outs, or null when none recorded one. */
export function integrationMedianDuration(
  outcomes: CloseOutOutcomeEvent[] | null | undefined,
  limit = INTEGRATION_MEDIAN_SAMPLE,
): IntegrationDurationHistory | null {
  const samples = integrationDurationSamples(outcomes, limit);
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  return { medianMs, count: samples.length };
}

/** The line-2 instruction shown under the median in the timer tooltip (#0819). */
export const INTEGRATION_TIMER_INSTRUCTION = "Click to switch between elapsed time and a countdown";

/** Copy shown when no succeeded, timed close-out has been recorded yet. */
export const INTEGRATION_NO_MEDIAN_COPY =
  "No completed integrations with timing yet — the median appears after a close-out finishes.";

/**
 * The tooltip's first line as a chip label (#0819): `Median 2m 25s · 15 runs`.
 * The run count is kept because the median of 3 runs is a much weaker claim
 * than the median of 15, and the chip is the only place that distinction shows.
 */
export function integrationMedianChip(
  outcomes: CloseOutOutcomeEvent[] | null | undefined,
  limit = INTEGRATION_MEDIAN_SAMPLE,
): string {
  const history = integrationMedianDuration(outcomes, limit);
  if (!history) return "No median yet";
  const runs = history.count === 1 ? "run" : "runs";
  return `Median ${formatDuration(history.medianMs)} · ${history.count} ${runs}`;
}

/**
 * The two-line tooltip text: the median chip, then the instruction (or, with no
 * history, why the median is missing). Kept as a plain string for the button's
 * `aria-label`; the rich two-line pane renders {@link integrationMedianChip}
 * and this second line separately.
 */
export function integrationMedianTip(
  outcomes: CloseOutOutcomeEvent[] | null | undefined,
  limit = INTEGRATION_MEDIAN_SAMPLE,
): string {
  const history = integrationMedianDuration(outcomes, limit);
  const instruction = history ? INTEGRATION_TIMER_INSTRUCTION : INTEGRATION_NO_MEDIAN_COPY;
  return `${integrationMedianChip(outcomes, limit)}\n${instruction}`;
}

/** `T-01:34` (remaining) or `T+00:12` (over the median) for the countdown mode. */
export function integrationCountdownLabel(elapsedMs: number, medianMs: number): string {
  const diffSec = Math.round((medianMs - elapsedMs) / 1000);
  const abs = Math.abs(diffSec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return diffSec >= 0 ? `T-${body}` : `T+${body}`;
}

export type IntegrationPipelineRole = "active" | "queued" | null;

export function integrationPipelineRole(
  snap: IntegrationPipelineSnapshot | null | undefined,
  taskId: string,
): IntegrationPipelineRole {
  if (!snap || snap.empty) return null;
  if (snap.active?.taskId === taskId && !snap.active.failed) return "active";
  if (snap.queue.includes(taskId)) return "queued";
  return null;
}

export function integrationQueuePosition(
  snap: IntegrationPipelineSnapshot,
  taskId: string,
): { position: number; behindTaskId: string | null } | null {
  const idx = snap.queue.indexOf(taskId);
  if (idx < 0) return null;
  return {
    position: idx + 1,
    behindTaskId: snap.active?.taskId ?? null,
  };
}

export function integrationStageLabel(stage: string | null | undefined): string {
  if (stage === "resolve-conflict") return "resolving conflict";
  return stage?.trim() ? stage : "starting…";
}

export function integrationElapsedMs(
  startedAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!startedAt) return null;
  const ms = nowMs - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Ms since the active job last reported pipeline progress, or null when not applicable. */
export function integrationIdleMs(
  active: IntegrationPipelineSnapshot["active"],
  nowMs: number,
): number | null {
  if (!active || active.failed) return null;
  const anchor = active.lastProgressAt ?? active.startedAt;
  if (!anchor) return null;
  const ms = nowMs - new Date(anchor).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function integrationPipelineStalled(
  snap: IntegrationPipelineSnapshot | null | undefined,
  nowMs: number,
  stallMs = DEFAULT_INTEGRATION_STALL_MS,
): boolean {
  const active = snap?.active;
  if (!active || active.failed) return false;
  const idle = integrationIdleMs(active, nowMs);
  return idle !== null && idle >= stallMs;
}

export interface IntegrationActiveCopy {
  label: string;
  title: string;
  stalled: boolean;
}

/** Active-job copy for the board card and pipeline bar (#0740). */
export function integrationActiveCopy(
  snap: IntegrationPipelineSnapshot,
  nowMs: number,
  stallMs = DEFAULT_INTEGRATION_STALL_MS,
): IntegrationActiveCopy {
  const active = snap.active!;
  const idle = integrationIdleMs(active, nowMs);
  const stalled = idle !== null && idle >= stallMs;
  if (stalled) {
    const dur = formatDuration(idle!);
    return {
      label: `stalled · no progress ${dur}`,
      title:
        "Close-out has not reported stage progress in a while — it may be hung. Cancel to return the task to review, or retry to stop and enqueue a fresh attempt.",
      stalled: true,
    };
  }
  const stage = integrationStageLabel(active.stage);
  const elapsed = integrationElapsedMs(active.startedAt, nowMs);
  const elapsedBit = elapsed !== null ? ` · ${formatDuration(elapsed)}` : "";
  const detail = active.detail?.trim();
  if (detail) {
    return {
      // A live in-stage detail line — the #0782 bundle upload or a #0799
      // heartbeat naming the current long stage (e.g. "remote tests").
      label: `integrating · ${detail}${elapsedBit}`,
      title:
        "Close-out is working — the detail line shows the current step. Progress refreshes every few seconds; the job is only flagged stalled when nothing arrives for a while.",
      stalled: false,
    };
  }
  return {
    label: `integrating · ${stage}${elapsedBit}`,
    title:
      active.stage === "resolve-conflict"
        ? "Resolving an integration conflict against current main in an isolated candidate — the original review is preserved and only the resolution delta is reviewed."
        : "Move to done is running — merging, building, and checking. See the pipeline bar for live progress.",
    stalled: false,
  };
}

export interface IntegrationQueuedCopy {
  label: string;
  title: string;
}

export function integrationQueuedCopy(
  snap: IntegrationPipelineSnapshot,
  taskId: string,
): IntegrationQueuedCopy | null {
  const pos = integrationQueuePosition(snap, taskId);
  if (!pos) return null;
  const behind = pos.behindTaskId;
  const label = behind ? `queued #${pos.position} (behind #${behind})` : `queued #${pos.position}`;
  return {
    label,
    title: behind
      ? `Waiting in the close-out queue behind #${behind} — it will start automatically when that job finishes.`
      : "Waiting in the close-out queue — it will start when the pipeline is free.",
  };
}

/** Compact title line for the integration status bar while a job is active. */
export function integrationBarActiveTitle(
  snap: IntegrationPipelineSnapshot,
  nowMs: number,
  stallMs = DEFAULT_INTEGRATION_STALL_MS,
): string {
  const active = snap.active!;
  const copy = integrationActiveCopy(snap, nowMs, stallMs);
  if (copy.stalled || active.detail?.trim()) return copy.label;
  const elapsed = integrationElapsedMs(active.startedAt, nowMs);
  const elapsedBit = elapsed !== null ? ` ${formatDuration(elapsed)}` : "";
  const stage = integrationStageLabel(active.stage);
  return `integrating · ${stage}${elapsedBit}`;
}
