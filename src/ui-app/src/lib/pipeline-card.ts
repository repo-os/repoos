/**
 * Line-4 helpers for the Pipeline card (#1035): engineer/reviewer round
 * chips, model short names and the run host.
 *
 * Round counts come from the same fields the task panel reads
 * (`extra.review_passes`, `extra.review_rounds`, `extra.dev_error_count`),
 * so the card and the panel can never drift into two answers. The panel
 * (`TaskDrawer.vue`) calls {@link taskRoundCounts} too.
 */
import type { Task } from "../types";
import type { ReviewVerdictTone } from "./reviewVerdict";

export interface TaskRoundCounts {
  dev: number;
  review: number;
}

function countField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Compact lifecycle counts: D = dev passes, R = review passes. Mirrors the
 * task panel's logic: completed passes, plus errored dev attempts that never
 * reached a review pass, plus one for the pass currently in flight.
 */
export function taskRoundCounts(
  task: Pick<Task, "status" | "needsInput" | "extra" | "branch">,
  inDevPass: boolean,
): TaskRoundCounts {
  if (!task.branch && (task.status === "draft" || task.status === "inbox")) {
    return { dev: 0, review: 0 };
  }
  const rawPasses = task.extra?.review_passes;
  const passes =
    typeof rawPasses === "number" && Number.isFinite(rawPasses)
      ? Math.max(0, Math.floor(rawPasses))
      : countField(task.extra?.review_rounds);
  const devErrors = countField(task.extra?.dev_error_count);
  return {
    dev: passes + devErrors + (inDevPass ? 1 : 0),
    review: passes,
  };
}

/** True while the task is inside (or about to start) a dev pass. */
export function taskInDevPass(
  task: Pick<Task, "status" | "needsInput">,
  engineerRunning: boolean,
): boolean {
  return (
    !task.needsInput &&
    (task.status === "ready" ||
      task.status === "active" ||
      (task.status === "review" && engineerRunning))
  );
}

/**
 * Reviewer round chip: `R1 ✓` (green), `R1 changes` (amber), `R2 ↻` (red),
 * or the upcoming pass while a review is running with no verdict yet. Null
 * when there is nothing to show — the card omits the chip rather than
 * inventing a round.
 */
export function reviewerChip(opts: {
  passes: number;
  tone: ReviewVerdictTone | null;
  reviewRunning: boolean;
}): string | null {
  if (opts.tone === "green") return `R${opts.passes} ✓`;
  if (opts.tone === "amber") return `R${opts.passes} changes`;
  if (opts.tone === "red") return `R${opts.passes} ↻`;
  if (opts.reviewRunning) return `R${opts.passes + 1} …`;
  return null;
}

function shortModel(model: string): string {
  const seg = model.split("/").pop()?.trim() ?? "";
  return seg || model;
}

/** Model(s) for line 4: engineer first, reviewer appended when it differs. */
export function pipelineModelsLabel(engineerModel: string, reviewerModel: string): string {
  const en = shortModel(engineerModel);
  const rv = shortModel(reviewerModel);
  return rv && rv !== en ? `${en} · ${rv}` : en;
}

/** Where the task runs: the remote host name, or this Mac for local work. */
export function pipelineHostLabel(
  runHost: string | null | undefined,
  queueHost: string | null | undefined,
): string {
  return runHost ?? queueHost ?? "this Mac";
}
