/**
 * The commit+validate gate that every transition into `review` must pass.
 *
 * Originally handoff-finalization carried this logic privately; #0170 added
 * the vacuous-handoff rejection and #0210 made it the single boundary for ALL
 * paths into `review` — the trusted handoff signal, `PATCH /api/tasks/:id`,
 * and a direct task-file edit picked up by the file watcher. This module is
 * that shared gate.
 *
 * It enforces two guarantees before a task may land in `review`:
 *   1. No uncommitted implementation changes are left behind — either they
 *      are committed (excluding `dist`/`screenshots`/the task file itself) or
 *      the transition is rejected.
 *   2. A transition with zero source changes since the branch diverged from
 *      main is rejected unless the task is marked `no_source_change: true`.
 *
 * The function is idempotent: calling it again after a successful commit (e.g.
 * a PATCH route runs it, then the index's file-watch hook runs it again for
 * the same transition) finds the work already committed and passes without
 * re-committing or spuriously rejecting. Vacuity is therefore judged against
 * the branch's divergence point (merge-base with main), not the staged diff.
 */
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  runGit,
  worktreePathForBranch,
  branchChangesSinceBase,
  currentBranch,
  agentTouchedFiles,
} from "../core/git.js";

export interface ReviewGuardResult {
  ok: boolean;
  /** Human-readable failure reason when not ok. */
  detail?: string;
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

/** True for generated/task-file paths that never count as "source changes". */
function isGeneratedOrTask(path: string, taskPath: string): boolean {
  return (
    path === taskPath ||
    path.startsWith("dist/") ||
    path === "dist" ||
    path.startsWith("screenshots/") ||
    path === "screenshots"
  );
}

/**
 * Stage and commit the worktree's implementation changes (excluding generated
 * artifacts and the task's own file), and reject a vacuous review transition.
 * Mutates the worktree's git state: on success the branch carries the agent's
 * work. Returns `ok: false` with a human-readable reason when the branch
 * cannot be prepared or there is no source change without `no_source_change`.
 */
export async function guardReviewTransition(
  config: RepoOSConfig,
  task: Task,
): Promise<ReviewGuardResult> {
  if (!task.branch) {
    return { ok: false, detail: `task #${task.id} has no branch to finalize from` };
  }
  const registered = worktreePathForBranch(config.root, task.branch);
  const isHotfix = task.hotfix === true;

  if (!registered || (!isHotfix && samePath(registered, config.root)) || !existsSync(registered)) {
    return {
      ok: false,
      detail: `task #${task.id} has no registered worktree for branch ${task.branch}`,
    };
  }

  const clearIndex = await runGit(
    registered,
    // The guard owns the index for this commit. Clear any stale staging (for
    // example a prior accidental `git add -f node_modules`) before selectively
    // staging implementation changes below. This leaves working-tree edits
    // untouched.
    ["reset", "--quiet", "HEAD", "--", "."],
    10_000,
  );
  if (clearIndex.status !== 0) {
    return {
      ok: false,
      detail: `could not clear the staging index: ${concise(clearIndex)}`,
    };
  }

  if (isHotfix) {
    const touched = agentTouchedFiles(registered, "HEAD");
    const sourceFiles = touched.filter((p) => !isGeneratedOrTask(p, task.path));
    if (sourceFiles.length > 0) {
      const add = await runGit(registered, ["add", "--", ...sourceFiles], 30_000);
      if (add.status !== 0) return { ok: false, detail: `git add failed: ${concise(add)}` };
    }
    const staged = await runGit(registered, ["diff", "--cached", "--quiet"], 10_000);
    if (staged.status === 1) {
      const commit = await runGit(
        registered,
        ["commit", "-m", `hotfix(${task.id}): ${task.title}`],
        30_000,
      );
      if (commit.status !== 0)
        return { ok: false, detail: `git commit failed: ${concise(commit)}` };
    } else if (staged.status !== 0) {
      return { ok: false, detail: `could not inspect staged changes: ${concise(staged)}` };
    }
    return { ok: true };
  }

  const add = await runGit(
    registered,
    // `git add` honors .gitignore. Do not name ignored paths as exclusions:
    // Git rejects those pathspecs even though they are exclusions.
    ["add", "-A", "--", "."],
    30_000,
  );
  if (add.status !== 0) return { ok: false, detail: `git add failed: ${concise(add)}` };
  // Remove generated and task metadata paths after staging. Unlike pathspec
  // exclusions, `git reset` is safe whether these paths are ignored, tracked,
  // or absent, and it preserves their working-tree contents.
  const unstageGenerated = await runGit(
    registered,
    ["reset", "--quiet", "HEAD", "--", "dist", "screenshots", task.path],
    10_000,
  );
  if (unstageGenerated.status !== 0) {
    return {
      ok: false,
      detail: `could not unstage generated artifacts: ${concise(unstageGenerated)}`,
    };
  }
  const staged = await runGit(registered, ["diff", "--cached", "--quiet"], 10_000);
  if (staged.status === 1) {
    const commit = await runGit(
      registered,
      ["commit", "-m", `feat(${task.id}): implement ${task.title}`],
      30_000,
    );
    if (commit.status !== 0) return { ok: false, detail: `git commit failed: ${concise(commit)}` };
  } else if (staged.status !== 0) {
    return { ok: false, detail: `could not inspect staged changes: ${concise(staged)}` };
  }

  // Judge vacuity against the branch's divergence point, so the guard is
  // idempotent: work already committed (by a previous guard run, the handoff
  // path, or the agent) keeps the transition valid. Only non-generated, non
  // -task paths count as evidence of implementation.
  const baseBranch = currentBranch(config.root) ?? "main";
  const changes = branchChangesSinceBase(registered, baseBranch);
  const realChange = changes.paths.some((p) => !isGeneratedOrTask(p, task.path));
  if (!realChange && !task.noSourceChange) {
    return {
      ok: false,
      detail:
        "no implementation found since the branch diverged; use no_source_change: true to force a no-op handoff",
    };
  }
  return { ok: true };
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function concise(run: RunResult): string {
  return (
    [run.stdout, run.stderr]
      .join("\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8)
      .join(" · ") || `exit ${run.status}`
  );
}
