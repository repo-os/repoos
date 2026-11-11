/**
 * Post-sync foreign bookkeeping heal (#1086) — shared by `syncTaskBranch` in
 * server.ts so tests can exercise the same path the HTTP sync route uses.
 */
import { bookkeepingDirs } from "../core/config.js";
import { restoreForeignTaskBookkeepingFromMain } from "../core/git.js";
import { resolveDefaultBranch } from "../core/repo-log.js";
import type { RepoOSConfig, Task } from "../core/types.js";

/** Best-effort heal after sync (success or aborted merge). */
export async function healForeignBookkeepingAfterSync(
  config: RepoOSConfig,
  task: Task,
  worktreePath: string | null,
): Promise<void> {
  if (!worktreePath || !task.branch) return;
  const dirs = bookkeepingDirs(config);
  try {
    await restoreForeignTaskBookkeepingFromMain({
      worktree: worktreePath,
      baseBranch: await resolveDefaultBranch(config.root),
      taskId: task.id,
      ownTaskFile: task.path,
      workDir: dirs.workDir,
      inputsDir: dirs.inputsDir,
      storiesDir: dirs.storiesDir,
    });
  } catch {
    // Handoff runs the same heal again; sync must not block on drift alone.
  }
}
