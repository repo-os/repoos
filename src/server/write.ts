/**
 * Safe, single-task mutations for the server.
 *
 * The CLI mutates by rebuilding the whole index then writing — fine for a
 * one-shot process. A long-lived server with multiple writers (you + agents)
 * needs to avoid clobbering: between the moment the server read a task and the
 * moment it writes, the file may have changed on disk (an agent edited the
 * body, say). So we re-read immediately before writing and merge the requested
 * field changes onto the CURRENT on-disk state, rather than onto a possibly
 * stale in-memory copy.
 *
 * Because status lives in per-task files (never a shared queue file), the only
 * conflict surface is concurrent writes to the SAME task — which this handles.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { RepoOSConfig, Task, Status } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { parseTask, serializeTask } from "../core/task.js";

export interface TaskPatch {
  status?: Status;
  title?: string;
  priority?: string;
  area?: string;
  assignedTo?: string;
  branch?: string;
  type?: string;
  body?: string;
}

export class WriteError extends Error {}

/**
 * Apply a patch to a task file safely. `absPath` is the file to edit. Returns
 * the freshly re-parsed Task. Throws WriteError on bad input or missing file.
 */
export function patchTaskFile(
  config: RepoOSConfig,
  absPath: string,
  patch: TaskPatch,
): Task {
  if (!existsSync(absPath)) {
    throw new WriteError(`Task file not found: ${absPath}`);
  }
  if (
    patch.status !== undefined &&
    !(STATUSES as readonly string[]).includes(patch.status)
  ) {
    throw new WriteError(
      `Invalid status "${patch.status}". Valid: ${STATUSES.join(", ")}`,
    );
  }

  // Re-read CURRENT on-disk state right before writing.
  const current = parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });

  // Merge requested fields onto the current state.
  if (patch.status !== undefined) current.status = patch.status;
  if (patch.title !== undefined) current.title = patch.title;
  if (patch.priority !== undefined) current.priority = patch.priority;
  if (patch.area !== undefined) current.area = patch.area;
  if (patch.branch !== undefined) current.branch = patch.branch;
  if (patch.type !== undefined) current.type = patch.type;
  if (patch.assignedTo !== undefined) {
    current.assignedTo = patch.assignedTo;
    current.assignee =
      patch.assignedTo.toLowerCase() === "ai"
        ? "ai"
        : patch.assignedTo
          ? "human"
          : "unassigned";
  }
  if (patch.body !== undefined) current.body = patch.body;

  current.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(absPath, serializeTask(current));

  // Re-parse so the returned object reflects exactly what's on disk.
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
}
