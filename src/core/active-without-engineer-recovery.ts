/**
 * Auto-recover an `active` task whose engineer is gone (#0993).
 *
 * Pure planning: the watchdog/server apply path writes activity and relaunches.
 */
import type { Task } from "./types.js";

/** Default window before an engineer-less active task is restarted (10 minutes). */
export const DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS = 10 * 60 * 1000;

/** Minimum configurable window (1 minute). */
export const MIN_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS = 60_000;

export interface ActiveWithoutEngineerPlanInput {
  task: Pick<Task, "status" | "isArchived" | "assignee" | "assignedTo">;
  now: number;
  windowMs: number;
  running: boolean;
  queued: boolean;
  handoffInFlight: boolean;
  pendingHandoff: boolean;
  paused: boolean;
  held: boolean;
  humanAssigned: boolean;
  closingOut: boolean;
  stoppedByPerson: boolean;
  /** Milliseconds since the last activity entry after the current `→active`. */
  idleMs: number;
}

export type ActiveWithoutEngineerPlan = { action: "skip"; reason: string } | { action: "recover" };

export function activeWithoutEngineerWindowMs(
  configured: number | undefined,
  fallback = DEFAULT_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS,
): number {
  if (
    typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured >= MIN_ACTIVE_WITHOUT_ENGINEER_RECOVER_MS
  ) {
    return configured;
  }
  return fallback;
}

export function planActiveWithoutEngineerRecovery(
  input: ActiveWithoutEngineerPlanInput,
): ActiveWithoutEngineerPlan {
  if (input.task.status !== "active" || input.task.isArchived) {
    return { action: "skip", reason: "not active" };
  }
  if (input.humanAssigned) return { action: "skip", reason: "human-assigned" };
  if (input.held) return { action: "skip", reason: "held" };
  if (input.closingOut) return { action: "skip", reason: "closing out" };
  if (input.running) return { action: "skip", reason: "engineer running" };
  if (input.queued) return { action: "skip", reason: "start queued" };
  if (input.handoffInFlight) return { action: "skip", reason: "handoff in flight" };
  if (input.pendingHandoff) return { action: "skip", reason: "pending handoff" };
  if (input.paused) return { action: "skip", reason: "deliberately paused" };
  if (input.stoppedByPerson) return { action: "skip", reason: "stopped by request" };
  const windowMs = activeWithoutEngineerWindowMs(input.windowMs);
  if (input.idleMs < windowMs) {
    return { action: "skip", reason: "inside recovery window" };
  }
  return { action: "recover" };
}
