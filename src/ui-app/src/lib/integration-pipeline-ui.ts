import type { CloseOutOutcomeEvent, IntegrationPipelineSnapshot } from "../types";
import { formatDuration, fmtFullDateTime } from "./time";

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
  if (active.progressStale === true) return true;
  const idle = integrationIdleMs(active, nowMs);
  return idle !== null && idle >= stallMs;
}

export interface IntegrationActiveCopy {
  label: string;
  title: string;
  stalled: boolean;
  /** Elapsed close-out time for the hover popover when omitted from the line (#1058). */
  elapsedTip?: string;
}

const INTEGRATING_PREFIX = "integrating · ";

/**
 * Reorder a live integrating label so the current stage and upload percent lead
 * (#0995 E1). The full string is unchanged in Status details; the card uses
 * this shorter-leading form so a three-line clamp keeps the useful parts.
 */
export function integrationProgressCardLabel(label: string): string {
  if (!label.startsWith(INTEGRATING_PREFIX)) return label;
  const tail = label.slice(INTEGRATING_PREFIX.length);
  const pct = tail.match(/\(\d+%\)/)?.[0] ?? null;
  const segments = tail
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean);
  const stage = segments[0] ?? "";
  const head: string[] = ["integrating"];
  if (stage) head.push(stage);
  if (pct) head.push(pct);
  const used = new Set<string>([stage, pct].filter(Boolean) as string[]);
  const rest = segments.slice(1).filter((part) => !used.has(part));
  let out = head.join(" · ");
  if (rest.length) out += ` · ${rest.join(" · ")}`;
  return out;
}

/**
 * "on <host> · attempt N" for the active attempt (#1276). Host is named when it
 * is a remote runner; every attempt is identified, including attempt one.
 */
export function integrationAttemptContext(
  active: NonNullable<IntegrationPipelineSnapshot["active"]>,
): string {
  const parts: string[] = [];
  if (active.host) parts.push(active.host === "local" ? "local" : `on ${active.host}`);
  if (active.attempt) parts.push(`attempt ${active.attempt}`);
  return parts.join(" · ");
}

/**
 * Why this attempt is running again (#1276): the reason the attempt it replaced
 * failed. Null for a first attempt or when no reason was recorded.
 */
export function integrationRetryNote(
  active: NonNullable<IntegrationPipelineSnapshot["active"]>,
): string | null {
  const prev = active.previousFailure;
  if (!active.attempt || active.attempt <= 1 || !prev) return null;
  const reason = prev.reason?.split("\n")[0]?.trim();
  return `Attempt ${active.attempt} — attempt ${prev.attempt} failed${reason ? `: ${reason}` : "."}`;
}

/** Active-job copy for the board card, pipeline bar and drawer (#0740, #1276). */
export function integrationActiveCopy(
  snap: IntegrationPipelineSnapshot,
  nowMs: number,
  stallMs = DEFAULT_INTEGRATION_STALL_MS,
): IntegrationActiveCopy {
  const copy = integrationActiveCopyBase(snap, nowMs, stallMs);
  const note = integrationRetryNote(snap.active!);
  return note ? { ...copy, title: `${copy.title}\n${note}` } : copy;
}

function integrationActiveCopyBase(
  snap: IntegrationPipelineSnapshot,
  nowMs: number,
  stallMs: number,
): IntegrationActiveCopy {
  const active = snap.active!;
  const idle = integrationIdleMs(active, nowMs);
  // The server flags an attempt whose progress writer stopped (#1276); the
  // idle timer still catches a job that reports nothing for a long time.
  const stalled = active.progressStale === true || (idle !== null && idle >= stallMs);
  const ctx = integrationAttemptContext(active);
  const withCtx = (label: string): string => (ctx ? `${label} · ${ctx}` : label);
  if (stalled) {
    const dur = idle !== null ? ` ${formatDuration(idle)}` : "";
    return {
      label: withCtx(`stalled · no progress${dur}`),
      title:
        "Close-out has not reported stage progress in a while — it may be hung. Cancel to return the task to review, or retry to stop and enqueue a fresh attempt.",
      stalled: true,
    };
  }
  const stage = integrationStageLabel(active.stage);
  const step = active.step ?? stage;
  const retry = integrationRetryNote(active);
  const elapsed = integrationElapsedMs(active.startedAt, nowMs);
  const elapsedTip = elapsed !== null ? integrationCloseOutElapsedTip(active, elapsed) : undefined;
  const detail = active.detail?.trim();
  if (detail && detail !== step && !detail.includes(step)) {
    return {
      // A live in-stage detail line — the #0782 bundle upload or a #0799
      // heartbeat naming the current long stage (e.g. "remote tests").
      label: withCtx(`integrating · ${step} · ${detail}${retry ? ` · ${retry}` : ""}`),
      title:
        "Close-out is working — the detail line shows the current step. Progress refreshes every few seconds; the job is only flagged stalled when nothing arrives for a while.",
      stalled: false,
      elapsedTip,
    };
  }
  return {
    // The live step (#1276) names the work more precisely than the coarse stage.
    label: withCtx(`integrating · ${step}${retry ? ` · ${retry}` : ""}`),
    title:
      active.stage === "resolve-conflict"
        ? "Resolving an integration conflict against current main in an isolated candidate — the original review is preserved and only the resolution delta is reviewed."
        : "Move to done is running — merging, building, and checking. See the pipeline bar for live progress.",
    stalled: false,
    elapsedTip,
  };
}

function integrationCloseOutElapsedTip(
  active: NonNullable<IntegrationPipelineSnapshot["active"]>,
  elapsedMs: number,
): string {
  const dur = formatDuration(elapsedMs);
  const headline = dur === "0s" ? "Close-out running just now" : `Close-out running ${dur}`;
  const stamp = fmtFullDateTime(active.lastProgressAt ?? active.startedAt);
  return stamp ? `${headline}\n${stamp}` : headline;
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
  // A live step, host or retry attempt (#1276) is named by the copy label.
  if (active.step || integrationAttemptContext(active)) return `${copy.label}${elapsedBit}`;
  const stage = integrationStageLabel(active.stage);
  return `integrating · ${stage}${elapsedBit}`;
}
