import type { DependencyBlocker, Task } from "./types.js";
import {
  branchCommit,
  commitAncestrySnapshotAsync,
  repoGitOverviewAsync,
  type RepoGitOverview,
  branchRefSnapshot,
  commitExists,
  isAncestor,
  localBranches,
  mergedBranches,
  mergedBranchesAsync,
} from "./git.js";

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
export function validateTaskDependencies(
  taskId: string,
  dependsOn: string[],
  tasks: readonly Task[],
): void {
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

/**
 * Board-wide dependency resolution with two git queries, not two per upstream:
 * one ref/object-id snapshot and one `branch --merged` snapshot. Arbitrary
 * `mergedCommit` SHAs still need an ancestry check because they are not refs.
 */
export function taskDependencyBlockersForAll(
  root: string,
  tasks: Task[],
  facts?: { overview: RepoGitOverview; ancestry: Map<string, boolean | null> },
): Map<string, DependencyBlocker[]> {
  const result = new Map<string, DependencyBlocker[]>();
  if (!tasks.some((task) => task.dependsOn?.length)) return result;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const refs = facts?.overview ?? branchRefSnapshot(root, null);
  const base = refs.branches.has("main") ? "main" : refs.branches.has("master") ? "master" : null;
  const merged =
    facts?.overview.mergedBranches ?? (base ? mergedBranches(root, base) : new Set<string>());
  const ancestry = facts?.ancestry ?? new Map<string, boolean | null>();

  const stateFor = (upstream: Task): "merged" | "waiting" | "archived" | "cancelled" => {
    if (wasExplicitlyAbandoned(upstream)) return "cancelled";
    if (upstream.isArchived) return "archived";
    if (upstream.status !== "done") return "waiting";
    if (!base) return "cancelled";
    if (upstream.mergedCommit) {
      const key = facts ? upstream.mergedCommit : `${base}\0${upstream.mergedCommit}`;
      let state = ancestry.get(key);
      if (state === undefined && !facts) {
        state = isAncestor(root, upstream.mergedCommit, base);
        ancestry.set(key, state);
      }
      return state === true ? "merged" : state === false ? "waiting" : "cancelled";
    }
    if (!upstream.branch || !refs.branches.has(upstream.branch)) return "cancelled";
    return merged.has(upstream.branch) ? "merged" : "waiting";
  };

  for (const task of tasks) {
    if (!task.dependsOn?.length) continue;
    const blockers: DependencyBlocker[] = [];
    for (const id of task.dependsOn) {
      const upstream = byId.get(id);
      const state = upstream ? stateFor(upstream) : "cancelled";
      if (state !== "merged") blockers.push({ id, state });
    }
    result.set(task.id, blockers);
  }
  return result;
}

/** Server board path: share ref facts and batch stored merge-commit ancestry. */
export async function taskDependencyBlockersForAllAsync(
  root: string,
  tasks: Task[],
  overview?: RepoGitOverview,
): Promise<Map<string, DependencyBlocker[]>> {
  if (!tasks.some((task) => task.dependsOn?.length)) return new Map();
  overview ??= await repoGitOverviewAsync(root);
  const base = overview.branches.has("main")
    ? "main"
    : overview.branches.has("master")
      ? "master"
      : null;
  if (base && base !== overview.baseBranch) {
    overview = { ...overview, mergedBranches: await mergedBranchesAsync(root, base) };
  }
  const dependedOn = new Set(tasks.flatMap((task) => task.dependsOn ?? []));
  const commits = tasks
    .filter(
      (task) =>
        dependedOn.has(task.id) &&
        task.status === "done" &&
        !task.isArchived &&
        !wasExplicitlyAbandoned(task) &&
        task.mergedCommit,
    )
    .map((task) => task.mergedCommit!);
  const baseCommit = base ? overview.heads.get(base) : null;
  const ancestry = baseCommit
    ? await commitAncestrySnapshotAsync(root, commits, baseCommit)
    : new Map();
  return taskDependencyBlockersForAll(root, tasks, { overview, ancestry });
}
