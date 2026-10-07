/**
 * CTO liveness heartbeat (#0728): external supervisors and the internal monitor
 * record activity so the attention feed can raise "CTO silent" when routine
 * work is waiting.
 */

export class CtoHeartbeatTracker {
  private lastAt: string | null = null;

  /** Record a heartbeat at `at` (defaults to now). */
  touch(at?: string): string {
    this.lastAt = at ?? new Date().toISOString();
    return this.lastAt;
  }

  last(): string | null {
    return this.lastAt;
  }
}

/** Default silence window when the board has CTO-actionable attention items. */
export const DEFAULT_CTO_SILENT_MS = 15 * 60 * 1000;

export function ctoSilentThresholdMs(
  ctoMonitorIntervalMs?: number,
  fallbackMs: number = DEFAULT_CTO_SILENT_MS,
): number {
  if (typeof ctoMonitorIntervalMs === "number" && ctoMonitorIntervalMs > 0) {
    return Math.max(ctoMonitorIntervalMs * 2, 5 * 60 * 1000);
  }
  return fallbackMs;
}
