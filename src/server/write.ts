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
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { RepoOSConfig, Task, Status } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { parseTask, serializeTask, recordChange, utcTimestamp } from "../core/task.js";

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

/** Thrown when a delete target resolves outside the configured work dir. */
export class PathGuardError extends WriteError {}

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

  // Track changes for activity log
  const changes: string[] = [];

  // Merge requested fields onto the current state.
  if (patch.status !== undefined) {
    if (patch.status !== current.status) {
      changes.push(`status ${current.status}→${patch.status}`);
    }
    current.status = patch.status;
  }
  if (patch.title !== undefined) {
    if (patch.title !== current.title) changes.push("title");
    current.title = patch.title;
  }
  if (patch.priority !== undefined) {
    if (patch.priority !== current.priority) changes.push("priority");
    current.priority = patch.priority;
  }
  if (patch.area !== undefined) {
    if (patch.area !== current.area) changes.push("area");
    current.area = patch.area;
  }
  if (patch.branch !== undefined) {
    if (patch.branch !== current.branch) changes.push("branch");
    current.branch = patch.branch;
  }
  if (patch.type !== undefined) {
    if (patch.type !== current.type) changes.push("type");
    current.type = patch.type;
  }
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo !== current.assignedTo) changes.push("assigned_to");
    current.assignedTo = patch.assignedTo;
    current.assignee =
      patch.assignedTo.toLowerCase() === "ai"
        ? "ai"
        : patch.assignedTo
          ? "human"
          : "unassigned";
  }
  if (patch.body !== undefined) {
    if (patch.body !== current.body) changes.push("body");
    current.body = patch.body;
  }

  if (changes.length) {
    recordChange(current, changes.join(", "));
  } else {
    current.updated_at = utcTimestamp();
  }
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

/**
 * Remove a task file. `absPath` must resolve inside the configured work dir —
 * this mirrors the `safeRepoFile` guard and prevents deleting arbitrary repo
 * files through the API. Throws PathGuardError when the target is outside the
 * work dir, and WriteError when the file is already gone (callers treat the
 * latter as an idempotent 404).
 */
export function deleteTaskFile(config: RepoOSConfig, absPath: string): string {
  const workDir = resolve(join(config.root, config.workDir));
  const abs = resolve(absPath);
  if (!(abs.startsWith(workDir + sep) || abs === workDir)) {
    throw new PathGuardError(`Refusing to delete outside work dir: ${abs}`);
  }
  if (!existsSync(abs)) {
    throw new WriteError(`Task file not found: ${abs}`);
  }
  unlinkSync(abs);
  return abs;
}
