import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTEGRATION_STALL_MS,
  integrationActiveCopy,
  integrationCountdownLabel,
  integrationEvidencePromptHidden,
  integrationMedianChip,
  integrationMedianDuration,
  integrationMedianTip,
  integrationPipelineRole,
  integrationPipelineStalled,
  integrationProgressCardLabel,
  integrationQueuePosition,
  integrationQueuedCopy,
  integrationRunningEntry,
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

describe("integrationEvidencePromptHidden (#1277)", () => {
  it("hides the stale-evidence prompt while queued or in any running phase", () => {
    expect(integrationEvidencePromptHidden(snap({ queue: ["0731"] }), "0731")).toBe(true);
    for (const phase of ["queued", "syncing", "validating", "publishing", "cleanup"]) {
      expect(integrationEvidencePromptHidden(snap({}, { phase }), "0730")).toBe(true);
    }
  });

  it("shows the prompt again once the job has failed, and for tasks not in the pipeline", () => {
    expect(
      integrationEvidencePromptHidden(snap({}, { phase: "validating", failed: true }), "0730"),
    ).toBe(false);
    expect(integrationEvidencePromptHidden(snap({}, { phase: "validating" }), "0999")).toBe(false);
    expect(integrationEvidencePromptHidden(null, "0730")).toBe(false);
    expect(integrationEvidencePromptHidden(snap({ empty: true }), "0730")).toBe(false);
  });
});

describe("integration-pipeline-ui (#0740)", () => {
  it("renders integrating · starting… when the active job has no stage yet", () => {
    const now = Date.parse("2026-10-07T13:02:27.000Z");
    const copy = integrationActiveCopy(snap(), now);
    expect(copy.label).toBe("integrating · starting…");
    expect(copy.elapsedTip).toMatch(/Close-out running/);
    expect(copy.stalled).toBe(false);
  });

  it("keeps the recorded step ahead of generic detail and shows every attempt plus retry reason", () => {
    const now = Date.parse("2026-10-07T13:02:27.000Z");
    const pipeline = snap(
      {},
      {
        stage: "check",
        step: "queued for host slot",
        host: "runner-1",
        attempt: 2,
        detail: "remote validation",
        previousFailure: { attempt: 1, reason: "host timed out" },
      },
    );
    const copy = integrationActiveCopy(pipeline, now);
    expect(copy.label).toContain("queued for host slot");
    expect(copy.label).toContain("on runner-1");
    expect(copy.label).toContain("attempt 2");
    expect(copy.label).toContain("host timed out");
    expect(copy.label.indexOf("queued for host slot")).toBeLessThan(
      copy.label.indexOf("remote validation"),
    );

    const first = integrationActiveCopy(
      snap({}, { step: "building candidate", host: "local", attempt: 1 }),
      now,
    );
    expect(first.label).toContain("local · attempt 1");
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
    expect(copy.label).toMatch(/^integrating · check · uploading bundle 27 MB · 45s/);
  });

  it("puts stage and percent first on card labels (#0995 E1)", () => {
    const label =
      "integrating · uploading bundle to thinkpad · 88 MB / 204 MB (43%) · 3.7 MB/s · ~32s left · 4m 00s";
    const card = integrationProgressCardLabel(label);
    expect(card.indexOf("(43%)")).toBeLessThan(card.indexOf("3.7 MB/s"));
    expect(card.startsWith("integrating · uploading bundle to thinkpad · (43%)")).toBe(true);
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

  it("counts fifteen timed succeeded runs when failures and legacy rows are mixed (#0829)", () => {
    const outcomes: CloseOutOutcomeEvent[] = [];
    for (let i = 1; i <= 15; i++) outcomes.push(outcome(`timed-${i}`, i, i * 60_000));
    for (let i = 0; i < 5; i++) outcomes.push(outcome(`legacy-${i}`, 20 + i));
    outcomes.push({ ...outcome("failed", 30, 999_000), outcome: "failed" });
    outcomes.push({ ...outcome("timeout", 31, 888_000), outcome: "timedOut" });

    expect(integrationMedianChip(outcomes)).toBe("Median 8m 00s · 15 runs");
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

describe("parallel validations in the UI (#1275)", () => {
  const NOW = Date.parse("2026-10-07T13:02:27.000Z");
  const parallelJob = (
    taskId: string,
    over: Partial<NonNullable<IntegrationPipelineSnapshot["parallel"]>[number]> = {},
  ) => ({
    taskId,
    phase: "validating",
    stage: "merge",
    startedAt: "2026-10-07T13:00:00.000Z",
    lastProgressAt: "2026-10-07T13:00:00.000Z",
    detail: null,
    ...over,
  });

  it("a parallel job's copy shows its own stage and clock, not the head's", () => {
    const pipeline = snap(
      { parallel: [parallelJob("0731", { stage: "check" })] },
      { taskId: "0730", stage: "build" },
    );
    expect(integrationActiveCopy(pipeline, NOW).label).toBe("integrating · build");
    expect(integrationActiveCopy(pipeline, NOW, undefined, "0731").label).toBe(
      "integrating · check",
    );
  });

  it("stall for a parallel job is judged by its own progress, not the head's", () => {
    const pipeline = snap(
      { parallel: [parallelJob("0731", { lastProgressAt: "2026-10-07T12:55:00.000Z" })] },
      { lastProgressAt: "2026-10-07T13:02:00.000Z" },
    );
    expect(integrationPipelineStalled(pipeline, NOW)).toBe(false);
    expect(integrationPipelineStalled(pipeline, NOW, undefined, "0731")).toBe(true);
    expect(integrationActiveCopy(pipeline, NOW, undefined, "0731").stalled).toBe(true);
  });

  it("a validating job is running (active role), not queued", () => {
    const pipeline = snap({ parallel: [parallelJob("0731")] }, { taskId: "0730" });
    expect(integrationPipelineRole(pipeline, "0731")).toBe("active");
    expect(integrationRunningEntry(pipeline, "0731")?.stage).toBe("merge");
    expect(integrationRunningEntry(pipeline, "0999")).toBeNull();
  });

  // Fallback position (no queueDetail) counts every started job ahead, so a
  // queued task behind a parallel validation is not understated (#1275).
  const positionCases: Array<{
    name: string;
    over: Partial<IntegrationPipelineSnapshot>;
    active: boolean;
    expected: number;
  }> = [
    {
      name: "behind the head only",
      over: { queue: ["0740"] },
      active: true,
      expected: 1,
    },
    {
      name: "behind the head and one parallel validation",
      over: { queue: ["0740"], parallel: [parallelJob("0731")] },
      active: true,
      expected: 2,
    },
    {
      name: "no head: the first queued task is #1",
      over: { queue: ["0740", "0741"] },
      active: false,
      expected: 1,
    },
  ];
  it.each(positionCases)("queue position fallback: $name", ({ over, active, expected }) => {
    const pipeline = active ? snap(over, { taskId: "0730" }) : snap(over);
    if (!active) pipeline.active = null;
    expect(integrationQueuePosition(pipeline, "0740")?.position).toBe(expected);
  });
});
