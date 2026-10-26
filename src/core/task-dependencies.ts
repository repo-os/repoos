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

const mainBranchCache = new Map<string, { at: number; branch: string | null }>();

function mainBranch(root: string): string | null {
  const hit = mainBranchCache.get(root);
  if (hit && Date.now() - hit.at < 30_000) return hit.branch;
  const branches = localBranches(root);
  const branch = branches.has("main") ? "main" : branches.has("master") ? "master" : null;
  mainBranchCache.set(root, { at: Date.now(), branch });
  return branch;
}

function wasExplicitlyAbandoned(task: Task): boolean {
  let abandoned = false;
  for (const line of task.body.split(/\r?\n/)) {
    if (/^-\s+\S+\s+·\s+status\s+\w+→\w+/.test(line)) {
      abandoned = false;
    } else if (/^-\s+\S+\s+·\s+note: task abandoned$/.test(line)) {
      abandoned = true;
    }
  }
  return abandoned && task.status === "ready";
}

function dependencyMergeState(
  root: string,
  upstream: Task,
  base: string | null,
): "merged" | "waiting" | "archived" | "cancelled" {
  if (wasExplicitlyAbandoned(upstream)) return "cancelled";
  // An archived task is parked, not delivered (#0657): even a task archived
  // after it went done cannot satisfy a dependency, because the human has
  // explicitly set it aside. Surfaced as its own state so the dependent shows
  // WHY it is blocked rather than a bare "Blocked by #x".
  if (upstream.isArchived) return "archived";
  if (upstream.status !== "done") return "waiting";
  // This runs per dependent task from GET /api/tasks and spawns up to four
  // synchronous git children each; with hundreds of tasks that blocked the
  // server for a minute (2026-10-26). A merged upstream stays merged, so cache
  // it for good; other outcomes for a short while.
  const key = `${root}\0${upstream.id}\0${upstream.mergedCommit ?? upstream.branch ?? ""}\0${base ?? ""}`;
  const hit = dependencyStateCache.get(key);
  if (hit && (hit.state === "merged" || Date.now() - hit.at < DEPENDENCY_STATE_TTL_MS)) {
    return hit.state;
  }
  const state = computeDependencyMergeState(root, upstream, base);
  dependencyStateCache.set(key, { at: Date.now(), state });
  return state;
}

const dependencyStateCache = new Map<
  string,
  { at: number; state: "merged" | "waiting" | "archived" | "cancelled" }
>();
const DEPENDENCY_STATE_TTL_MS = 60_000;

function computeDependencyMergeState(
  root: string,
  upstream: Task,
  base: string | null,
): "merged" | "waiting" | "archived" | "cancelled" {
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
