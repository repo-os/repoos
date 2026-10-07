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
    return pipeline.queueEnqueuedAt?.[taskId] ?? null;
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
