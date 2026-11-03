/**
 * Merge a `/api/tasks/:id/checks` snapshot with the SSE-fed run list (#1011).
 *
 * A poll can land with a null or older `lastProgressAt` while output events
 * have already moved the in-memory run forward (or the snapshot can omit a
 * run that just started). Replacing the list wholesale toggles "stalled".
 */
import type { TaskCheckRun } from "../types";

function heartbeatMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Newer valid timestamp wins. A null snapshot must not erase a known beat. */
export function laterHeartbeat(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const a = heartbeatMs(current);
  const b = heartbeatMs(incoming);
  if (a !== null && b !== null) return a >= b ? current! : incoming!;
  if (a !== null) return current!;
  if (b !== null) return incoming!;
  return current ?? incoming ?? null;
}

export function mergeTaskCheckRuns(
  current: TaskCheckRun[] | undefined,
  snapshot: TaskCheckRun[],
): TaskCheckRun[] {
  const prev = new Map((current ?? []).map((run) => [run.id, run]));
  const merged = snapshot.map((run) => {
    const old = prev.get(run.id);
    prev.delete(run.id);
    if (!old) return run;
    return { ...run, lastProgressAt: laterHeartbeat(old.lastProgressAt, run.lastProgressAt) };
  });
  for (const run of prev.values()) {
    if (run.running) merged.push(run);
  }
  return merged;
}
