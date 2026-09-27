import type { RepoOSConfig, Task } from "../core/types.js";
import {
  UNDERSPECIFIED_NEEDS_INPUT_REASON,
  assessTaskUnderspecified,
} from "../core/task-underspecified.js";
import { patchTaskFile } from "./write.js";

/**
 * Raise `needs_input` for an under-specified task body without clobbering an
 * unrelated reason already set (dev-error, watchdog-stuck, …).
 */
export function flagUnderspecifiedIfNeeded(config: RepoOSConfig, task: Task): Task | null {
  if (
    task.needsInput &&
    task.needsInputReason &&
    task.needsInputReason !== UNDERSPECIFIED_NEEDS_INPUT_REASON
  ) {
    return null;
  }

  const { underspecified, detail } = assessTaskUnderspecified(task.body);
  if (!underspecified) {
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

/** Reasons cleared when the human sends a PM chat message (mirrors cto-escalation UX). */
export function needsInputClearsOnPmMessage(reason: string | undefined): boolean {
  return reason === "cto-escalation" || reason === UNDERSPECIFIED_NEEDS_INPUT_REASON;
}
