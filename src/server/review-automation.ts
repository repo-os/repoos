/**
 * Single gate for every automatic vs explicit review start (#0865).
 *
 * Entry points (audit list — keep in sync with task notes):
 * - `server.ts` `startReview` on index `status → review` (watcher + API handoff)
 * - `server.ts` `pendingReview` on `agent.exited` while task still in `review`
 * - `review.ts` `recoverInterruptedReviews` on server boot
 * - `review.ts` `refreshStaleEvidenceAndRereview` after stale-only refresh
 * - `review.ts` `repairEvidenceGapAndMaybeRereview` after evidence-gap repair
 * - `review.ts` `scheduleIncompleteRetry` when a pass had no verdict
 * - `task-watchdog.ts` `handleStuckReview` dead reviewer retry
 * - `routes/tasks.ts` `POST …/review/again` and CLI `repoos review` (explicit)
 *
 * Not review spawns: `ReviewManager.runCheckpointDelta` (post-handoff checkpoint).
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  decideAutomaticReview,
  type AutomaticReviewDecision,
  type ReviewGuardReport,
} from "./review-tree-identity.js";

export const REVIEW_RUN_TRIGGERS = {
  STATUS_ENTER_REVIEW: "status-enter-review",
  ENGINEER_EXITED_PENDING: "engineer-exited-pending",
  RECOVERY_INTERRUPTED: "recovery-interrupted",
  STALE_EVIDENCE_REREVIEW: "stale-evidence-rereview",
  EVIDENCE_GAP_REREVIEW: "evidence-gap-rereview",
  INCOMPLETE_RETRY: "incomplete-retry",
  WATCHDOG_STUCK_REVIEW: "watchdog-stuck-review",
  EXPLICIT_AGAIN: "explicit-again",
} as const;

export type ReviewRunTrigger = (typeof REVIEW_RUN_TRIGGERS)[keyof typeof REVIEW_RUN_TRIGGERS];

export function isExplicitReviewTrigger(trigger: ReviewRunTrigger): boolean {
  return trigger === REVIEW_RUN_TRIGGERS.EXPLICIT_AGAIN;
}

export type ReviewAutomationDecision = AutomaticReviewDecision & {
  trigger: ReviewRunTrigger;
};

/**
 * Whether `ReviewManager.run` should proceed for this trigger.
 * Explicit human/CLI "review again" always runs; automatic paths respect the
 * open-findings + unchanged-tree guard.
 */
export function decideReviewAutomation(
  config: RepoOSConfig,
  task: Task,
  report: ReviewGuardReport | null,
  trigger: ReviewRunTrigger,
): ReviewAutomationDecision {
  const explicit = isExplicitReviewTrigger(trigger);
  const base = decideAutomaticReview(config, task, report, { manual: explicit });
  return { ...base, trigger };
}

/** Human-readable audit line for activity / markers. */
export function reviewTriggerNote(trigger: ReviewRunTrigger): string {
  switch (trigger) {
    case REVIEW_RUN_TRIGGERS.STATUS_ENTER_REVIEW:
      return "automatic review on entering review";
    case REVIEW_RUN_TRIGGERS.ENGINEER_EXITED_PENDING:
      return "automatic review after engineer finished (pending queue)";
    case REVIEW_RUN_TRIGGERS.RECOVERY_INTERRUPTED:
      return "automatic review recovery after server restart";
    case REVIEW_RUN_TRIGGERS.STALE_EVIDENCE_REREVIEW:
      return "automatic review after stale evidence refresh";
    case REVIEW_RUN_TRIGGERS.EVIDENCE_GAP_REREVIEW:
      return "automatic review after evidence-gap repair";
    case REVIEW_RUN_TRIGGERS.INCOMPLETE_RETRY:
      return "automatic review retry (incomplete prior pass)";
    case REVIEW_RUN_TRIGGERS.WATCHDOG_STUCK_REVIEW:
      return "automatic review (watchdog dead reviewer retry)";
    case REVIEW_RUN_TRIGGERS.EXPLICIT_AGAIN:
      return "explicit review again (human or CLI)";
    default:
      return `review trigger ${trigger}`;
  }
}
