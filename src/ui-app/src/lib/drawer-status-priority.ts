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

/** Shared priority for the single drawer chip and above-tabs status summary. */
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
