/**
 * #0782 — the integration snapshot carries in-stage upload detail.
 *
 * A slow bundle upload reports progress every few seconds; the snapshot must
 * surface that detail on the active job (so the card shows the upload moving)
 * while leaving other jobs and the no-detail case untouched.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { createJobCoordinator } from "../../server/integration-job.js";
import { applyPipelineDetail, buildIntegrationSnapshot } from "../../server/integration-status.js";
import { formatUploadBytes } from "../../server/integration-orchestrator.js";

function makeCoordinator(): { root: string; coordinator: ReturnType<typeof createJobCoordinator> } {
  const root = mkdtempSync(join(tmpdir(), "repoos-0782-snap-"));
  const coordinator = createJobCoordinator(root);
  return { root, coordinator };
}

describe("integration snapshot upload detail (#0782)", () => {
  it("is null when no upload progress was reported", () => {
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      const snap = buildIntegrationSnapshot(coordinator, {});
      expect(snap.active?.taskId).toBe("0001");
      expect(snap.active?.detail).toBeNull();
    } finally {
      rmFixture(root);
    }
  });

  it("surfaces the active job's upload detail", () => {
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      const snap = buildIntegrationSnapshot(
        coordinator,
        {},
        undefined,
        { "0001": "2026-10-14T10:00:00.000Z" },
        { "0001": "uploading bundle 27 MB · 45s" },
      );
      expect(snap.active?.taskId).toBe("0001");
      expect(snap.active?.detail).toBe("uploading bundle 27 MB · 45s");
    } finally {
      rmFixture(root);
    }
  });

  it("does not leak one job's detail onto another job", () => {
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      coordinator.updateJob("0001", { enqueuedAt: "2026-01-01T00:00:00.000Z" });
      coordinator.enqueue({ id: "0002", branch: "feat/t2" } as never);
      coordinator.updateJob("0002", { enqueuedAt: "2026-01-01T00:00:01.000Z" });
      const snap = buildIntegrationSnapshot(
        coordinator,
        {},
        undefined,
        {},
        { "0002": "uploading bundle 1 MB · 5s" },
      );
      expect(snap.active?.taskId).toBe("0001");
      expect(snap.active?.detail).toBeNull();
    } finally {
      rmFixture(root);
    }
  });
});

describe("formatUploadBytes (#0782)", () => {
  it("formats the upload detail sizes", () => {
    expect(formatUploadBytes(512)).toBe("512 B");
    expect(formatUploadBytes(27 * 1024 * 1024)).toBe("27 MB");
    expect(formatUploadBytes(1500)).toBe("1.5 KB");
    expect(formatUploadBytes(-1)).toBe("unknown");
  });
});

describe("applyPipelineDetail (#0782 review)", () => {
  it("sets the detail and refreshes the stall timer", () => {
    const detail: Record<string, string> = {};
    const at: Record<string, string> = { "0001": "2026-10-14T10:00:00.000Z" };
    applyPipelineDetail(
      detail,
      at,
      "0001",
      "uploading bundle 27 MB · 45s",
      "2026-10-14T10:00:45.000Z",
    );
    expect(detail["0001"]).toBe("uploading bundle 27 MB · 45s");
    expect(at["0001"]).toBe("2026-10-14T10:00:45.000Z");
  });

  it("clears the detail when the transfer lands, leaving the timer alone", () => {
    const detail: Record<string, string> = { "0001": "uploading bundle 27 MB · 45s" };
    const at: Record<string, string> = { "0001": "2026-10-14T10:00:45.000Z" };
    applyPipelineDetail(detail, at, "0001", null);
    expect("0001" in detail).toBe(false);
    expect(at["0001"]).toBe("2026-10-14T10:00:45.000Z");
    // And the snapshot no longer carries the line.
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      const snap = buildIntegrationSnapshot(coordinator, {}, undefined, at, detail);
      expect(snap.active?.detail).toBeNull();
    } finally {
      rmFixture(root);
    }
  });
});

describe("integration snapshot phase + queue detail (#0897)", () => {
  it("shows the active phase's elapsed time and why each queued job waits", () => {
    const { root, coordinator } = makeCoordinator();
    try {
      coordinator.enqueue({ id: "0892", branch: "feat/a" } as never);
      coordinator.updateJob("0892", {
        phase: "validating",
        enqueuedAt: "2026-10-21T12:00:00.000Z",
      });
      // Pin the phase start independently of the real clock for a stable assertion.
      coordinator.updateJob("0892", { phaseStartedAt: "2026-10-21T12:10:00.000Z" });
      coordinator.enqueue({ id: "0897", branch: "feat/b" } as never);
      coordinator.updateJob("0897", { enqueuedAt: "2026-10-21T12:08:00.000Z" });

      const snap = buildIntegrationSnapshot(
        coordinator,
        {},
        undefined,
        {},
        {},
        "2026-10-21T12:16:00.000Z",
      );
      expect(snap.active).toMatchObject({
        taskId: "0892",
        phase: "validating",
        phaseStartedAt: "2026-10-21T12:10:00.000Z",
        phaseElapsedMs: 6 * 60_000,
      });
      expect(snap.active?.phaseTimings?.map((t) => t.phase)).toEqual(["queued", "validating"]);
      expect(snap.queueDetail).toEqual([
        {
          taskId: "0897",
          position: 1,
          enqueuedAt: "2026-10-21T12:08:00.000Z",
          waitedMs: 8 * 60_000,
          blockerTaskId: "0892",
          blockerPhase: "validating",
          blockerElapsedMs: 16 * 60_000,
        },
      ]);
    } finally {
      rmFixture(root);
    }
  });
});
