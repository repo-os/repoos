/**
 * #0799 — long close-out stages must heartbeat so a healthy run is not shown
 * as "stalled · no progress".
 *
 * #0782 covered the bundle upload. The remote test run and each local gate step
 * report nothing while they run, and the stall timer only resets on stage
 * progress, so a quiet-but-working run was labelled stalled. These tests cover
 * the heartbeat helper, the `repoos check` step parser, and — end to end through
 * the server read-model and the card copy — that a heartbeating remote run is
 * live while a truly stopped job is still flagged stalled.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { createJobCoordinator } from "../../server/integration-job.js";
import { applyPipelineDetail, buildIntegrationSnapshot } from "../../server/integration-status.js";
import type { IntegrationPipelineSnapshot } from "../src/types";
import {
  parseCheckStepHeading,
  startStageHeartbeat,
} from "../../server/integration-orchestrator.js";
import {
  DEFAULT_INTEGRATION_STALL_MS,
  integrationActiveCopy,
  integrationPipelineStalled,
} from "../src/lib/integration-pipeline-ui";

afterEach(() => {
  vi.useRealTimers();
});

describe("startStageHeartbeat (#0799)", () => {
  it("fires on a steady interval and stops when told", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const stop = startStageHeartbeat(
      (d) => events.push(d),
      () => "remote tests",
      100,
    );
    vi.advanceTimersByTime(350);
    expect(events).toEqual(["remote tests", "remote tests", "remote tests"]);
    stop();
    vi.advanceTimersByTime(500);
    expect(events).toHaveLength(3);
  });

  it("skips a tick when the label is null (upload heartbeat owns the line)", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    let label: string | null = null;
    const stop = startStageHeartbeat(
      (d) => events.push(d),
      () => label,
      100,
    );
    vi.advanceTimersByTime(250);
    expect(events).toEqual([]);
    label = "remote tests";
    vi.advanceTimersByTime(100);
    expect(events).toEqual(["remote tests"]);
    stop();
  });

  it("reports the current local gate step as it changes", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    let step = "running check";
    const stop = startStageHeartbeat(
      (d) => events.push(d),
      () => step,
      100,
    );
    vi.advanceTimersByTime(100);
    step = "format & lint";
    vi.advanceTimersByTime(100);
    expect(events).toEqual(["running check", "format & lint"]);
    stop();
  });
});

describe("parseCheckStepHeading (#0799)", () => {
  it("extracts the last `◆ <name>` step heading, stripping ANSI colour", () => {
    const chunk = "\n  \u001b[36m\u001b[1m◆ format & lint\u001b[22m\u001b[39m\n  ✔ oxfmt\n";
    expect(parseCheckStepHeading(chunk)).toBe("format & lint");
  });

  it("takes the latest heading when a chunk carries more than one", () => {
    const chunk = "  ◆ build\n  ◆ test suite\n";
    expect(parseCheckStepHeading(chunk)).toBe("test suite");
  });

  it("returns null when there is no heading", () => {
    expect(parseCheckStepHeading("just some output\n")).toBeNull();
  });
});

function makeCoordinator(): {
  root: string;
  coordinator: ReturnType<typeof createJobCoordinator>;
} {
  const root = mkdtempSync(join(tmpdir(), "repoos-0799-"));
  const coordinator = createJobCoordinator(root);
  return { root, coordinator };
}

/** The card copy for a job that started 5 minutes ago with the given detail. */
function cardFor(
  coordinator: ReturnType<typeof createJobCoordinator>,
  detail: Record<string, string>,
  reportedAt: Record<string, string>,
  nowIso: string,
) {
  const serverSnap = buildIntegrationSnapshot(
    coordinator,
    {},
    undefined,
    reportedAt,
    detail,
    nowIso,
  );
  // The SSE payload carries this exact shape; the UI type narrows `stage` to
  // the pipeline union, so bridge it for the card-copy assertions.
  const snap = serverSnap as unknown as IntegrationPipelineSnapshot;
  const now = Date.parse(nowIso);
  return {
    snap,
    copy: integrationActiveCopy(snap, now),
    stalled: integrationPipelineStalled(snap, now),
  };
}

describe("a remote test run stays live past the stall threshold (#0799)", () => {
  it("is NOT labelled stalled when heartbeats keep arriving", () => {
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      coordinator.updateJob("0001", { phase: "validating", startedAt: "2026-10-15T10:00:00.000Z" });

      // The test run has produced no output since it started 5 minutes ago,
      // but a heartbeat landed a moment ago (the stage keeps beating).
      const detail: Record<string, string> = {};
      const at: Record<string, string> = {};
      applyPipelineDetail(detail, at, "0001", "remote tests", "2026-10-15T10:04:58.000Z");

      const { copy, stalled } = cardFor(coordinator, detail, at, "2026-10-15T10:05:00.000Z");
      expect(stalled).toBe(false);
      expect(copy.stalled).toBe(false);
      expect(copy.label).toContain("remote tests");
      // 5 minutes is well past the default stall window.
      expect(5 * 60 * 1000).toBeGreaterThan(DEFAULT_INTEGRATION_STALL_MS);
    } finally {
      rmFixture(root);
    }
  });

  it("IS labelled stalled when heartbeats stop (a truly stopped process)", () => {
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      coordinator.updateJob("0001", {
        phase: "validating",
        startedAt: "2026-10-15T10:00:00.000Z",
      });

      // No heartbeat, no stage progress — the last progress is the start time.
      const { copy, stalled } = cardFor(coordinator, {}, {}, "2026-10-15T10:05:00.000Z");
      expect(stalled).toBe(true);
      expect(copy.stalled).toBe(true);
      expect(copy.label).toMatch(/^stalled · no progress /);
    } finally {
      rmFixture(root);
    }
  });
});
