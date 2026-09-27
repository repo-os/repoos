import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseTask, serializeTask, recordChange } from "../core/task.js";
import { commitTaskFile } from "../core/git.js";
import { WriteError } from "./write.js";

/** Activity line written by {@link dismissNeedsInputOnTask}. */
export function formatNeedsInputDismissedActivity(dismissedBy: string, reason?: string): string {
  const reasonNote = reason ? ` (${reason})` : "";
  return `needs_input${reasonNote} dismissed by ${dismissedBy}`;
}

/**
 * Matches a dismiss activity line; capture group 1 is the ISO timestamp prefix.
 */
export const NEEDS_INPUT_DISMISSED_LINE_RE = /^- (\S+) · needs_input(?: \([^)]+\))? dismissed by /;

/**
 * Clear `needs_input` when the human handled the situation outside the
 * suggested primary action. Records a single activity line for the audit trail.
 */
export function dismissNeedsInputOnTask(
  config: RepoOSConfig,
  absPath: string,
  dismissedBy: string,
): Task {
  if (!existsSync(absPath)) {
    throw new WriteError(`Task file not found: ${absPath}`);
  }
  const current = parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
  if (!current.needsInput) {
    throw new WriteError("Task is not waiting for input");
  }
  const dismissedReason = current.needsInputReason;
  current.needsInput = false;
  current.needsInputReason = undefined;
  current.needsInputDetail = undefined;
  // Mirror patchTaskFile: clearing needsInput also clears any pending questions.
  current.questions = undefined;
  recordChange(current, formatNeedsInputDismissedActivity(dismissedBy, dismissedReason));
  writeFileSync(absPath, serializeTask(current));
  commitTaskFile(config.root, absPath, `docs(${current.id}): update task`);
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
}
