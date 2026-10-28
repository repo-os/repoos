/**
 * Review tree identity (#0865): a stable key for "what the reviewer saw" —
 * branch HEAD (short sha) plus handoff evidence `sourceIdentity`, matching the
 * bookkeeping-aware evidence model from #0861 / #0734.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseReviewVerdict, type ReviewVerdict } from "../core/review-verdict.js";
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
  const headResult = await worker.runGit(worktree ?? config.root, ["rev-parse", "--short", "HEAD"]);
  const head = headResult.status === 0 ? headResult.stdout.trim() : null;
  const evidence = readUiHandoffGateEvidence(config, task.id);
  return formatReviewTreeIdentity(head, evidence?.sourceIdentity ?? null);
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
