/**
 * Server-side context for a task's captured shots (#0582): which preview
 * targets its changed paths touch, and the area/target mismatch warning shown
 * in the drawer. Kept separate from the storage module so the pure resolution
 * in `core/shot-targets.ts` stays testable without git or a repo.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import { getGitWorker } from "./git-worker.js";
import {
  shotTargetMismatchWarning,
  shotTargetsForPaths,
  targetsForPaths,
} from "../core/shot-targets.js";

export interface TaskShotContext {
  /** Files this task's branch changed vs its base (best-effort; empty when unknown). */
  changedPaths: string[];
  /** Capture target names the changed paths resolve to, in config order. */
  detected: string[];
  /** Area/target mismatch warning, when the diff touches a target the area misses. */
  warning?: string;
}

/**
 * Compute the shot context for `task` from its worktree diff. Fail-soft: a
 * missing worktree or an unusable git base yields an empty, warning-free
 * context rather than throwing into a route handler.
 */
export async function computeTaskShotContext(
  config: RepoOSConfig,
  task: Task,
): Promise<TaskShotContext> {
  const empty: TaskShotContext = { changedPaths: [], detected: [] };
  if (!task.branch) return empty;
  const worker = getGitWorker(config.root);
  const worktree = await worker.worktreePath(task.branch);
  if (!worktree) return empty;
  const base = (await worker.currentBranch()) ?? "main";
  let changedPaths: string[] = [];
  try {
    changedPaths = (await worker.changedPathsVsBase(worktree, base)) ?? [];
  } catch {
    return empty;
  }
  // Web preview targets and command capture targets (#0761) both count as
  // detected evidence; web targets are listed first, matching resolution order.
  const detected = [
    ...targetsForPaths(config.preview, changedPaths),
    ...shotTargetsForPaths(config.shot, changedPaths),
  ];
  const warning = shotTargetMismatchWarning(config.preview, task.area, changedPaths);
  return {
    changedPaths,
    detected,
    ...(warning ? { warning } : {}),
  };
}
