import type { Task } from "./types.js";

/** Automatic reviewer send-backs allowed before human review is required. */
export const MAX_AUTO_REVIEW_ROUNDS = 2;

/**
 * Stale `dev-error` on a `review` task: the engineer reached review but a
 * handoff-signal glitch left the flag set (see TaskDrawer banner note).
 */
export function needsInputSuppressedOnReview(
  task: Pick<Task, "status" | "needsInput" | "needsInputReason">,
): boolean {
  if (!task.needsInput) return false;
  if (task.status === "review" && task.needsInputReason === "dev-error") return true;
  // A stub body no longer matters once the task is active, in review or done.
  return (
    (task.needsInputReason === "underspecified" || task.needsInputReason === "needs-human-step") &&
    (task.status === "active" || task.status === "review" || task.status === "done")
  );
}

/** A successful review run clears these reviewer-episode flags (#0511). */
export function needsInputClearsOnSuccessfulReview(
  task: Pick<Task, "status" | "needsInputReason">,
): boolean {
  if (task.needsInputReason === "review-failed") return true;
  // A fresh review run restarts the episode; if it still finds problems the
  // auto-bounce cap re-raises this flag right after.
  if (task.needsInputReason === "review-rounds-exhausted") return true;
  return task.needsInputReason === "watchdog-stuck" && task.status === "review";
}
