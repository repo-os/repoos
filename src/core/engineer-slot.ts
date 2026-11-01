/**
 * Which active tasks occupy a concurrent engineer slot (#0993).
 *
 * A task that is `active` but has no live engineer, queued start, or handoff
 * finalization must not block auto-dispatch or the engineer cap.
 */
import type { Task } from "./types.js";
import { isHoldActive } from "./task-selection.js";

export interface EngineerSlotSignals {
  isRunning(taskId: string): boolean;
  isQueued?(taskId: string): boolean;
  isHandoffInFlight?(taskId: string): boolean;
}

/** True when this task should count against `maxActiveTasks`. */
export function taskCountsTowardEngineerCap(task: Task, signals: EngineerSlotSignals): boolean {
  if (task.status !== "active" || task.isArchived) return false;
  if (task.assignee === "human") return false;
  if (isHoldActive(task)) return false;
  const id = task.id;
  if (signals.isRunning(id)) return true;
  if (signals.isQueued?.(id)) return true;
  if (signals.isHandoffInFlight?.(id)) return true;
  return false;
}

export function countEngineerCapUsage(
  tasks: readonly Task[],
  signals: EngineerSlotSignals,
): number {
  return tasks.filter((t) => taskCountsTowardEngineerCap(t, signals)).length;
}
