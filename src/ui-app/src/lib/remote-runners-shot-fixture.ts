import type { RemoteHostStatusView } from "../types";

/**
 * Isolated hung-run rows for screenshot evidence (#0729). Query
 * `?rvFixture=hung-runs` on Checks → Remote runners replaces the host list
 * with this fixture only — never mutates real runner state.
 */
export function remoteRunnersHungShotFixture(): RemoteHostStatusView {
  const startedAt = new Date(Date.now() - 6 * 60_000).toISOString();
  const killedAt = new Date(Date.now() - 90_000).toISOString();
  return {
    host: "fixture-host",
    user: "fixture",
    labels: [],
    maxConcurrent: 1,
    inFlight: 1,
    queued: 0,
    probed: true,
    healthy: true,
    activeRuns: [
      {
        taskId: "0729",
        startedAt,
        phase: "test",
        label: "#0729",
        hung: true,
      },
    ],
    hungRuns: [
      {
        taskId: "0199",
        at: killedAt,
        detail: "no output for 5m on idle host (fixture)",
      },
    ],
  };
}
