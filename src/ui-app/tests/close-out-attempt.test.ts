import { describe, expect, it } from "vitest";
import {
  closeOutAttemptStartedAt,
  closeOutFailureCutoff,
  isStaleDoneError,
} from "../src/lib/closeOutAttempt";
import type { IntegrationPipelineSnapshot } from "../src/types";

describe("closeOutAttempt (#1272)", () => {
  it("the timer reads only the validating start of the active job", () => {
    const snap: IntegrationPipelineSnapshot = {
      empty: false,
      active: {
        taskId: "0001",
        stage: "check",
        failed: false,
        startedAt: "2026-09-20T12:00:00.000Z",
        lastProgressAt: "2026-09-20T12:00:00.000Z",
      },
      queue: ["0002"],
      queueEnqueuedAt: { "0002": "2026-09-20T11:55:00.000Z" },
      at: "2026-09-20T12:01:00.000Z",
    };
    expect(closeOutAttemptStartedAt("0001", snap)).toBe("2026-09-20T12:00:00.000Z");
    // A queued task never gets a timer, even though it has an enqueue time.
    expect(closeOutAttemptStartedAt("0002", snap)).toBeNull();
    expect(closeOutAttemptStartedAt("0099", snap)).toBeNull();
  });

  it("a queued task's failure cutoff is its enqueue time, falling back to the pipeline tick (#0741)", () => {
    const withEnqueue: IntegrationPipelineSnapshot = {
      empty: false,
      active: {
        taskId: "0001",
        stage: "merge",
        failed: false,
        startedAt: "2026-09-20T12:00:00.000Z",
        lastProgressAt: "2026-09-20T12:00:00.000Z",
      },
      queue: ["0002"],
      queueEnqueuedAt: { "0002": "2026-09-20T11:55:00.000Z" },
      at: "2026-09-20T12:05:00.000Z",
    };
    expect(closeOutFailureCutoff("0002", withEnqueue)).toBe("2026-09-20T11:55:00.000Z");

    const olderSnapshot: IntegrationPipelineSnapshot = {
      ...withEnqueue,
      queueEnqueuedAt: undefined,
    };
    expect(closeOutFailureCutoff("0002", olderSnapshot)).toBe("2026-09-20T12:05:00.000Z");
    expect(
      isStaleDoneError("2026-09-20T10:00:00.000Z", closeOutFailureCutoff("0002", olderSnapshot)),
    ).toBe(true);
  });

  it("a validating task's failure cutoff is its own start, not its enqueue time", () => {
    const snap: IntegrationPipelineSnapshot = {
      empty: false,
      active: {
        taskId: "0001",
        stage: "check",
        failed: false,
        startedAt: "2026-09-20T12:00:00.000Z",
        lastProgressAt: "2026-09-20T12:00:00.000Z",
      },
      queue: [],
      queueEnqueuedAt: { "0001": "2026-09-20T11:00:00.000Z" },
      at: "2026-09-20T12:01:00.000Z",
    };
    expect(closeOutFailureCutoff("0001", snap)).toBe("2026-09-20T12:00:00.000Z");
  });

  it("treats failures before the attempt start as stale", () => {
    expect(isStaleDoneError("2026-09-20T10:00:00.000Z", "2026-09-20T12:00:00.000Z")).toBe(true);
    expect(isStaleDoneError("2026-09-20T12:00:00.000Z", "2026-09-20T12:00:00.000Z")).toBe(false);
    expect(isStaleDoneError(undefined, "2026-09-20T12:00:00.000Z")).toBe(false);
  });
});
