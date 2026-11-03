import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUEUED_MESSAGE_STALL_MS,
  decideQueuedMessageRecovery,
  type QueuedMessageRecoverySignals,
} from "../../core/queued-message-recovery.js";

/** A signal set that would recover: every guard satisfied. */
const healthy: QueuedMessageRecoverySignals = {
  running: true,
  queuedMessages: 1,
  oldestQueuedMs: DEFAULT_QUEUED_MESSAGE_STALL_MS + 1,
  silent: true,
  busyChild: null,
  processGroupAlive: true,
  paused: false,
  handoffInFlight: false,
  alreadyRecovering: false,
};

describe("queued-message recovery (#1015)", () => {
  it("recovers a silent engineer whose queued message is overdue", () => {
    expect(decideQueuedMessageRecovery(healthy)).toEqual({ recover: true, reason: null });
  });

  const skips: {
    label: string;
    override: Partial<QueuedMessageRecoverySignals>;
    reason: string;
  }[] = [
    { label: "no live turn", override: { running: false }, reason: "not-running" },
    { label: "nothing queued", override: { queuedMessages: 0 }, reason: "no-queued-message" },
    {
      label: "already ended for this message",
      override: { alreadyRecovering: true },
      reason: "already-recovering",
    },
    { label: "human pause", override: { paused: true }, reason: "paused" },
    {
      label: "handoff in flight",
      override: { handoffInFlight: true },
      reason: "handoff-in-flight",
    },
    {
      label: "process group gone (phantom owns it)",
      override: { processGroupAlive: false },
      reason: "process-gone",
    },
    {
      label: "a known work child is running",
      override: { busyChild: "repoos check" },
      reason: "process-busy",
    },
    {
      label: "the engineer is still producing output",
      override: { silent: false },
      reason: "not-silent",
    },
    {
      label: "the message is not overdue yet",
      override: { oldestQueuedMs: 60_000 },
      reason: "not-overdue",
    },
  ];

  for (const { label, override, reason } of skips) {
    it(`does not recover for ${label}`, () => {
      expect(decideQueuedMessageRecovery({ ...healthy, ...override })).toEqual({
        recover: false,
        reason,
      });
    });
  }

  it("honours a custom threshold", () => {
    expect(
      decideQueuedMessageRecovery({ ...healthy, oldestQueuedMs: 5_000, thresholdMs: 10_000 }),
    ).toEqual({ recover: false, reason: "not-overdue" });
    expect(
      decideQueuedMessageRecovery({ ...healthy, oldestQueuedMs: 11_000, thresholdMs: 10_000 }),
    ).toEqual({ recover: true, reason: null });
  });
});
