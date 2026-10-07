import type { Task } from "./types.js";
import { UNDERSPECIFIED_NEEDS_INPUT_REASON } from "./task-underspecified.js";

/** Automatic reviewer send-backs allowed before human review is required. */
export const MAX_AUTO_REVIEW_ROUNDS = 2;

/** Provider/run-health flags clear when engineering work resumes (#0716). */
export function needsInputClearsOnNewEngineerRun(reason: string | undefined): boolean {
  if (!reason || reason === UNDERSPECIFIED_NEEDS_INPUT_REASON) return true;
  return reason === "provider-failure" || reason === "degenerate-output";
}

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
  if (
    task.needsInputReason === "underspecified" &&
    (task.status === "active" || task.status === "review" || task.status === "done")
  ) {
    return true;
  }
  // Human-only acceptance criteria stay actionable — and visible — while the
  // task is being worked and signed off (#0698); they are the moment a human
  // should split the work rather than accept an agent's unverifiable claim.
  // Only `done` is history, so suppress there alone.
  return task.needsInputReason === "needs-human-step" && task.status === "done";
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
