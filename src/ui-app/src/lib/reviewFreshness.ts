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

/**
 * True when an existing review report must not be read as the verdict on the
 * code being edited now — e.g. after an auto-bounce sent the engineer back to
 * `active` (#0685).
 */
export function reviewSupersededByFixRound(
  task: Pick<Task, "status">,
  hasReport: boolean,
  engineerRunning: boolean,
): boolean {
  if (!hasReport) return false;
  if (engineerRunning) return true;
  return task.status === "active";
}
