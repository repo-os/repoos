/**
 * #1272 — a close-out's timer counts from when its validating phase starts
 * (the job's `startedAt`), never from when it was queued or from an earlier
 * attempt. Covers the three states the card and pipeline bar can be in:
 * queued (position only, no clock), validating (clock from its own start), and
 * retried (a fresh attempt restarts the clock from its own start).
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { createJobCoordinator, type JobCoordinator } from "../../server/integration-job.js";
import { buildIntegrationSnapshot } from "../../server/integration-status.js";

const MIN = 60_000;
const at = (hhmm: string): Date => new Date(`2026-11-20T${hhmm}:00.000Z`);

describe("close-out timer counts from the validating start (#1272)", () => {
  let root: string;
  let coordinator: JobCoordinator;

  const enqueue = (id: string): void => {
    coordinator.enqueue({ id, branch: `feat/t${id}` } as never);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("06:00"));
    root = mkdtempSync(join(tmpdir(), "repoos-1272-timer-"));
    coordinator = createJobCoordinator(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmFixture(root);
  });

  it("queued: shows queue position and no running timer", () => {
    enqueue("0001");
    vi.setSystemTime(at("06:01"));
    enqueue("0002");
    vi.setSystemTime(at("06:05"));

    const snap = buildIntegrationSnapshot(coordinator, {});

    expect(snap.active).toBeNull();
    expect(snap.queue).toEqual(["0001", "0002"]);
    expect(snap.queueDetail?.map((q) => [q.taskId, q.position])).toEqual([
      ["0001", 1],
      ["0002", 2],
    ]);
    // The wait is reported as a note, but nothing is running yet: no blocker
    // clock and no start time anywhere on the snapshot.
    expect(snap.queueDetail?.every((q) => q.blockerTaskId === null)).toBe(true);
    expect(snap.queueDetail?.every((q) => q.blockerElapsedMs === null)).toBe(true);
    expect(snap.queueDetail?.[0].waitedMs).toBe(5 * MIN);
  });

  it("validating: the clock counts from the job's start, not its enqueue", () => {
    enqueue("0001");
    vi.setSystemTime(at("06:10"));
    coordinator.updateJob("0001", {
      phase: "validating",
      startedAt: new Date().toISOString(),
    });
    vi.setSystemTime(at("06:11"));
    enqueue("0002");
    vi.setSystemTime(at("06:12"));

    const snap = buildIntegrationSnapshot(coordinator, {});

    expect(snap.active?.taskId).toBe("0001");
    expect(snap.active?.startedAt).toBe("2026-11-20T06:10:00.000Z");
    expect(snap.active?.phaseElapsedMs).toBe(2 * MIN);
    expect(snap.queue).toEqual(["0002"]);
    expect(snap.queueDetail?.[0]).toMatchObject({
      taskId: "0002",
      position: 1,
      blockerTaskId: "0001",
      blockerElapsedMs: 2 * MIN,
    });
  });

  it("retried: the new attempt is queued again, then restarts the clock from its own start", () => {
    enqueue("0001");
    vi.setSystemTime(at("06:10"));
    coordinator.updateJob("0001", { phase: "validating", startedAt: new Date().toISOString() });

    // The first attempt fails at 06:20 and a retry is enqueued straight after.
    vi.setSystemTime(at("06:20"));
    coordinator.updateJob("0001", { phase: "failed", reason: "validation failed" });
    enqueue("0001");
    vi.setSystemTime(at("06:25"));

    let snap = buildIntegrationSnapshot(coordinator, {});
    expect(snap.active).toBeNull();
    expect(snap.queueDetail?.[0]).toMatchObject({
      taskId: "0001",
      position: 1,
      blockerElapsedMs: null,
    });
    // Waited since the retry was queued (06:20), not since the first attempt.
    expect(snap.queueDetail?.[0].waitedMs).toBe(5 * MIN);

    // The retry reaches validation at 06:30; its clock starts there.
    vi.setSystemTime(at("06:30"));
    coordinator.updateJob("0001", { phase: "validating", startedAt: new Date().toISOString() });
    vi.setSystemTime(at("06:31"));

    snap = buildIntegrationSnapshot(coordinator, {});
    expect(snap.active?.taskId).toBe("0001");
    expect(snap.active?.startedAt).toBe("2026-11-20T06:30:00.000Z");
    expect(snap.active?.phaseElapsedMs).toBe(1 * MIN);
  });
});
