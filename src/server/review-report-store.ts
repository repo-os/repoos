/**
 * Persist a review report on the task branch (#1013).
 *
 * Review reports used to live only in the gitignored cache, so they vanished
 * with the machine. The canonical copy now travels with the task branch under
 * `<workDir>/reports/<taskId>/review-<pass>.md`, alongside the engineering
 * rounds. Writing it is bookkeeping, not implementation: after the commit the
 * handoff snapshot and review lock are advanced to the new HEAD so the report
 * commit cannot look like drift to Move to done or `repoos landable`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { runGit } from "../core/git.js";
import { reviewReportRelPath } from "../core/report-paths.js";
import { checkGateBusyRun, waitForCheckGateRelease } from "./check-gate-lock.js";
import {
  readWorktreeReviewLock,
  refreshHandoffSnapshotFromWorktree,
} from "./worktree-handoff-guard.js";

export interface PersistReviewReportResult {
  /** The tracked file was written into the worktree. */
  tracked: boolean;
  /** A report commit was created on the task branch. */
  committed: boolean;
  error?: string;
}

/**
 * Write `content` to the tracked review-report path in `worktree`, commit only
 * that file, and refresh the handoff snapshot + review lock.
 *
 * Best-effort by contract: a failure leaves the caller's cache mirror intact and
 * returns `error` for logging, never throwing into the review run.
 */
export async function persistTrackedReviewReport(args: {
  config: RepoOSConfig;
  worktree: string;
  branch: string;
  taskId: string;
  pass: number;
  content: string;
}): Promise<PersistReviewReportResult> {
  const { config, worktree, branch, taskId, pass, content } = args;
  const rel = reviewReportRelPath(config, taskId, pass);
  try {
    mkdirSync(dirname(join(worktree, rel)), { recursive: true });
    writeFileSync(join(worktree, rel), content);
  } catch (error) {
    return { tracked: false, committed: false, error: (error as Error).message };
  }

  const add = await runGit(worktree, ["add", "--", rel], 15_000);
  if (add.status !== 0) {
    return { tracked: true, committed: false, error: add.stderr.trim() || "git add failed" };
  }
  // `--only` keeps unrelated staged/uncommitted work out of the report commit.
  // A running self-check refuses commits in its worktree; wait it out (#1082).
  const commit = (
    await waitForCheckGateRelease(
      () =>
        runGit(
          worktree,
          ["commit", "--only", "-m", `docs(${taskId}): record review pass ${pass}`, "--", rel],
          30_000,
        ),
      checkGateBusyRun,
      { boardRoot: config.root, cacheDir: config.cacheDir ?? ".repoos" },
    )
  ).result;
  if (commit.status !== 0) {
    return {
      tracked: true,
      committed: false,
      error: commit.stderr.trim() || commit.stdout.trim() || "git commit failed",
    };
  }

  // Only a task already fenced for review has a lock to advance. Without one
  // there is nothing to invalidate, and creating a lock here would be a lie.
  const lock = readWorktreeReviewLock(config.root, config.cacheDir, taskId);
  if (lock) {
    const refreshed = await refreshHandoffSnapshotFromWorktree(config, taskId, branch, worktree);
    if (!refreshed.ok) {
      return { tracked: true, committed: true, error: refreshed.reason };
    }
  }
  return { tracked: true, committed: true };
}
