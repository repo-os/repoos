/**
 * Fence for task writes while Move to done is running (#0886).
 *
 * `request-close-out.ts` / the `/done` route write an advisory
 * `.repoos/locks/<id>.json` with `status: "closing-out"` before the job is
 * enqueued, and the close-out pipeline owns the task file from then until the
 * merge (or a failure) settles it. A late engineer handoff request used to
 * arrive in that window, re-serialize a task file whose merge was in progress,
 * and commit `status: inbox`; the engineer process may even be a phantom the
 * runner registry no longer knows about (#0863), so refusing on the lock rather
 * than on `runner.isRunning` is what actually closes the race.
 *
 * The lock is advisory on disk but authoritative for these entry points: every
 * one of them must reject *before* writing anything.
 */
import { readWorktreeReviewLock } from "./worktree-handoff-guard.js";

/** True when the task's on-disk close-out lock says Move to done is running. */
export function isTaskClosingOut(
  root: string,
  cacheDir: string | undefined,
  taskId: string,
): boolean {
  return readWorktreeReviewLock(root, cacheDir ?? ".repoos", taskId)?.status === "closing-out";
}

/** The one refusal message every task-write entry point shows while closing. */
export function closingOutRefusal(taskId: string): string {
  return (
    `#${taskId} is being closed out (Move to done in progress) — task changes and ` +
    "handoff requests are ignored until it finishes. Nothing was written; retry only " +
    "if the close-out fails."
  );
}
