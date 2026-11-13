export interface DrawerStatusCandidates {
  waitingForYou?: boolean;
  reviewFailed?: boolean;
  notLandable?: boolean;
  handoffFailed?: boolean;
  checksRunning?: boolean;
  /** Live Move-to-done progress. Renders as the single status line. */
  integrating?: boolean;
  confirmingHandoff?: boolean;
  checksFailedAfterRetries?: boolean;
  reviewerRunning?: boolean;
  workRunning?: boolean;
}

export type DrawerStatusKey = keyof DrawerStatusCandidates;

/**
 * Shared priority for the drawer's single status card and status line.
 * Fresh close-out failures come first because they explain the most recent
 * actionable blocker. Then human action, an incomplete review, landing
 * blockers, exhausted checks, close-out progress, and finally
 * live/routine activity. Close-out is the status line: a higher card wins
 * the single slot instead of stacking a second element.
 */
export function selectDrawerStatus(candidates: DrawerStatusCandidates): DrawerStatusKey | null {
  const priority: DrawerStatusKey[] = [
    "handoffFailed",
    "waitingForYou",
    "reviewFailed",
    "notLandable",
    "checksFailedAfterRetries",
    "integrating",
    "checksRunning",
    "confirmingHandoff",
    "reviewerRunning",
    "workRunning",
  ];
  return priority.find((key) => candidates[key]) ?? null;
}
