import { describe, expect, it } from "vitest";
import {
  integrationActiveCopy,
  integrationPipelineStalled,
} from "../src/lib/integration-pipeline-ui";
import { closeOutAttemptStartedAt } from "../src/lib/closeOutAttempt";

/** A snapshot with one active close-out and one publisher parked behind it (#1275). */
function snapshot(parkedPhase: string) {
  const old = "2026-11-20T00:00:00.000Z";
  return {
    empty: false,
    active: {
      taskId: "0001",
      stage: "check",
      failed: false,
      startedAt: old,
      lastProgressAt: old,
      detail: null,
    },
    parallel: [
      {
        taskId: "0002",
        phase: parkedPhase,
        stage: "done",
        startedAt: old,
        detail: null,
      },
    ],
    queue: [],
    at: old,
  } as never;
}

const threeMinutesLater = Date.parse("2026-11-20T00:03:00.000Z");

describe("parked and parallel close-outs in the pipeline UI (#1275)", () => {
  it("does not call a publisher parked for its turn stalled", () => {
    expect(
      integrationPipelineStalled(snapshot("publishing"), threeMinutesLater, undefined, "0002"),
    ).toBe(false);
  });

  it("still calls a job that is validating alongside the active one stalled once it goes quiet", () => {
    expect(
      integrationPipelineStalled(snapshot("validating"), threeMinutesLater, undefined, "0002"),
    ).toBe(true);
  });

  it("reports the start of a job validating alongside the active close-out", () => {
    expect(closeOutAttemptStartedAt("0002", snapshot("validating"))).toBe(
      "2026-11-20T00:00:00.000Z",
    );
  });

  it("the card and drawer copy for a parked publisher is not labelled stalled (#1275 review)", () => {
    const copy = integrationActiveCopy(
      snapshot("publishing"),
      threeMinutesLater,
      undefined,
      "0002",
    );
    expect(copy.stalled).toBe(false);
    expect(copy.label).toBe("validated · waiting for its publish turn");
    expect(copy.label).not.toMatch(/stalled/i);
    // A parallel job that is still validating is judged by its own timer as before.
    const validating = integrationActiveCopy(
      snapshot("validating"),
      threeMinutesLater,
      undefined,
      "0002",
    );
    expect(validating.label).not.toBe("validated · waiting for its publish turn");
  });
});
