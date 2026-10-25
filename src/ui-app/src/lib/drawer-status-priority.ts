export interface DrawerStatusCandidates {
  waitingForYou?: boolean;
  reviewFailed?: boolean;
  notLandable?: boolean;
  handoffFailed?: boolean;
  checksRunning?: boolean;
  confirmingHandoff?: boolean;
  checksFailedAfterRetries?: boolean;
  reviewerRunning?: boolean;
  workRunning?: boolean;
}

export type DrawerStatusKey = keyof DrawerStatusCandidates;

/**
 * Shared priority for the drawer's single status card and status line.
 * Human action comes first, then an incomplete review, landing blockers,
 * handoff errors, exhausted checks, and finally live/routine activity.
 */
export function selectDrawerStatus(candidates: DrawerStatusCandidates): DrawerStatusKey | null {
  const priority: DrawerStatusKey[] = [
    "waitingForYou",
    "reviewFailed",
    "notLandable",
    "handoffFailed",
    "checksFailedAfterRetries",
    "confirmingHandoff",
    "checksRunning",
    "reviewerRunning",
    "workRunning",
  ];
  return priority.find((key) => candidates[key]) ?? null;
}
