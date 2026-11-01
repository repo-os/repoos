/**
 * #1000 — active task card distinguishes agent silence from checks and remote waits.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHECK_STALL_MS,
  DEFAULT_STUCK_SILENCE_MS,
  resolveActiveEngineerCardHint,
  type ActiveTaskCheckSnapshot,
} from "../../core/active-task-card.js";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");

function check(over: Partial<ActiveTaskCheckSnapshot> = {}): ActiveTaskCheckSnapshot {
  return {
    running: true,
    startedAt: "2026-11-01T11:50:00.000Z",
    lastProgressAt: "2026-11-01T11:59:30.000Z",
    progressLabel: "step 5 of 12 · tests 109/645 files",
    scopeLabel: "changed:main",
    machine: "air",
    ...over,
  };
}

describe("resolveActiveEngineerCardHint (#0994 local check)", () => {
  it("shows check progress instead of stuck · silent while the gate is heartbeating", () => {
    const hint = resolveActiveEngineerCardHint({
      nowMs: NOW,
      agentSilentMs: 9 * 60 * 1000,
      check: check(),
      remote: null,
      localQueueLabel: null,
      localQueueTitle: null,
      remotePoolQueueLabel: null,
      remotePoolQueueTitle: null,
      busyChild: null,
    });
    expect(hint.cls).not.toBe("tc-stuck");
    expect(hint.label).toContain("checking");
    expect(hint.label).toContain("109/645");
    expect(hint.blocksAgentInterrupt).toBe(true);
  });

  it("labels a wedged check stalled, not agent silent", () => {
    const hint = resolveActiveEngineerCardHint({
      nowMs: NOW,
      agentSilentMs: 20 * 60 * 1000,
      check: check({
        lastProgressAt: "2026-11-01T11:55:00.000Z",
        progressLabel: "step 5 of 12 · tests 109/645 files",
      }),
      remote: null,
      localQueueLabel: null,
      localQueueTitle: null,
      remotePoolQueueLabel: null,
      remotePoolQueueTitle: null,
      busyChild: null,
      checkStallMs: DEFAULT_CHECK_STALL_MS,
    });
    expect(hint.label).toMatch(/^check stalled/);
    expect(hint.cls).toBe("tc-stuck");
    expect(hint.blocksAgentInterrupt).toBe(true);
  });
});

describe("resolveActiveEngineerCardHint (#0998 remote wait)", () => {
  it("surfaces telemetry mismatch when host lock disagrees with runner idle", () => {
    const hint = resolveActiveEngineerCardHint({
      nowMs: NOW,
      agentSilentMs: 8 * 60 * 1000,
      check: null,
      remote: {
        run: null,
        queue: null,
        telemetryMismatch:
          "Host thinkpad still holds an SSH validation slot for this task but the runner registry shows idle — investigate before restarting.",
      },
      localQueueLabel: null,
      localQueueTitle: null,
      remotePoolQueueLabel: null,
      remotePoolQueueTitle: null,
      busyChild: null,
    });
    expect(hint.label).toContain("telemetry mismatch");
    expect(hint.cls).toBe("tc-stuck");
    expect(hint.blocksAgentInterrupt).toBe(true);
  });

  it("shows a live remote run while agent output is silent", () => {
    const hint = resolveActiveEngineerCardHint({
      nowMs: NOW,
      agentSilentMs: 6 * 60 * 1000,
      check: null,
      remote: {
        run: {
          host: "thinkpad",
          kind: "self-check",
          stage: "run",
          startedAt: "2026-11-01T11:58:00.000Z",
          elapsedMs: 120_000,
        },
        queue: null,
        telemetryMismatch: null,
      },
      localQueueLabel: null,
      localQueueTitle: null,
      remotePoolQueueLabel: null,
      remotePoolQueueTitle: null,
      busyChild: null,
    });
    expect(hint.label).toContain("remote self-check");
    expect(hint.cls).toBe("tc-moving");
    expect(hint.blocksAgentInterrupt).toBe(true);
  });
});

describe("resolveActiveEngineerCardHint (agent silence)", () => {
  it("falls through to stuck · silent only when nothing else explains the quiet", () => {
    const hint = resolveActiveEngineerCardHint({
      nowMs: NOW,
      agentSilentMs: DEFAULT_STUCK_SILENCE_MS + 1000,
      check: null,
      remote: null,
      localQueueLabel: null,
      localQueueTitle: null,
      remotePoolQueueLabel: null,
      remotePoolQueueTitle: null,
      busyChild: null,
    });
    expect(hint.label).toContain("stuck · silent");
    expect(hint.cls).toBe("tc-stuck");
  });
});

describe("remoteTelemetryMismatch (#0998)", () => {
  it("flags host-lock holder when the server registry is idle", async () => {
    const { remoteTelemetryMismatch } = await import("../../server/active-task-card.js");
    const mismatch = remoteTelemetryMismatch(
      "0998",
      null,
      [
        {
          host: "thinkpad",
          user: "nick",
          labels: [],
          maxConcurrent: 1,
          inFlight: 0,
          queued: 0,
          probed: true,
          healthy: true,
          hostLock: {
            holders: [
              {
                state: "holding",
                taskId: "0998",
                label: "#0998",
                phase: "self-check",
                ageSecs: 120,
              },
            ],
            waiters: [],
          },
        },
      ],
      false,
    );
    expect(mismatch).toContain("thinkpad");
    expect(mismatch).toContain("0998");
  });
});
