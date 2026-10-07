import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTEGRATION_STALL_MS,
  integrationActiveCopy,
  integrationPipelineStalled,
  integrationQueuedCopy,
} from "../src/lib/integration-pipeline-ui";
import type { IntegrationPipelineSnapshot } from "../src/types";

function snap(
  over: Partial<IntegrationPipelineSnapshot> & {
    active?: Partial<NonNullable<IntegrationPipelineSnapshot["active"]>>;
  } = {},
): IntegrationPipelineSnapshot {
  const baseActive = over.active
    ? {
        taskId: "0730",
        stage: null as string | null,
        failed: false,
        startedAt: "2026-10-07T13:00:00.000Z",
        lastProgressAt: "2026-10-07T13:00:00.000Z",
        ...over.active,
      }
    : null;
  return {
    empty: false,
    active: baseActive,
    queue: [],
    at: "2026-10-07T13:00:00.000Z",
    ...over,
    active: baseActive,
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
    const pipeline = snap({
      active: { taskId: "0730", stage: "check" },
      queue: ["0720", "0712"],
    });
    const queued = integrationQueuedCopy(pipeline, "0720");
    expect(queued?.label).toBe("queued #1 (behind #0730)");
  });

  it("flags a stall after the default threshold with no progress", () => {
    const now = Date.parse("2026-10-07T13:04:01.000Z");
    const pipeline = snap({
      active: {
        lastProgressAt: "2026-10-07T13:00:00.000Z",
        startedAt: "2026-10-07T13:00:00.000Z",
      },
    });
    expect(integrationPipelineStalled(pipeline, now)).toBe(true);
    const copy = integrationActiveCopy(pipeline, now);
    expect(copy.stalled).toBe(true);
    expect(copy.label).toMatch(/^stalled · no progress /);
  });

  it("does not flag a stall before the threshold", () => {
    const now = Date.parse("2026-10-07T13:02:59.000Z");
    const pipeline = snap({
      active: {
        lastProgressAt: "2026-10-07T13:00:00.000Z",
      },
    });
    expect(integrationPipelineStalled(pipeline, now, DEFAULT_INTEGRATION_STALL_MS)).toBe(false);
  });
});
