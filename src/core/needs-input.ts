import type { Task } from "./types.js";

/**
 * Stale `dev-error` on a `review` task: the engineer reached review but a
 * handoff-signal glitch left the flag set (see TaskDrawer banner note).
 */
export function needsInputSuppressedOnReview(
  task: Pick<Task, "status" | "needsInput" | "needsInputReason">,
): boolean {
  return Boolean(
    task.needsInput && task.status === "review" && task.needsInputReason === "dev-error",
  );
}

/** A successful review run clears these reviewer-episode flags (#0511). */
export function needsInputClearsOnSuccessfulReview(
  task: Pick<Task, "status" | "needsInputReason">,
): boolean {
  if (task.needsInputReason === "review-failed") return true;
  return task.needsInputReason === "watchdog-stuck" && task.status === "review";
}
