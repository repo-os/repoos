import { describe, expect, it } from "vitest";
import {
  closeOutAttemptStartedAt,
  isStaleDoneError,
} from "../src/lib/closeOutAttempt";
import type { IntegrationPipelineSnapshot } from "../src/types";

describe("closeOutAttempt", () => {
  it("reads active startedAt and queued enqueue times from the pipeline snapshot", () => {
    const snap: IntegrationPipelineSnapshot = {
      empty: false,
      active: {
        taskId: "0001",
        stage: "check",
        failed: false,
        startedAt: "2026-09-20T12:00:00.000Z",
      },
      queue: ["0002"],
      queueEnqueuedAt: { "0002": "2026-09-20T11:55:00.000Z" },
      at: "2026-09-20T12:01:00.000Z",
    };
    expect(closeOutAttemptStartedAt("0001", snap)).toBe("2026-09-20T12:00:00.000Z");
    expect(closeOutAttemptStartedAt("0002", snap)).toBe("2026-09-20T11:55:00.000Z");
    expect(closeOutAttemptStartedAt("0099", snap)).toBeNull();
  });

  it("treats failures before the attempt start as stale", () => {
    expect(isStaleDoneError("2026-09-20T10:00:00.000Z", "2026-09-20T12:00:00.000Z")).toBe(
      true,
    );
    expect(isStaleDoneError("2026-09-20T12:00:00.000Z", "2026-09-20T12:00:00.000Z")).toBe(
      false,
    );
    expect(isStaleDoneError(undefined, "2026-09-20T12:00:00.000Z")).toBe(false);
  });
});
