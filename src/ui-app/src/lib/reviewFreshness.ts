import type { Task } from "../types";

/** A report from before the latest engineering handoff is context, not the
 * verdict on the code currently waiting for review. Activity timestamps are
 * recorded to the second, while report timestamps include milliseconds. */
export function reportPredatesLatestHandoff(
  task: Pick<Task, "body">,
  reportAt: string | null | undefined,
): boolean {
  if (!reportAt) return false;
  const reportTime = Date.parse(reportAt);
  if (!Number.isFinite(reportTime)) return false;
  const transitions = task.body.matchAll(/^- ([^\s]+) · status [^\s]+→review\s*$/gm);
  let latest = Number.NEGATIVE_INFINITY;
  for (const [, at] of transitions) {
    const time = Date.parse(at);
    if (Number.isFinite(time)) latest = Math.max(latest, time);
  }
  return latest > reportTime;
}
