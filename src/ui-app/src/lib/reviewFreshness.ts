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
 * code being edited now — while the engineer is fixing after review, or after
 * an auto-bounce (`review→active` after the report landed) (#0685).
 */
export function reviewSupersededByFixRound(
  task: Pick<Task, "status" | "body">,
  reportAt: string | null | undefined,
  engineerRunning: boolean,
): boolean {
  if (!reportAt) return false;
  const reportTime = Date.parse(reportAt);
  if (!Number.isFinite(reportTime)) return false;
  if (engineerRunning) return true;
  if (task.status !== "active") return false;
  const bounces = task.body.matchAll(/^- ([^\s]+) · status review→active\s*$/gm);
  let latestBounce = Number.NEGATIVE_INFINITY;
  for (const [, at] of bounces) {
    const time = Date.parse(at);
    if (Number.isFinite(time)) latestBounce = Math.max(latestBounce, time);
  }
  return latestBounce > reportTime;
}
