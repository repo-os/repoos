import { describe, expect, it } from "vitest";
import {
  PIPELINE_MERGED_WINDOW_MS,
  formatPipelineElapsed,
  isPipelineVisible,
  pipelineSentBackCount,
  resolvePipelineCard,
  sortPipelineLanes,
  type PipelineTaskInput,
} from "./pipeline-view.js";

function base(over: Partial<PipelineTaskInput> = {}): PipelineTaskInput {
  return {
    id: "0001",
    status: "active",
    priority: "p2",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-04T10:00:00.000Z",
    releasedAt: null,
    running: true,
    queuedForAgent: false,
    handoffRequested: false,
    handoffFinalizing: false,
    checkRunning: false,
    checkQueued: false,
    checkProgress: null,
    reviewRunning: false,
    closeoutActive: false,
    closeoutQueued: false,
    closeoutStalled: false,
    stuck: false,
    needsInput: false,
    held: false,
    reviewPasses: 0,
    reviewRounds: 0,
    ...over,
  };
}

const NOW = Date.parse("2026-11-04T12:00:00.000Z");

describe("resolvePipelineCard", () => {
  it("maps a running engineer to Coding", () => {
    expect(resolvePipelineCard(base(), NOW)).toMatchObject({ stage: "coding", stepLabel: "Coding" });
  });

  it("maps an idle active task to Coding / Paused with dimming", () => {
    const m = resolvePipelineCard(base({ running: false }), NOW);
    expect(m).toMatchObject({ stage: "coding", state: "paused", stepLabel: "Paused", dimmed: true });
  });

  it("maps a queued agent start to Coding / Queued without pausing", () => {
    const m = resolvePipelineCard(base({ running: false, queuedForAgent: true }), NOW);
    expect(m).toMatchObject({ stage: "coding", state: "ok", stepLabel: "Queued", dimmed: false });
  });

  it("maps a running check to Checks with progress", () => {
    const m = resolvePipelineCard(
      base({ checkRunning: true, checkProgress: { done: 3, total: 5 } }),
      NOW,
    );
    expect(m).toMatchObject({ stage: "checks", stepLabel: "Running checks 3/5" });
  });

  it("maps a queued check to Checks", () => {
    const m = resolvePipelineCard(base({ checkQueued: true }), NOW);
    expect(m).toMatchObject({ stage: "checks", stepLabel: "Queued for checks" });
  });

  it("maps handoff finalization to Handoff, ahead of a running check", () => {
    const m = resolvePipelineCard(
      base({
        handoffFinalizing: true,
        checkRunning: true,
        checkProgress: { done: 2, total: 8 },
      }),
      NOW,
    );
    expect(m).toMatchObject({ stage: "handoff", stepLabel: "Confirming handoff 2/8" });
  });

  it("maps a requested review to Handoff", () => {
    const m = resolvePipelineCard(base({ running: false, handoffRequested: true }), NOW);
    expect(m).toMatchObject({ stage: "handoff", stepLabel: "Confirming handoff" });
  });

  it("maps an idle review task to Review", () => {
    const m = resolvePipelineCard(base({ status: "review", running: false }), NOW);
    expect(m).toMatchObject({ stage: "review", state: "ok", stepLabel: "In review" });
  });

  it("maps a running reviewer to Review with a live label", () => {
    const m = resolvePipelineCard(base({ status: "review", reviewRunning: true }), NOW);
    expect(m).toMatchObject({ stage: "review", stepLabel: "Reviewing…" });
  });

  it("maps an active close-out to Close-out / Merging", () => {
    const m = resolvePipelineCard(base({ status: "review", closeoutActive: true }), NOW);
    expect(m).toMatchObject({ stage: "closeout", stepLabel: "Merging" });
  });

  it("maps a queued close-out and a stalled one distinctly", () => {
    expect(resolvePipelineCard(base({ status: "review", closeoutQueued: true }), NOW)).toMatchObject(
      { stage: "closeout", stepLabel: "Queued for close-out" },
    );
    expect(
      resolvePipelineCard(base({ status: "review", closeoutActive: true, closeoutStalled: true }), NOW),
    ).toMatchObject({ stage: "closeout", stepLabel: "Close-out stalled" });
  });

  it("maps a recent done task to Merged", () => {
    const m = resolvePipelineCard(
      base({ status: "done", running: false, releasedAt: new Date(NOW - 60_000).toISOString() }),
      NOW,
    );
    expect(m).toMatchObject({ stage: "merged", state: "merged", stepLabel: "Merged" });
  });

  it("keeps a sent-back task in Coding with its bounce count", () => {
    const m = resolvePipelineCard(base({ reviewRounds: 2 }), NOW);
    expect(m).toMatchObject({ stage: "coding", sentBackCount: 2 });
  });

  it("counts a manual send-back with passes but no bounce counter once", () => {
    expect(pipelineSentBackCount(base({ reviewPasses: 1 }))).toBe(1);
    expect(pipelineSentBackCount(base({ status: "review", reviewPasses: 1 }))).toBe(0);
    expect(pipelineSentBackCount(base())).toBe(0);
  });

  it("layers stuck over the stage where the task stalled", () => {
    const m = resolvePipelineCard(base({ checkRunning: true, stuck: true }), NOW);
    expect(m).toMatchObject({ stage: "checks", state: "stuck", dimmed: false });
  });

  it("layers needs-input over the stage without dimming", () => {
    const m = resolvePipelineCard(
      base({ status: "review", running: false, needsInput: true }),
      NOW,
    );
    expect(m).toMatchObject({ stage: "review", state: "needs-input", dimmed: false });
  });

  it("keeps a held task in its stage, dimmed", () => {
    const m = resolvePipelineCard(
      base({ status: "review", running: false, held: true, reviewRunning: true }),
      NOW,
    );
    expect(m).toMatchObject({ stage: "review", state: "held", dimmed: true });
  });
});

