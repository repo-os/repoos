import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseTask, serializeTask, recordChange } from "../core/task.js";
import { commitTaskFile } from "../core/git.js";
import { WriteError } from "./write.js";

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
  current.needsInput = false;
  current.needsInputReason = undefined;
  current.needsInputDetail = undefined;
  // Mirror patchTaskFile: clearing needsInput also clears any pending questions.
  current.questions = undefined;
  recordChange(current, `needs_input dismissed by ${dismissedBy}`);
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
