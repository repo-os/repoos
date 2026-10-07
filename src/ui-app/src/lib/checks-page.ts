import type { IntegrationPipelineSnapshot, RemoteValidationStatusView } from "../types";

/** Checks page tabs — `now` is the live close-out + remote runners view. */
export type ChecksTab = "now" | "runs" | "test-suite" | "plan";

export const CHECKS_TABS: ChecksTab[] = ["now", "runs", "test-suite", "plan"];

const NOW_ALIASES = new Set(["now", "remote"]);

/** Parse `?tab=`; returns null when absent or unknown (caller picks a default). */
export function parseChecksTab(raw: unknown): ChecksTab | null {
  if (typeof raw !== "string") return null;
  if (NOW_ALIASES.has(raw)) return "now";
  if ((CHECKS_TABS as string[]).includes(raw)) return raw as ChecksTab;
  return null;
}

export function checksTabQuery(tab: ChecksTab): Record<string, string> {
  return { tab };
}

export function integrationPipelineLive(
  snap: IntegrationPipelineSnapshot | null | undefined,
): boolean {
  if (!snap) return false;
  if (snap.active) return true;
  if (snap.queue.length > 0) return true;
  return !snap.empty;
}

export function remoteValidationLive(
  status: RemoteValidationStatusView | null | undefined,
): boolean {
  if (!status) return false;
  for (const h of status.hosts ?? []) {
    if (h.inFlight > 0 || h.queued > 0) return true;
    if (h.activeRuns?.length) return true;
    if (h.hungRuns?.length) return true;
    const lock = h.hostLock;
    if (lock?.holders?.length || lock?.waiters?.length) return true;
  }
  return false;
}

export interface ChecksLiveInput {
  integration: IntegrationPipelineSnapshot | null | undefined;
  remoteStatus: RemoteValidationStatusView | null | undefined;
  testRunRunning: boolean;
}

/** True when something check-related is running, queued, hung, or in the close-out pipeline. */
export function checksActivityLive(input: ChecksLiveInput): boolean {
  if (input.testRunRunning) return true;
  if (integrationPipelineLive(input.integration)) return true;
  if (remoteValidationLive(input.remoteStatus)) return true;
  return false;
}

export function resolveChecksDefaultTab(live: boolean): "now" | "runs" {
  return live ? "now" : "runs";
}
