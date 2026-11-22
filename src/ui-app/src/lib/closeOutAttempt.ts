import type { IntegrationPipelineSnapshot } from "../types";

/**
 * When the validating phase of `taskId`'s current close-out began — the job's
 * `startedAt`. Null while the attempt is queued or when it is not in the
 * pipeline: a close-out timer never counts from enqueue or from an earlier
 * attempt (#1272).
 */
export function closeOutAttemptStartedAt(
  taskId: string,
  pipeline: IntegrationPipelineSnapshot | null,
): string | null {
  if (pipeline?.active?.taskId !== taskId) return null;
  return pipeline.active.startedAt ?? null;
}

/**
 * The instant a stored failure must predate to count as stale for `taskId`'s
 * current attempt. Once validating that is the attempt's own start; while
 * queued it is the enqueue time (or the pipeline tick when the UI learned of
 * it), so a prior failure is treated as stale while waiting behind another
 * close-out (#0741). This is for staleness only, never for a timer.
 */
export function closeOutFailureCutoff(
  taskId: string,
  pipeline: IntegrationPipelineSnapshot | null,
): string | null {
  const started = closeOutAttemptStartedAt(taskId, pipeline);
  if (started) return started;
  if (!pipeline) return null;
  const running = pipeline.parallel?.some((p) => p.taskId === taskId) ?? false;
  if (pipeline.active?.taskId === taskId || running || pipeline.queue.includes(taskId)) {
    // Older snapshots may omit `queueEnqueuedAt`.
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
