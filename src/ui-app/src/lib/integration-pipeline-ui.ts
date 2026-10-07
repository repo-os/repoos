import type { IntegrationPipelineSnapshot } from "../types";
import { formatDuration } from "./time";

/** Default stall window when the active close-out reports no stage progress (#0740). */
export const DEFAULT_INTEGRATION_STALL_MS = 3 * 60 * 1000;

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
  return {
    label: `integrating · ${stage}${elapsedBit}`,
    title: "Move to done is running — merging, building, and checking. See the pipeline bar for live progress.",
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
  const label = behind
    ? `queued #${pos.position} (behind #${behind})`
    : `queued #${pos.position}`;
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
  if (copy.stalled) return copy.label;
  const elapsed = integrationElapsedMs(active.startedAt, nowMs);
  const elapsedBit = elapsed !== null ? ` ${formatDuration(elapsed)}` : "";
  const stage = integrationStageLabel(active.stage);
  return `integrating · ${stage}${elapsedBit}`;
}
