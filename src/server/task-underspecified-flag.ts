import type { RepoOSConfig, Task } from "../core/types.js";
import { humanStepOverrideSuppresses } from "../core/human-step-override.js";
import { humanStepFlagDetail } from "../core/human-step-decision.js";
import {
  NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON,
  UNDERSPECIFIED_NEEDS_INPUT_REASON,
  assessTaskNeedsHumanStep,
  assessTaskUnderspecified,
  needsHumanStepFingerprint,
} from "../core/task-underspecified.js";
export { NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON, UNDERSPECIFIED_NEEDS_INPUT_REASON };
import { patchTaskFile } from "./write.js";
import { runHumanStepDecisionCheck } from "./human-step-decision.js";

/** Optional decision-model verdict threaded in by the start path (#0804). */
export interface HumanStepFlagOptions {
  /**
   * `"agent"` when the decision model judged the task needs no human-only step.
   * It suppresses the keyword heuristic for this task (and clears a stale
   * keyword flag). The persisted verdict does the same on later sweeps.
   */
  humanStepDecision?: "agent" | "human";
  /** Bounded detail from the model check (#0909), when the caller already ran it. */
  humanStepDetail?: string;
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

function clearHumanStepFlag(config: RepoOSConfig, task: Task): Task | null {
  if (!task.needsInput || task.needsInputReason !== NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON) {
    return null;
  }
  const hasQuestions = (task.questions?.length ?? 0) > 0;
  return patchTaskFile(config, task.absPath, {
    needsInput: hasQuestions,
    needsInputReason: null,
    needsInputDetail: null,
  });
}

async function resolveKeywordTripwire(
  config: RepoOSConfig,
  task: Task,
  assessment: ReturnType<typeof assessTaskNeedsHumanStep>,
): Promise<
  | { action: "flag"; detail: string; persistDecision?: "human" }
  | { action: "clear"; persistDecision?: "agent" }
  | { action: "shadow"; persistDecision: "human" | "agent" }
  | { action: "keyword-fallback"; detail: string }
> {
  if (assessment.taggedHuman) {
    return { action: "flag", detail: assessment.detail };
  }
  if (config.modelRouting?.humanStepCheck !== true) {
    return { action: "keyword-fallback", detail: assessment.detail };
  }
  const check = await runHumanStepDecisionCheck(config, {
    id: task.id,
    title: task.title,
    body: task.body,
    matchedSentence: assessment.sentence,
  });
  if (check.outcome === "unavailable" || check.outcome === "failed") {
    return { action: "keyword-fallback", detail: assessment.detail };
  }
  if (check.outcome === "shadow") {
    return {
      action: "shadow",
      persistDecision: check.decision?.needsHumanStep ? "human" : "agent",
    };
  }
  const explanation = check.detail ?? check.decision?.explanation ?? assessment.detail;
  const detail = humanStepFlagDetail(assessment.sentence, explanation);
  if (check.decision?.needsHumanStep) {
    return { action: "flag", detail, persistDecision: "human" };
  }
  return { action: "clear", persistDecision: "agent" };
}

export async function flagNeedsHumanStepIfNeededAsync(
  config: RepoOSConfig,
  task: Task,
  opts?: HumanStepFlagOptions,
): Promise<Task | null> {
  if (task.assignee === "human") {
    return clearOwnedFlag(config, task, NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON);
  }
  if (humanStepOverrideSuppresses(config, task)) {
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

  const fingerprint = needsHumanStepFingerprint(task.body);
  const modelSaidAgent =
    opts?.humanStepDecision === "agent" ||
    (task.humanStepDecision === "agent" && task.humanStepDecisionKey === fingerprint);
  if (modelSaidAgent) {
    return clearHumanStepFlag(config, task);
  }

  const modelSaidHuman =
    opts?.humanStepDecision === "human" ||
    (task.humanStepDecision === "human" && task.humanStepDecisionKey === fingerprint);
  if (
    modelSaidHuman &&
    task.needsInput &&
    task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON
  ) {
    return null;
  }

  const assessment = assessTaskNeedsHumanStep(task.body, {
    area: task.area,
    assignee: task.assignee,
  });
  if (!assessment.needsHumanStep) {
    return clearHumanStepFlag(config, task);
  }

  const resolved =
    opts?.humanStepDecision === "human" && opts.humanStepDetail
      ? { action: "flag" as const, detail: opts.humanStepDetail, persistDecision: "human" as const }
      : opts?.humanStepDecision === "agent"
        ? { action: "clear" as const, persistDecision: "agent" as const }
        : await resolveKeywordTripwire(config, task, assessment);

  if (resolved.action === "shadow") {
    const cleared = clearHumanStepFlag(config, task);
    const current = cleared ?? task;
    if (
      current.humanStepDecision === resolved.persistDecision &&
      current.humanStepDecisionKey === fingerprint &&
      !current.needsInput
    ) {
      return cleared;
    }
    return patchTaskFile(config, current.absPath, {
      humanStepDecision: resolved.persistDecision,
      humanStepDecisionKey: fingerprint,
      needsInput: false,
      needsInputReason: null,
      needsInputDetail: null,
    });
  }

  if (resolved.action === "clear") {
    const cleared = clearHumanStepFlag(config, task);
    if (resolved.persistDecision === "agent") {
      return patchTaskFile(config, (cleared ?? task).absPath, {
        humanStepDecision: "agent",
        humanStepDecisionKey: fingerprint,
      });
    }
    return cleared;
  }

  const detail = resolved.detail;
  if (
    task.needsInput &&
    task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON &&
    task.needsInputDetail === detail
  ) {
    return null;
  }

  const patch: Parameters<typeof patchTaskFile>[2] = {
    needsInput: true,
    needsInputReason: NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON,
    needsInputDetail: detail,
  };
  if (resolved.action === "flag" && resolved.persistDecision === "human") {
    patch.humanStepDecision = "human";
    patch.humanStepDecisionKey = fingerprint;
  }
  return patchTaskFile(config, task.absPath, patch);
}

/** @deprecated Prefer {@link flagNeedsHumanStepIfNeededAsync}. Sync keyword-only path for tests. */
export function flagNeedsHumanStepIfNeeded(
  config: RepoOSConfig,
  task: Task,
  opts?: HumanStepFlagOptions,
): Task | null {
  if (task.assignee === "human") {
    return clearOwnedFlag(config, task, NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON);
  }
  if (humanStepOverrideSuppresses(config, task)) {
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

  const fingerprint = needsHumanStepFingerprint(task.body);
  const modelSaidAgent =
    opts?.humanStepDecision === "agent" ||
    (task.humanStepDecision === "agent" && task.humanStepDecisionKey === fingerprint);
  if (modelSaidAgent) {
    return clearHumanStepFlag(config, task);
  }

  const modelSaidHuman =
    opts?.humanStepDecision === "human" ||
    (task.humanStepDecision === "human" && task.humanStepDecisionKey === fingerprint);
  if (
    modelSaidHuman &&
    task.needsInput &&
    task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON
  ) {
    return null;
  }

  const { needsHumanStep, detail } = assessTaskNeedsHumanStep(task.body, {
    area: task.area,
    assignee: task.assignee,
  });
  if (!needsHumanStep) {
    return clearHumanStepFlag(config, task);
  }

  if (
    task.needsInput &&
    task.needsInputReason === NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON &&
    task.needsInputDetail === (opts?.humanStepDetail ?? detail)
  ) {
    return null;
  }

  const flagDetail = opts?.humanStepDetail ?? detail;
  const patch: Parameters<typeof patchTaskFile>[2] = {
    needsInput: true,
    needsInputReason: NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON,
    needsInputDetail: flagDetail,
  };
  if (opts?.humanStepDecision === "human") {
    patch.humanStepDecision = "human";
    patch.humanStepDecisionKey = fingerprint;
  }
  return patchTaskFile(config, task.absPath, patch);
}

export function flagUnderspecifiedIfNeeded(config: RepoOSConfig, task: Task): Task | null {
  if (task.assignee === "human") {
    return clearOwnedFlag(config, task, UNDERSPECIFIED_NEEDS_INPUT_REASON);
  }
  if (task.needsInput) {
    if (task.needsInputReason && task.needsInputReason !== UNDERSPECIFIED_NEEDS_INPUT_REASON) {
      return null;
    }
    if ((task.questions?.length ?? 0) > 0 && !task.needsInputReason) {
      return null;
    }
  }

  const { underspecified, detail } = assessTaskUnderspecified(task.body, {
    area: task.area,
    assignee: task.assignee,
  });
  if (!underspecified || isPastFleshOutStage(task)) {
    if (task.needsInput && task.needsInputReason === UNDERSPECIFIED_NEEDS_INPUT_REASON) {
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

export function isUnderspecifiedSweepEligible(task: Task): boolean {
  return !task.isArchived;
}

export async function flagTaskSpecFlagsIfNeededAsync(
  config: RepoOSConfig,
  task: Task,
  opts?: HumanStepFlagOptions,
): Promise<Task | null> {
  let current = task;
  let changed: Task | null = null;
  const human = await flagNeedsHumanStepIfNeededAsync(config, current, opts);
  if (human) {
    changed = human;
    current = human;
  }
  const under = flagUnderspecifiedIfNeeded(config, current);
  return under ?? changed;
}

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

export async function sweepUnderspecifiedTasks(
  config: RepoOSConfig,
  tasks: Iterable<Task>,
): Promise<Task[]> {
  const changed: Task[] = [];
  for (const task of tasks) {
    if (!isUnderspecifiedSweepEligible(task)) continue;
    if (await flagTaskSpecFlagsIfNeededAsync(config, task)) changed.push(task);
  }
  return changed;
}

/** @deprecated Use {@link sweepUnderspecifiedTasks} (async). */
export function sweepUnderspecifiedTasksSync(config: RepoOSConfig, tasks: Iterable<Task>): Task[] {
  const changed: Task[] = [];
  for (const task of tasks) {
    if (!isUnderspecifiedSweepEligible(task)) continue;
    if (flagTaskSpecFlagsIfNeeded(config, task)) changed.push(task);
  }
  return changed;
}

export function needsInputClearsOnPmMessage(reason: string | undefined): boolean {
  return reason === "cto-escalation" || reason === UNDERSPECIFIED_NEEDS_INPUT_REASON;
}
