/**
 * Gather the facts behind `repoos landable <id>` (#0867) and evaluate them.
 *
 * The git half intentionally shares `gatherApprovalPreflight` with the opt-in
 * approval policy, so a branch the policy would not auto-land can never be
 * reported as landable by this command (and vice versa). Everything here is
 * read-only: `git merge-tree`, `git status`, `git diff` and file reads.
 */
import { bookkeepingDirs } from "../core/config.js";
import { branchCommit } from "../core/git.js";
import {
  evaluateLandable,
  reviewPredatesLatestHandoff,
  type LandableResult,
} from "../core/landable.js";
import {
  reviewReportHasBlockingBugs,
  reviewReportIsEnvironmentOnly,
} from "../core/review-report-sections.js";
import { parseReviewVerdict } from "../core/review-verdict.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { ReviewReport } from "./review.js";
import { gatherApprovalPreflight } from "./request-close-out.js";

/** Normalize a repo-relative task path to forward slashes. */
function taskFilePath(task: Task): string {
  return task.path.split("\\").join("/").replace(/^\.\//, "");
}

export async function gatherLandable(
  config: RepoOSConfig,
  task: Task,
  review: ReviewReport | null,
): Promise<LandableResult> {
  const preflight = await gatherApprovalPreflight(config, task);
  const dirs = bookkeepingDirs(config);
  const worktreeDirty = task.hotfix === true ? [] : preflight.worktreeDirty;
  // A hotfix runs in the main checkout, so its HEAD is the branch tip. Use the
  // branch commit only as the fallback for that path, never to paper over an
  // unreadable task worktree.
  const headSha =
    preflight.headSha ??
    (task.hotfix === true && task.branch ? branchCommit(config.root, task.branch) : null);

  return evaluateLandable({
    taskId: task.id,
    branch: task.branch || null,
    headSha,
    lock: preflight.lockSha ? { sha: preflight.lockSha } : null,
    review: {
      present: review !== null,
      state: review?.state ?? null,
      verdict: review ? parseReviewVerdict(review.markdown) : null,
      blockingBugs: review ? reviewReportHasBlockingBugs(review.markdown) : false,
      environmentOnly: review ? reviewReportIsEnvironmentOnly(review.markdown) : false,
      current: review ? !reviewPredatesLatestHandoff(task.body, review.at) : true,
    },
    worktreeDirty,
    branchMissing: preflight.branchMissing,
    merge: preflight.branchMissing
      ? null
      : {
          ok: !preflight.mergePreflightFailed,
          conflicts: preflight.mergeConflicts,
          ...(preflight.mergeReason ? { reason: preflight.mergeReason } : {}),
        },
    ownTaskFile: taskFilePath(task),
    changedPaths: preflight.changedPaths,
    bookkeeping: dirs,
    mainDirty: {
      files: preflight.mainDirtyFiles,
      checkFailed: preflight.mainDirtyCheckFailed,
    },
  });
}
