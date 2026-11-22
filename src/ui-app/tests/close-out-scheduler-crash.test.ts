/**
 * #1275 review: a close-out run that throws must not hot-loop and must not
 * block the queue forever. The scheduler backs off, retries a bounded number of
 * times, then gives the job up so its owner can fail it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloseOutScheduler, MAX_RUN_CRASHES } from "../../server/close-out-scheduler.js";
import { shiftBudgetAnchorPastWait } from "../../server/integration-orchestrator.js";
import type { IntegrationJob } from "../../server/integration-job.js";

const job = (taskId: string, phase: IntegrationJob["phase"] = "queued"): IntegrationJob =>
  ({ taskId, phase, attempt: 1 }) as IntegrationJob;

describe("CloseOutScheduler crash handling (#1275 review)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("backs off a crashed run, retries, then gives up after the bounded count", async () => {
    let calls = 0;
    const gaveUp: string[] = [];
    const scheduler = new CloseOutScheduler({
      jobs: () => [job("0001")],
      limit: () => 2,
      pressureHeld: () => false,
      run: async () => {
        calls++;
        throw new Error("boom");
      },
      onGiveUp: (taskId) => gaveUp.push(taskId),
    });
    scheduler.pump();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    // No immediate restart: the backoff holds it.
    scheduler.pump();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(1);
    // The backoff ends and the run is retried without any outside pump.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(MAX_RUN_CRASHES);
    expect(gaveUp).toEqual(["0001"]);
    // After giving up it is not restarted again by the scheduler.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(MAX_RUN_CRASHES);
  });

  it("a successful run clears the crash count", async () => {
    let calls = 0;
    let finished = false;
    const gaveUp: string[] = [];
    const scheduler = new CloseOutScheduler({
      // The job leaves the queue once its run succeeds, as a real one does.
      jobs: () => (finished ? [] : [job("0001")]),
      limit: () => 2,
      pressureHeld: () => false,
      run: async () => {
        calls++;
        if (calls === 1) throw new Error("boom once");
        finished = true;
      },
      onGiveUp: (taskId) => gaveUp.push(taskId),
    });
    scheduler.pump();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(calls).toBe(2);
    expect(gaveUp).toEqual([]);
  });
});

describe("shiftBudgetAnchorPastWait (#1275 review)", () => {
  const anchor = 1_000_000_000n; // ns
  const parkedSince = "2026-11-20T00:00:00.000Z";
  const parkedMs = Date.parse(parkedSince);

  it("excludes only the time spent parked, keeping the time already spent validating", () => {
    const nowNs = anchor + 500_000_000_000n; // 500s after the anchor
    const shifted = shiftBudgetAnchorPastWait(
      anchor.toString(),
      parkedSince,
      parkedMs + 120_000, // parked for 120s
      nowNs,
    );
    expect(BigInt(shifted!)).toBe(anchor + 120_000_000_000n);
    // 380s of budget are still counted as spent, not reset to zero.
    expect(nowNs - BigInt(shifted!)).toBe(380_000_000_000n);
  });

  it("never moves the anchor past now", () => {
    const nowNs = anchor + 10_000_000_000n;
    const shifted = shiftBudgetAnchorPastWait(
      anchor.toString(),
      parkedSince,
      parkedMs + 999_000,
      nowNs,
    );
    expect(BigInt(shifted!)).toBe(nowNs);
  });

  it("returns null when there is no anchor or parked time", () => {
    expect(shiftBudgetAnchorPastWait(null, parkedSince, parkedMs, 1n)).toBeNull();
    expect(shiftBudgetAnchorPastWait("5", undefined, parkedMs, 10n)).toBeNull();
    expect(shiftBudgetAnchorPastWait("5", "not a date", parkedMs, 10n)).toBeNull();
  });
});
