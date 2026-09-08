/**
 * Live tracking of the freeform-create PM flesh-out (0335).
 *
 * The PM run is a fire-and-forget async closure in `createFreeformTask` — it
 * never enters the AgentRunner, so nothing else knows it is in flight and a
 * fresh draft is visually indistinguishable from an idle one. This tiny
 * registry is the server-authoritative "PM is working on task X" state: the
 * route marks it when the run starts, clears it when the run finishes (success
 * OR failure), and every task payload augmentation reads it so cards and the
 * task panel can show a live indicator.
 *
 * Deliberately in-memory (like `reviews.isRunning`): the state is transient —
 * a server restart kills the run along with the registry, so a stale
 * "working" flag cannot outlive the process. Task-file frontmatter would be
 * the wrong home for the same reason.
 */

const pmWorking = new Map<string, { startedAt: string }>();

/** Mark a task's draft as being fleshed out by the PM agent right now. */
export function markPmWorking(taskId: string): void {
  pmWorking.set(taskId, { startedAt: new Date().toISOString() });
}

/** Clear the in-flight marker — must be called on every run exit path. */
export function clearPmWorking(taskId: string): void {
  pmWorking.delete(taskId);
}

/** True while the freeform PM flesh-out is running for this task. */
export function isPmWorking(taskId: string): boolean {
  return pmWorking.has(taskId);
}

/**
 * Augment any task payload with the live PM flesh-out flag — the same shape
 * `withReviewStatus` uses for review activity. Applied to every endpoint the
 * board/drawer reads (`/api/board`, `/api/index`, `/api/tasks`, `/api/tasks/:id`,
 * the freeform-create responses) so a refresh/reconnect always reconciles the
 * indicator, not just live SSE. Null passes through (route handlers previously
 * serialized `index.getTask()`'s null directly).
 */
export function withPmWorking<T extends { id: string }>(
  task: T | null,
): (T & { pmWorking: boolean }) | null {
  if (!task) return null;
  return { ...task, pmWorking: pmWorking.has(task.id) };
}
