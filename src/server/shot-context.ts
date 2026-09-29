/**
 * Server-side context for a task's captured shots (#0582): which preview
 * targets its changed paths touch, and the area/target mismatch warning shown
 * in the drawer. Kept separate from the storage module so the pure resolution
 * in `core/shot-targets.ts` stays testable without git or a repo.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import { branchChangesSinceBase, currentBranch, worktreePathForBranch } from "../core/git.js";
import { shotTargetMismatchWarning, targetsForPaths } from "../core/shot-targets.js";

export interface TaskShotContext {
  /** Files this task's branch changed vs its base (best-effort; empty when unknown). */
  changedPaths: string[];
  /** Preview target names the changed paths resolve to, in config order. */
  detected: string[];
  /** Area/target mismatch warning, when the diff touches a target the area misses. */
  warning?: string;
}

/**
 * Compute the shot context for `task` from its worktree diff. Fail-soft: a
 * missing worktree or an unusable git base yields an empty, warning-free
 * context rather than throwing into a route handler.
 */
export function computeTaskShotContext(config: RepoOSConfig, task: Task): TaskShotContext {
  const empty: TaskShotContext = { changedPaths: [], detected: [] };
  if (!task.branch) return empty;
  const worktree = worktreePathForBranch(config.root, task.branch);
  if (!worktree) return empty;
  const base = currentBranch(config.root) ?? "main";
  let changedPaths: string[] = [];
  try {
    changedPaths = branchChangesSinceBase(worktree, base).paths;
  } catch {
    return empty;
  }
  const detected = targetsForPaths(config.preview, changedPaths);
  const warning = shotTargetMismatchWarning(config.preview, task.area, changedPaths);
  return {
    changedPaths,
    detected,
    ...(warning ? { warning } : {}),
  };
}
