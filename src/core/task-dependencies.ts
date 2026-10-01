import type { DependencyBlocker, Task } from "./types.js";
import { branchCommit, commitExists, isAncestor, localBranches } from "./git.js";

export class DependencyValidationError extends Error {}

/** Parse task-id lists while tolerating future object-shaped dependency entries. */
export function parseTaskDependencies(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    const id =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? ((entry as Record<string, unknown>).id ??
            (entry as Record<string, unknown>).task_id ??
            (entry as Record<string, unknown>).taskId)
          : undefined;
    if (typeof id === "string" && id.trim()) ids.push(id.trim());
  }
  return ids;
}

/** Canonicalize CLI/API input, rejecting values that cannot be task-id lists. */
export function normalizeTaskDependencies(raw: unknown): string[] {
  if (
    typeof raw !== "string" &&
    (!Array.isArray(raw) || raw.some((id) => typeof id !== "string"))
  ) {
    throw new DependencyValidationError(
      "depends_on must be a comma-separated string or a list of task ids",
    );
  }
  const ids = parseTaskDependencies(raw);
  return [...new Set(ids)];
}

/** Validate dependencies against the current board, including indirect cycles. */
export function validateTaskDependencies(taskId: string, dependsOn: string[], tasks: Task[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const dependencies = [...new Set(dependsOn)];
  for (const id of dependencies) {
    if (id === taskId)
      throw new DependencyValidationError(`Task #${taskId} cannot depend on itself.`);
    if (!byId.has(id))
      throw new DependencyValidationError(`Dependency task #${id} does not exist.`);
  }

  const reaches = (fromId: string, targetId: string, seen = new Set<string>()): boolean => {
    if (fromId === targetId) return true;
    if (seen.has(fromId)) return false;
    seen.add(fromId);
    return (byId.get(fromId)?.dependsOn ?? []).some((next) => reaches(next, targetId, seen));
  };
  for (const id of dependencies) {
    if (reaches(id, taskId)) {
      throw new DependencyValidationError(
        `Dependency #${id} would create a cycle involving task #${taskId}.`,
      );
    }
  }
}

function mainBranch(root: string): string | null {
  const branches = localBranches(root);
  return branches.has("main") ? "main" : branches.has("master") ? "master" : null;
}

function dependencyMergeState(
  root: string,
  upstream: Task,
  base: string | null,
): "merged" | "waiting" | "cancelled" {
  if (upstream.status !== "done") return "waiting";
  const commit =
    upstream.mergedCommit ?? (upstream.branch ? branchCommit(root, upstream.branch) : null);
  if (!commit || !base || !commitExists(root, commit)) return "cancelled";
  const ancestry = isAncestor(root, commit, base);
  if (ancestry === true) return "merged";
  return ancestry === false ? "waiting" : "cancelled";
}

/**
 * Return only unmet prerequisites. "cancelled" is derived for a removed
 * upstream (or a completed task whose merge can no longer be proven), so a
 * human can repair the dependency rather than waiting on an impossible gate.
 */
export function taskDependencyBlockers(
  root: string,
  task: Task,
  tasks: Task[],
): DependencyBlocker[] {
  if (!task.dependsOn?.length) return [];
  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  const base = mainBranch(root);
  const blockers: DependencyBlocker[] = [];
  for (const id of task.dependsOn) {
    const upstream = byId.get(id);
    if (!upstream) {
      blockers.push({ id, state: "cancelled" });
      continue;
    }
    const state = dependencyMergeState(root, upstream, base);
    if (state !== "merged") blockers.push({ id, state });
  }
  return blockers;
}