describe("isPipelineVisible", () => {
  it("shows active and review tasks", () => {
    expect(isPipelineVisible(base(), NOW)).toBe(true);
    expect(isPipelineVisible(base({ status: "review" }), NOW)).toBe(true);
  });

  it("shows recently merged tasks, then drops them after the window", () => {
    const releasedAt = new Date(NOW - 60_000).toISOString();
    expect(isPipelineVisible(base({ status: "done", releasedAt }), NOW)).toBe(true);
    const stale = new Date(NOW - PIPELINE_MERGED_WINDOW_MS - 1000).toISOString();
    expect(isPipelineVisible(base({ status: "done", releasedAt: stale }), NOW)).toBe(false);
  });

  it("falls back to updated_at when releasedAt is missing", () => {
    expect(
      isPipelineVisible(base({ status: "done", updatedAt: new Date(NOW - 1000).toISOString() }), NOW),
    ).toBe(true);
    expect(isPipelineVisible(base({ status: "done", updatedAt: null }), NOW)).toBe(false);
  });
});

describe("sortPipelineLanes", () => {
  it("orders by priority, then longest in flight first", () => {
    const lanes = sortPipelineLanes([
      base({ id: "0003", priority: "p1", createdAt: "2026-11-03T10:00:00.000Z" }),
      base({ id: "0001", priority: "p2", createdAt: "2026-11-01T10:00:00.000Z" }),
      base({ id: "0002", priority: "p1", createdAt: "2026-11-01T10:00:00.000Z" }),
    ]);
    expect(lanes.map((l) => l.id)).toEqual(["0002", "0003", "0001"]);
  });
});

describe("formatPipelineElapsed", () => {
  it("formats compact durations without percentages", () => {
    expect(formatPipelineElapsed(new Date(NOW - 5000).toISOString(), NOW)).toBe("just now");
    expect(formatPipelineElapsed(new Date(NOW - 45_000).toISOString(), NOW)).toBe("45s");
    expect(formatPipelineElapsed(new Date(NOW - 12 * 60_000).toISOString(), NOW)).toBe("12m");
    expect(formatPipelineElapsed(new Date(NOW - 3 * 3600_000).toISOString(), NOW)).toBe("3h");
    expect(formatPipelineElapsed(null, NOW)).toBe("—");
  });
});
