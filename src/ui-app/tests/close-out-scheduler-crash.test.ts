/**
 * #1275 review: a close-out run that throws must not hot-loop and must not
 * block the queue forever. The scheduler backs off, retries a bounded number of
 * times, then gives the job up so its owner can fail it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloseOutScheduler, MAX_RUN_CRASHES } from "../../server/close-out-scheduler.js";
import { shiftBudgetAnchorPastWait } from "../../server/integration-orchestrator.js";
import { isParkedPublisher, type IntegrationJob } from "../../server/integration-job.js";

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
      onGiveUp: (taskId) => {
        gaveUp.push(taskId);
      },
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
      onGiveUp: (taskId) => {
        gaveUp.push(taskId);
      },
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

  it("excludes only the time spent parked, keeping the time already spent validating", () => {
    const parkedAt = anchor + 380_000_000_000n; // parked 380s into the budget
    const nowNs = parkedAt + 120_000_000_000n; // parked for 120s
    const shifted = shiftBudgetAnchorPastWait(anchor.toString(), parkedAt.toString(), nowNs);
    expect(BigInt(shifted!)).toBe(anchor + 120_000_000_000n);
    // 380s of budget are still counted as spent, not reset to zero.
    expect(nowNs - BigInt(shifted!)).toBe(380_000_000_000n);
  });

  it("never moves the anchor past now", () => {
    const nowNs = anchor + 10_000_000_000n;
    const shifted = shiftBudgetAnchorPastWait(anchor.toString(), anchor.toString(), nowNs + 5n);
    expect(BigInt(shifted!)).toBeLessThanOrEqual(nowNs + 5n);
  });

  it("returns null with no anchor, no mark, junk, or a mark from a later clock", () => {
    expect(shiftBudgetAnchorPastWait(null, "5", 10n)).toBeNull();
    expect(shiftBudgetAnchorPastWait("5", undefined, 10n)).toBeNull();
    expect(shiftBudgetAnchorPastWait("5", "junk", 10n)).toBeNull();
    expect(shiftBudgetAnchorPastWait("5", "50", 10n)).toBeNull();
  });
});

describe("failed give-up hand-off (#1275 review)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not abandon a still-pending job when the hand-off rejects", async () => {
    let calls = 0;
    let handoffs = 0;
    const scheduler = new CloseOutScheduler({
      jobs: () => [job("0001")],
      limit: () => 2,
      pressureHeld: () => false,
      run: async () => {
        calls++;
        throw new Error("boom");
      },
      onGiveUp: async () => {
        handoffs++;
        throw new Error("cannot fail it");
      },
    });
    scheduler.pump();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    // Retried after the long backoff, and handed off again rather than dropped.
    expect(handoffs).toBeGreaterThanOrEqual(2);
    expect(calls).toBeGreaterThan(MAX_RUN_CRASHES);
  });
});

describe("isParkedPublisher (#1275 review)", () => {
  it("is true only for a publishing job that does not hold the publish turn", () => {
    const head = { ...job("0001", "validating"), startedAt: "2026-01-01T00:00:00Z" };
    const parked = { ...job("0002", "publishing"), startedAt: "2026-01-01T00:00:00Z" };
    const jobs = [head, parked] as IntegrationJob[];
    expect(isParkedPublisher(jobs, parked)).toBe(true);
    expect(isParkedPublisher(jobs, head)).toBe(false);
  });
});
