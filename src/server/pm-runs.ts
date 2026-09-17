/**
 * Live tracking of the PM agent's in-flight work per task (0335, 0381).
 *
 * Two distinct PM activities surface as the same "PM is working" indicator:
 *
 * - The freeform-create flesh-out — a fire-and-forget async closure in
 *   `createFreeformTask` that never enters the AgentRunner, so nothing else
 *   knows it is in flight and a fresh draft is visually indistinguishable
 *   from an idle one. Tracked here by task id; the route marks it when the
 *   run starts and clears it in a `finally` on every exit path.
 * - The PM chat (task drawer's PM tab) — an AgentRunner session keyed by
 *   `pm-task-v2:<taskId>` (plus a `::<email>` per-user suffix, 0248). The
 *   route marks it when a message is accepted; the runner's `agent.exited`
 *   event (success, error, or user interrupt — every exit path) clears it
 *   via the emit hook in server.ts. Tracked by session key so two users can
 *   chat about the same task concurrently without one exit dropping the
 *   other's indicator.
 *
 * Deliberately in-memory (like `reviews.isRunning`): the state is transient —
 * a server restart kills the runs along with the registry, so a stale
 * "working" flag cannot outlive the process. Task-file frontmatter would be
 * the wrong home for the same reason.
 */

const pmWorking = new Map<string, { startedAt: string }>();

/** Active PM chat sessions: runner session key → the task it is about. */
const pmChatWorking = new Map<string, { taskId: string; startedAt: string }>();

/** Mark a task's draft as being fleshed out by the PM agent right now. */
export function markPmWorking(taskId: string): void {
  pmWorking.set(taskId, { startedAt: new Date().toISOString() });
}

/** Clear the in-flight marker — must be called on every run exit path. */
export function clearPmWorking(taskId: string): void {
  pmWorking.delete(taskId);
}

/**
 * Mark a PM chat session as live for a task (0381) — the runner accepted a
 * message and a turn is starting (or queued behind maxConcurrentAgents).
 */
export function markPmChatSession(sessionKey: string, taskId: string): void {
  pmChatWorking.set(sessionKey, { taskId, startedAt: new Date().toISOString() });
}

/** Clear one PM chat session — called when the runner reports its exit. */
export function clearPmChatSession(sessionKey: string): void {
  pmChatWorking.delete(sessionKey);
}

/**
 * The task id a runner session key belongs to, when that key is a PM chat
 * session (`pm-task-v2:<id>` with an optional `::<email>` suffix) — null for
 * anything else (engineer keys are bare task ids, review sessions are
 * `review:<id>`, board chats have their own keys). Only the current
 * `pm-task-v2` scheme is matched: the legacy `pm-task:` / `pm:` forms have no
 * live sessions to clear.
 */
export function pmChatSessionTaskId(sessionKey: string): string | null {
  const m = sessionKey.match(/^pm-task-v2:([^:]+)(?:::.*)?$/i);
  return m ? m[1] || null : null;
}

/** True while the PM is working on this task — freeform flesh-out or chat. */
export function isPmWorking(taskId: string): boolean {
  if (pmWorking.has(taskId)) return true;
  for (const { taskId: chatTaskId } of pmChatWorking.values()) {
    if (chatTaskId === taskId) return true;
  }
  return false;
}

/**
 * Augment any task payload with the live PM flag — the same shape
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
  return { ...task, pmWorking: isPmWorking(task.id) };
}
