import type { RepoOSConfig, Task } from "../core/types.js";
import {
  NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON,
  UNDERSPECIFIED_NEEDS_INPUT_REASON,
  assessTaskNeedsHumanStep,
  assessTaskUnderspecified,
  needsHumanStepFingerprint,
} from "../core/task-underspecified.js";
export { NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON, UNDERSPECIFIED_NEEDS_INPUT_REASON };
import { patchTaskFile } from "./write.js";

/** Optional decision-model verdict threaded in by the start path (#0804). */
export interface HumanStepFlagOptions {
  /**
   * `"agent"` when the decision model judged the task needs no human-only step.
   * It suppresses the keyword heuristic for this task (and clears a stale
   * keyword flag). The persisted verdict does the same on later sweeps.
   */
  humanStepDecision?: "agent" | "human";
}

/**
 * Raise `needs_input` for an under-specified task body without clobbering an
 * unrelated reason already set (dev-error, watchdog-stuck, …).
 */
/** `active`, `review` and `done` tasks are being (or have been) worked — flesh-out no longer matters. */
export function isPastFleshOutStage(task: Pick<Task, "status">): boolean {
  return task.status === "active" || task.status === "review" || task.status === "done";
}

/**
 * Drop one of our own flag reasons (#0815), preserving any agent questions that
 * also keep the human blocked. Returns the rewritten task, or null when there
 * was nothing of ours to clear.
 */
function clearOwnedFlag(config: RepoOSConfig, task: Task, reason: string): Task | null {
  if (!task.needsInput || task.needsInputReason !== reason) return null;
  const hasQuestions = (task.questions?.length ?? 0) > 0;
  return patchTaskFile(config, task.absPath, {
    needsInput: hasQuestions,
    needsInputReason: null,
    needsInputDetail: null,
  });
}

export function flagNeedsHumanStepIfNeeded(
  config: RepoOSConfig,
  task: Task,
  opts?: HumanStepFlagOptions,
): Task | null {
  // #0815: a task assigned to a human is the human's own checklist — the
  // keyword heuristic for agent work never applies, and a stale flag from a
  // previous assignee is cleared rather than kept.
  if (task.assignee === "human") {
    return clearOwnedFlag(config, task, NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON);
  }
  // #0815: an explicit human override clears the keyword match on purpose (and
  // survives later sweeps) until the override is removed.
  if (task.humanStepOverride) {
    return clearOwnedFlag(config, task, NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON);
  }
  if (task.needsInput) {
    if (task.needsInputReason && task.needsInputReason !== NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON) {
      return null;
    }
    if ((task.questions?.length ?? 0) > 0 && !task.needsInputReason) {
      return null;
    }
  }

  // #0804: a persisted decision-model verdict overrides the keyword heuristic
  // while the acceptance criteria it was made on are unchanged. "agent" clears
  // (and keeps clearing) the flag; "human" preserves the model's flag and its
  // explanation even when the regex would have missed or reworded it.
  const fingerprint = needsHumanStepFingerprint(task.body);
  const modelSaidAgent =
    opts?.humanStepDecision === "agent" ||
    (task.humanStepDecision === "agent" && task.humanStepDecisionKey === fingerprint);
  if (modelSaidAgent) {
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

  const modelSaidHuman =
    opts?.humanStepDecision === "human" ||
    (task.humanStepDecision === "human" && task.humanStepDecisionKey === fingerprint);
  if (modelSaidHuman) {
    if (task.needsInput && task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON) {
      return null;
    }
    // No flag present: leave it that way. A dismissed or otherwise-cleared flag
    // must not be resurrected by a later sweep, and the keyword detail would be
    // strictly worse than the model's own text.
    return null;
  }

  const { needsHumanStep, detail } = assessTaskNeedsHumanStep(task.body, {
    area: task.area,
    assignee: task.assignee,
  });
  if (!needsHumanStep) {
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
  // #0815: a human task never has to carry an agent task body, so the
  // underspecified rule does not apply — clear our stale flag if one is set.
  if (task.assignee === "human") {
    return clearOwnedFlag(config, task, UNDERSPECIFIED_NEEDS_INPUT_REASON);
  }
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
  const { underspecified, detail } = assessTaskUnderspecified(task.body, {
    area: task.area,
    assignee: task.assignee,
  });
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
export function flagTaskSpecFlagsIfNeeded(
  config: RepoOSConfig,
  task: Task,
  opts?: HumanStepFlagOptions,
): Task | null {
  let current = task;
  let changed: Task | null = null;
  const human = flagNeedsHumanStepIfNeeded(config, current, opts);
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
