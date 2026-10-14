import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTEGRATION_STALL_MS,
  integrationActiveCopy,
  integrationPipelineStalled,
  integrationQueuedCopy,
} from "../src/lib/integration-pipeline-ui";
import type { IntegrationPipelineSnapshot } from "../src/types";

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
