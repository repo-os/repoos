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
import { buildIntegrationSnapshot } from "../../server/integration-status.js";
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
