/**
 * Frontmatter fields that must not survive on a finished task (#0993).
 */
import type { Task } from "./types.js";

/** Clear human-attention and hold state when a task lands in `done`. */
export function clearTerminalStateForDone(task: Task): boolean {
  let changed = false;
  if (task.needsInput) {
    task.needsInput = false;
    changed = true;
  }
  if (task.needsInputReason !== undefined) {
    task.needsInputReason = undefined;
    changed = true;
  }
  if (task.needsInputDetail !== undefined) {
    task.needsInputDetail = undefined;
    changed = true;
  }
  if (task.debugTldr !== undefined) {
    task.debugTldr = undefined;
    changed = true;
  }
  if (task.debugTldrAt !== undefined) {
    task.debugTldrAt = undefined;
    changed = true;
  }
  if (task.debugTldrKey !== undefined) {
    task.debugTldrKey = undefined;
    changed = true;
  }
  if (task.isHeld) {
    task.isHeld = false;
    changed = true;
  }
  if (task.holdReason !== undefined) {
    task.holdReason = undefined;
    changed = true;
  }
  if (task.holdUntil !== undefined) {
    task.holdUntil = undefined;
    changed = true;
  }
  if (task.holdBy !== undefined) {
    task.holdBy = undefined;
    changed = true;
  }
  if (task.holdAt !== undefined) {
    task.holdAt = undefined;
    changed = true;
  }
  if ((task.tags ?? []).some((t) => t.trim().toLowerCase() === "hold")) {
    task.tags = (task.tags ?? []).filter((t) => t.trim().toLowerCase() !== "hold");
    changed = true;
  }
  return changed;
}
