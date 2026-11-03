/**
 * Review tree identity (#0865): a stable key for "what the reviewer saw" —
 * branch HEAD (short sha) plus handoff evidence `sourceIdentity`, matching the
 * bookkeeping-aware evidence model from #0861 / #0734.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseReviewVerdict, type ReviewVerdict } from "../core/review-verdict.js";
import { isOwnReportPath } from "../core/report-paths.js";
import { getGitWorker } from "./git-worker.js";
import { readUiHandoffGateEvidence } from "./ui-handoff-gate.js";

export function hasOpenReviewFindings(verdict: ReviewVerdict | null): boolean {
  return verdict === "needs some work" || verdict === "back to the drawing board";
}

export type ReviewGuardReport = {
  state: "ok" | "incomplete" | "failed";
  markdown: string;
  treeIdentity?: string | null;
};

/** Canonical `headSha:evidenceIdentity` string; null when HEAD is unknown. */
export function formatReviewTreeIdentity(
  headSha: string | null | undefined,
  evidenceIdentity: string | null | undefined,
): string | null {
  const head = headSha?.trim();
  if (!head) return null;
  const evidence = evidenceIdentity?.trim() ?? "";
  return `${head}:${evidence}`;
}

/** Current tree identity for a task's worktree + recorded handoff evidence. */
export async function reviewTreeIdentityForTask(
  config: RepoOSConfig,
  task: Task,
): Promise<string | null> {
  const worker = getGitWorker(config.root);
  const worktree = task.branch ? await worker.worktreePath(task.branch) : null;
  const headResult = await worker.runGit(worktree ?? config.root, ["rev-parse", "HEAD"]);
  const head = headResult.status === 0 ? headResult.stdout.trim() : null;
  const codeHead =
    head && worktree ? await skipOwnReportCommits(worker, worktree, head, config, task.id) : head;
  const shortResult = codeHead
    ? await worker.runGit(worktree ?? config.root, ["rev-parse", "--short", codeHead])
    : null;
  const short = shortResult?.status === 0 ? shortResult.stdout.trim() : null;
  const evidence = readUiHandoffGateEvidence(config, task.id);
  return formatReviewTreeIdentity(short, evidence?.sourceIdentity ?? null);
}

/**
 * Walk back over commits that only record this task's review passes (#1013).
 *
 * The report commit moves HEAD after every pass. A tree identity that used the
 * literal HEAD would therefore look new on every automatic attempt and re-run a
 * review of unchanged code forever — and would contradict the report the
 * previous pass just stored. The code identity is the newest commit that is not
 * pure report bookkeeping.
 */
async function skipOwnReportCommits(
  worker: ReturnType<typeof getGitWorker>,
  worktree: string,
  head: string,
  config: RepoOSConfig,
  taskId: string,
): Promise<string> {
  let current = head;
  for (let depth = 0; depth < 100; depth++) {
    const parents = await worker.runGit(worktree, ["rev-list", "--parents", "-n", "1", current]);
    if (parents.status !== 0) return current;
    const parts = parents.stdout.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 2) return current;
    const changed = await worker.runGit(worktree, [
      "-c",
      "core.quotepath=false",
      "diff-tree",
      "-r",
      "--no-commit-id",
      "--no-renames",
      "--name-only",
      parts[0]!,
    ]);
    if (changed.status !== 0) return current;
    const paths = changed.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (paths.length === 0 || !paths.every((path) => isOwnReportPath(path, config, taskId))) {
      return current;
    }
    current = parts[1]!;
  }
  return current;
}

export type AutomaticReviewDecision =
  | { action: "run" }
  | { action: "skip"; reason: string; handBackToEngineer: boolean };

/**
 * Whether an automatic review start should be suppressed for this task.
 * Manual "Review again" passes `manual: true` and always runs.
 */
/** Pure guard: open findings on the same tree identity skip another automatic pass. */
export function openFindingsSameTreeDecision(
  report: ReviewGuardReport | null,
  currentTreeIdentity: string | null,
  opts: { manual?: boolean },
): AutomaticReviewDecision {
  if (opts.manual) return { action: "run" };
  if (!report || report.state !== "ok") return { action: "run" };
  const verdict = parseReviewVerdict(report.markdown);
  if (!hasOpenReviewFindings(verdict)) return { action: "run" };

  const reviewed = report.treeIdentity?.trim() || null;
  if (reviewed && currentTreeIdentity && reviewed === currentTreeIdentity) {
    return {
      action: "skip",
      reason: "open findings on an unchanged tree — waiting for the engineer",
      handBackToEngineer: true,
    };
  }
  return { action: "run" };
}

export async function decideAutomaticReview(
  config: RepoOSConfig,
  task: Task,
  report: ReviewGuardReport | null,
  opts: { manual?: boolean },
): Promise<AutomaticReviewDecision> {
  return openFindingsSameTreeDecision(report, await reviewTreeIdentityForTask(config, task), opts);
}

export function openFindingsVerdict(markdown: string): ReviewVerdict | null {
  const verdict = parseReviewVerdict(markdown);
  return hasOpenReviewFindings(verdict) ? verdict : null;
}
