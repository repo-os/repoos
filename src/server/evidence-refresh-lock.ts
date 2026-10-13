/**
 * In-process mutex for POST /api/tasks/:id/verify (#0766). Held from before any
 * awaited worktree check through capture so a review cannot start mid-refresh.
 * Review routes consult {@link isEvidenceRefreshActive} via ReviewManager.
 */
const active = new Set<string>();

export function isEvidenceRefreshActive(taskId: string): boolean {
  return active.has(taskId);
}

/** Reserve the refresh slot; false when a refresh is already in flight. */
export function tryBeginEvidenceRefresh(taskId: string): boolean {
  if (active.has(taskId)) return false;
  active.add(taskId);
  return true;
}

export function endEvidenceRefresh(taskId: string): void {
  active.delete(taskId);
}
