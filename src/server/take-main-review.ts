import type { GitWorker } from "./git-worker.js";

export interface TakeMainReviewClassification {
  safe: boolean;
  reason: string;
  reviewedSha: string;
  headSha: string;
  mainSha?: string;
  paths?: string[];
}

/**
 * Conservatively recognize a merge made after review where every net changed
 * path now has exactly main's merge-time contents. Dirty trees and anything
 * other than a two-parent merge are deliberately refused.
 */
export async function classifyTakeMainReviewMerge(
  git: Pick<GitWorker, "runGit" | "isAncestor">,
  worktree: string,
  reviewedSha: string,
  headSha: string,
): Promise<TakeMainReviewClassification> {
  const refuse = (reason: string): TakeMainReviewClassification => ({
    safe: false,
    reason,
    reviewedSha,
    headSha,
  });
  const dirty = await git.runGit(worktree, ["status", "--porcelain"], 10_000);
  if (dirty.status !== 0 || dirty.stdout.trim()) return refuse("worktree is not clean");
  const parents = await git.runGit(worktree, ["rev-list", "--parents", "-n", "1", headSha]);
  if (parents.status !== 0) return refuse("could not read merge commit parents");
  const fields = parents.stdout.trim().split(/\s+/);
  if (fields.length !== 3 || fields[0] !== headSha)
    return refuse("branch tip is not a two-parent merge commit");
  const [mainSha] = fields.slice(2);
  const ancestor = await git.isAncestor(worktree, reviewedSha, fields[1]);
  if (ancestor !== true)
    return refuse("reviewed commit is not an ancestor of the merge's task-side parent");
  const changed = await git.runGit(worktree, ["diff", "--name-only", "-z", reviewedSha, headSha]);
  if (changed.status !== 0) return refuse("could not compare reviewed and merged trees");
  const paths = changed.stdout.split("\0").filter(Boolean);
  if (!paths.length) return refuse("merge has no net changes after the reviewed commit");
  for (const path of paths) {
    const merged = await git.runGit(worktree, ["rev-parse", `${headSha}:${path}`]);
    const main = await git.runGit(worktree, ["rev-parse", `${mainSha}:${path}`]);
    if (merged.status !== main.status || merged.stdout.trim() !== main.stdout.trim())
      return { ...refuse(`path ${path} contains content beyond main's version`), mainSha, paths };
  }
  return {
    safe: true,
    reason: "all net changes since review match main's merge-time versions",
    reviewedSha,
    headSha,
    mainSha,
    paths,
  };
}
