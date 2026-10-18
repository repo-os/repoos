import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTEGRATION_STALL_MS,
  integrationActiveCopy,
  integrationCountdownLabel,
  integrationMedianChip,
  integrationMedianDuration,
  integrationMedianTip,
  integrationPipelineStalled,
  integrationQueuedCopy,
} from "../src/lib/integration-pipeline-ui";
import type { CloseOutOutcomeEvent, IntegrationPipelineSnapshot } from "../src/types";

function outcome(taskId: string, minutesAgo: number, durationMs?: number): CloseOutOutcomeEvent {
  return {
    taskId,
    outcome: "succeeded",
    finishedAt: new Date(
      Date.parse("2026-10-07T13:00:00.000Z") - minutesAgo * 60_000,
    ).toISOString(),
    reason: "",
    durationMs,
  };
}

function snap(
  over: Partial<IntegrationPipelineSnapshot> = {},
  activeOver: Partial<NonNullable<IntegrationPipelineSnapshot["active"]>> = {},
): IntegrationPipelineSnapshot {
  const { active: activeOverride, ...rest } = over;
  const active: IntegrationPipelineSnapshot["active"] = {
    taskId: "0730",
    stage: null,
    failed: false,
    startedAt: "2026-10-07T13:00:00.000Z",
    lastProgressAt: "2026-10-07T13:00:00.000Z",
    ...activeOver,
    ...activeOverride,
  };
  return {
    empty: false,
    queue: [],
    at: "2026-10-07T13:00:00.000Z",
    ...rest,
    active,
  };
}

describe("integration-pipeline-ui (#0740)", () => {
  it("renders integrating · starting… when the active job has no stage yet", () => {
    const now = Date.parse("2026-10-07T13:02:27.000Z");
    const copy = integrationActiveCopy(snap(), now);
    expect(copy.label).toBe("integrating · starting… · 2m 27s");
    expect(copy.stalled).toBe(false);
  });

  it("renders queued position behind the active task", () => {
    const pipeline = snap({ queue: ["0720", "0712"] }, { taskId: "0730", stage: "check" });
    const queued = integrationQueuedCopy(pipeline, "0720");
    expect(queued?.label).toBe("queued #1 (behind #0730)");
  });

  it("flags a stall after the default threshold with no progress", () => {
    const now = Date.parse("2026-10-07T13:04:01.000Z");
    const pipeline = snap(
      {},
      {
        lastProgressAt: "2026-10-07T13:00:00.000Z",
        startedAt: "2026-10-07T13:00:00.000Z",
      },
    );
    expect(integrationPipelineStalled(pipeline, now)).toBe(true);
    const copy = integrationActiveCopy(pipeline, now);
    expect(copy.stalled).toBe(true);
    expect(copy.label).toMatch(/^stalled · no progress /);
  });

  it("does not flag a stall before the threshold", () => {
    const now = Date.parse("2026-10-07T13:02:59.000Z");
    const pipeline = snap({}, { lastProgressAt: "2026-10-07T13:00:00.000Z" });
    expect(integrationPipelineStalled(pipeline, now, DEFAULT_INTEGRATION_STALL_MS)).toBe(false);
  });

  it("does not flag a stall when the upload heartbeat is recent, even past 3 minutes (#0782)", () => {
    // Models #0777: the bundle upload took 228s with no stage change, but
    // the upload heartbeat kept lastProgressAt fresh every few seconds.
    const now = Date.parse("2026-10-07T13:05:00.000Z");
    const pipeline = snap(
      {},
      {
        stage: "check",
        startedAt: "2026-10-07T13:00:00.000Z",
        lastProgressAt: "2026-10-07T13:04:58.000Z",
        detail: "uploading bundle 27 MB · 225s",
      },
    );
    expect(integrationPipelineStalled(pipeline, now)).toBe(false);
    const copy = integrationActiveCopy(pipeline, now);
    expect(copy.stalled).toBe(false);
    expect(copy.label).toContain("uploading bundle 27 MB · 225s");
  });

  it("shows upload progress instead of the bare stage while it moves (#0782)", () => {
    const now = Date.parse("2026-10-07T13:02:00.000Z");
    const pipeline = snap(
      {},
      {
        stage: "check",
        startedAt: "2026-10-07T13:00:00.000Z",
        lastProgressAt: "2026-10-07T13:01:58.000Z",
        detail: "uploading bundle 27 MB · 45s",
      },
    );
    const copy = integrationActiveCopy(pipeline, now);
    expect(copy.stalled).toBe(false);
    expect(copy.label).toMatch(/^integrating · uploading bundle 27 MB · 45s/);
  });
});

describe("integration median + countdown (#0814)", () => {
  it("uses the last 15 timed runs, ignoring untimed history", () => {
    // Newest first, 20 timed runs (1m 00s .. 20m 00s) plus two legacy rows.
    const outcomes: CloseOutOutcomeEvent[] = [];
    for (let i = 1; i <= 20; i++) outcomes.push(outcome(`t${i}`, i, i * 60_000));
    outcomes.push(outcome("legacy1", 30), outcome("legacy2", 31));

    const history = integrationMedianDuration(outcomes);
    // The newest 15 are 1m..15m; the 8th is 8m. Older runs are excluded.
    expect(history).toEqual({ medianMs: 8 * 60_000, count: 15 });
  });

  it("uses fewer runs when fewer have timing data, and says the count", () => {
    const outcomes = [
      outcome("a", 1, 60_000),
      outcome("b", 2, 120_000),
      outcome("c", 3, 300_000),
      outcome("legacy", 4),
    ];
    expect(integrationMedianDuration(outcomes)).toEqual({ medianMs: 120_000, count: 3 });
    expect(integrationMedianChip(outcomes)).toBe("Median 2m 00s · 3 runs");
    expect(integrationMedianTip(outcomes).split("\n")).toEqual([
      "Median 2m 00s · 3 runs",
      "Click to switch between elapsed time and a countdown",
    ]);
  });

  it("excludes failed and timed-out runs from the median (#0819)", () => {
    const outcomes: CloseOutOutcomeEvent[] = [
      outcome("ok1", 1, 60_000),
      { ...outcome("bad1", 2, 30_000), outcome: "failed" },
      { ...outcome("bad2", 3, 20_000), outcome: "timedOut" },
      outcome("ok2", 4, 180_000),
      outcome("ok3", 5, 300_000),
    ];
    // Only the three succeeded runs count; the two failures are ignored even
    // though they recorded a duration.
    expect(integrationMedianDuration(outcomes)).toEqual({ medianMs: 180_000, count: 3 });
    expect(integrationMedianChip(outcomes)).toContain("3 runs");
  });

  it("has no median when nothing was timed", () => {
    expect(integrationMedianDuration([outcome("a", 1)])).toBeNull();
    expect(integrationMedianTip([])).toContain("No completed integrations with timing yet");
  });

  it("renders T-MM:SS counting down, and T+ when over the median", () => {
    expect(integrationCountdownLabel(26_000, 120_000)).toBe("T-01:34");
    expect(integrationCountdownLabel(125_000, 120_000)).toBe("T+00:05");
    expect(integrationCountdownLabel(0, 3_723_000)).toBe("T-1:02:03");
  });
});
