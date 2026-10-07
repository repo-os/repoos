import type { IntegrationPipelineSnapshot } from "../types";

/** When the current close-out attempt for `taskId` began (enqueue or processing). */
export function closeOutAttemptStartedAt(
  taskId: string,
  pipeline: IntegrationPipelineSnapshot | null,
): string | null {
  if (!pipeline) return null;
  const active = pipeline.active;
  if (active?.taskId === taskId) {
    return active.startedAt;
  }
  if (pipeline.queue.includes(taskId)) {
    // Older snapshots may omit `queueEnqueuedAt`; `at` is the pipeline tick when
    // the UI learned the task was queued — good enough to treat a prior failure
    // as stale while waiting behind another close-out (#0741).
    return pipeline.queueEnqueuedAt?.[taskId] ?? pipeline.at ?? null;
  }
  return null;
}

/** True when a stored failure predates the in-flight close-out attempt. */
export function isStaleDoneError(
  failedAt: string | undefined,
  attemptStartedAt: string | null,
): boolean {
  if (!failedAt || !attemptStartedAt) return false;
  const failed = Date.parse(failedAt);
  const started = Date.parse(attemptStartedAt);
  if (Number.isNaN(failed) || Number.isNaN(started)) return false;
  return failed < started;
}
