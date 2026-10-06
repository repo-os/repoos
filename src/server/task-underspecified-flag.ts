import type { RepoOSConfig, Task } from "../core/types.js";
import {
  NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON,
  UNDERSPECIFIED_NEEDS_INPUT_REASON,
  assessTaskNeedsHumanStep,
  assessTaskUnderspecified,
} from "../core/task-underspecified.js";
export { NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON, UNDERSPECIFIED_NEEDS_INPUT_REASON };
import { patchTaskFile } from "./write.js";

/**
 * Raise `needs_input` for an under-specified task body without clobbering an
 * unrelated reason already set (dev-error, watchdog-stuck, …).
 */
/** `active`, `review` and `done` tasks are being (or have been) worked — flesh-out no longer matters. */
export function isPastFleshOutStage(task: Pick<Task, "status">): boolean {
  return task.status === "active" || task.status === "review" || task.status === "done";
}

export function flagNeedsHumanStepIfNeeded(config: RepoOSConfig, task: Task): Task | null {
  if (task.needsInput) {
    if (task.needsInputReason && task.needsInputReason !== NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON) {
      return null;
    }
    if ((task.questions?.length ?? 0) > 0 && !task.needsInputReason) {
      return null;
    }
  }

  const { needsHumanStep, detail } = assessTaskNeedsHumanStep(task.body, { area: task.area });
  if (!needsHumanStep || isPastFleshOutStage(task)) {
    if (task.needsInput && task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON) {
      const hasQuestions = (task.questions?.length ?? 0) > 0;
      return patchTaskFile(config, task.absPath, {
        needsInput: hasQuestions,
        needsInputReason: null,
        needsInputDetail: null,
      });
    }
    return null;
  }

  if (
    task.needsInput &&
    task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON &&
    task.needsInputDetail === detail
  ) {
    return null;
  }

  return patchTaskFile(config, task.absPath, {
    needsInput: true,
    needsInputReason: NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON,
    needsInputDetail: detail,
  });
}

export function flagUnderspecifiedIfNeeded(config: RepoOSConfig, task: Task): Task | null {
  if (task.needsInput) {
    if (task.needsInputReason && task.needsInputReason !== UNDERSPECIFIED_NEEDS_INPUT_REASON) {
      return null;
    }
    // Agent questions with no explicit reason still block the human — keep that presentation.
    if ((task.questions?.length ?? 0) > 0 && !task.needsInputReason) {
      return null;
    }
  }

  // Once work has started (or finished) a stub body no longer needs a human:
  // never raise the flag, and drop a stale one.
  const { underspecified, detail } = assessTaskUnderspecified(task.body, { area: task.area });
  if (!underspecified || isPastFleshOutStage(task)) {
    if (task.needsInput && task.needsInputReason === UNDERSPECIFIED_NEEDS_INPUT_REASON) {
      // Drop only the obsolete reason; agent questions keep the human blocked.
      const hasQuestions = (task.questions?.length ?? 0) > 0;
      return patchTaskFile(config, task.absPath, {
        needsInput: hasQuestions,
        needsInputReason: null,
        needsInputDetail: null,
      });
    }
    return null;
  }

  if (
    task.needsInput &&
    task.needsInputReason === UNDERSPECIFIED_NEEDS_INPUT_REASON &&
    task.needsInputDetail === detail
  ) {
    return null;
  }

  return patchTaskFile(config, task.absPath, {
    needsInput: true,
    needsInputReason: UNDERSPECIFIED_NEEDS_INPUT_REASON,
    needsInputDetail: detail,
  });
}

/**
 * Whether a task is a candidate for the underspecified sweep. Terminal and
 * under-review tasks are excluded — `review` already suppresses the flag (#0511)
 * and `done` is history — as are archived tasks (shelved, not actionable).
 */
export function isUnderspecifiedSweepEligible(task: Task): boolean {
  // Past-stage tasks stay eligible so the sweep clears their stale flag.
  return !task.isArchived;
}

/**
 * One-time sweep over the current board (#0668): flag every eligible task whose
 * body still looks like a stub. Idempotent — `flagUnderspecifiedIfNeeded`
 * no-ops when the flag already matches, never clobbers an unrelated
 * `needs_input` reason, and clears only its own stale reason — so repeated
 * sweeps do not churn the files. Returns the tasks whose file was rewritten
 * (the caller commits them on the control plane).
 */
/**
 * Run human-step and underspecified assessments. Human-only acceptance criteria
 * take precedence over stub-body detection when both would flag.
 */
export function flagTaskSpecFlagsIfNeeded(config: RepoOSConfig, task: Task): Task | null {
  let current = task;
  let changed: Task | null = null;
  const human = flagNeedsHumanStepIfNeeded(config, current);
  if (human) {
    changed = human;
    current = human;
  }
  const under = flagUnderspecifiedIfNeeded(config, current);
  return under ?? changed;
}

export function sweepUnderspecifiedTasks(config: RepoOSConfig, tasks: Iterable<Task>): Task[] {
  const changed: Task[] = [];
  for (const task of tasks) {
    if (!isUnderspecifiedSweepEligible(task)) continue;
    if (flagTaskSpecFlagsIfNeeded(config, task)) changed.push(task);
  }
  return changed;
}

/** Reasons cleared when the human sends a PM chat message (mirrors cto-escalation UX). */
export function needsInputClearsOnPmMessage(reason: string | undefined): boolean {
  return (
    reason === "cto-escalation" ||
    reason === UNDERSPECIFIED_NEEDS_INPUT_REASON ||
    reason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON
  );
}
