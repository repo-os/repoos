/**
 * Review tree identity (#0865): a stable key for "what the reviewer saw" —
 * branch HEAD (short sha) plus handoff evidence `sourceIdentity`, matching the
 * bookkeeping-aware evidence model from #0861 / #0734.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import { shortHeadOf, worktreePathForBranch } from "../core/git.js";
import { parseReviewVerdict, type ReviewVerdict } from "../core/review-verdict.js";
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
export function reviewTreeIdentityForTask(config: RepoOSConfig, task: Task): string | null {
  const worktree = task.branch ? worktreePathForBranch(config.root, task.branch) : null;
  const head = shortHeadOf(worktree ?? config.root);
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

export function decideAutomaticReview(
  config: RepoOSConfig,
  task: Task,
  report: ReviewGuardReport | null,
  opts: { manual?: boolean },
): AutomaticReviewDecision {
  return openFindingsSameTreeDecision(report, reviewTreeIdentityForTask(config, task), opts);
}

export function openFindingsVerdict(markdown: string): ReviewVerdict | null {
  const verdict = parseReviewVerdict(markdown);
  return hasOpenReviewFindings(verdict) ? verdict : null;
}
