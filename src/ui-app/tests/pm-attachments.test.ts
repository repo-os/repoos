/**
 * PM chat attachments (0381): images sent with a PM chat message are parked
 * as a pending batch keyed to the session, then attached to whichever task
 * the PM creates while that session is running — the same `## Screenshots`
 * storage convention as every other upload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "../../core/repoos";
import {
  attachPendingPmImages,
  dropPmImages,
  queuePmImages,
  resetPmImages,
} from "../../server/pm-attachments";
import { patchTaskFile } from "../../server/write";
import { resolveScreenshot } from "../../server/attachments";

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SESSION = "pm-task-v2:0042::dev@example.com";

const roots: string[] = [];

afterEach(() => {
  resetPmImages();
  vi.useRealTimers();
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-pm-att-"));
  roots.push(root);
  return createRepoOS(root);
}

/** A task with a conventional body — Activity last, as the writer invariants assume. */
function taskWithBody(repoos: ReturnType<typeof createRepoOS>, title: string) {
  return repoos.createTask({
    title,
    body: `## Problem\n\n${title}.\n\n## Activity\n\n- 2026-09-17T00:00:00Z · created · test`,
  });
}

describe("queuePmImages", () => {
  it("rejects unsupported types and empty payloads without queueing", () => {
    const { config } = fixture();
    const r = queuePmImages(config, SESSION, [
      { name: "a.txt", mime: "text/plain", data: PNG_1PX },
      { name: "b.svg", mime: "image/svg+xml", data: PNG_1PX },
      { name: "c.png", mime: "image/png", data: "" },
    ]);
    expect(r.batchId).toBeNull();
    expect(r.queued).toBe(0);
    expect(r.errors).toHaveLength(3);
  });

  it("queues the valid images of a mixed batch", () => {
    const { config } = fixture();
    const r = queuePmImages(config, SESSION, [
      { name: "good.png", mime: "image/png", data: PNG_1PX },
      { name: "bad.txt", mime: "text/plain", data: "x" },
    ]);
    expect(r.batchId).not.toBeNull();
    expect(r.queued).toBe(1);
    expect(r.errors).toHaveLength(1);
    dropPmImages(r.batchId);
  });
});

describe("attachPendingPmImages", () => {
  it("attaches a running session's batch to the created task", () => {
    const repoos = fixture();
    const task = taskWithBody(repoos, "spawned from chat");
    const q = queuePmImages(repoos.config, SESSION, [
      { name: "shot-one.png", mime: "image/png", data: PNG_1PX },
      { name: "shot-two.png", mime: "image/png", data: PNG_1PX },
    ]);
    expect(q.queued).toBe(2);

    const updated = attachPendingPmImages(repoos.config, task, (key) => key === SESSION);
    expect(updated).not.toBeNull();
    expect(updated!.body).toContain("## Screenshots");
    expect(updated!.body).toContain(
      `![shot-one](/api/tasks/${task.id}/attachments/screenshot-1.png)`,
    );
    expect(updated!.body).toContain(
      `![shot-two](/api/tasks/${task.id}/attachments/screenshot-2.png)`,
    );
    // Screenshots stay before the append-only Activity section.
    expect(updated!.body.indexOf("## Screenshots")).toBeLessThan(
      updated!.body.indexOf("## Activity"),
    );
    // Files landed in the task's own attachment folder, bytes intact.
    const abs1 = resolveScreenshot(repoos.config, task.id, "screenshot-1.png");
    expect(abs1).not.toBeNull();
    expect(readFileSync(abs1!)).toEqual(Buffer.from(PNG_1PX, "base64"));
    expect(resolveScreenshot(repoos.config, task.id, "screenshot-2.png")).not.toBeNull();
    // The batch is consumed — a second attach finds nothing.
    expect(attachPendingPmImages(repoos.config, task, () => true)).toBeNull();
  });

  it("merges into an existing Screenshots section instead of stacking headings", () => {
    const repoos = fixture();
    const task = taskWithBody(repoos, "already has one");
    patchTaskFile(repoos.config, task.absPath, {
      addScreenshot: {
        id: "1",
        name: "existing.png",
        path: `work/.attachments/${task.id}/screenshot-1.png`,
        url: `/api/tasks/${task.id}/attachments/screenshot-1.png`,
        size: 70,
        mime: "image/png",
      },
    });
    queuePmImages(repoos.config, SESSION, [{ name: "new.png", mime: "image/png", data: PNG_1PX }]);
    const updated = attachPendingPmImages(repoos.config, task, () => true);
    expect(updated!.body).toContain("![existing.png](/api/tasks/");
    expect(updated!.body).toContain("![new](/api/tasks/");
    // Exactly one Screenshots heading, both images inside it.
    expect(updated!.body.match(/## Screenshots/g)).toHaveLength(1);
    expect(resolveScreenshot(repoos.config, task.id, "screenshot-1.png")).not.toBeNull();
  });

  it("keeps the batch pending when no matching session is running", () => {
    const repoos = fixture();
    const task = taskWithBody(repoos, "no attach yet");
    queuePmImages(repoos.config, SESSION, [{ name: "w.png", mime: "image/png", data: PNG_1PX }]);
    expect(attachPendingPmImages(repoos.config, task, () => false)).toBeNull();
    expect(readFileSync(task.absPath, "utf8").includes("## Screenshots")).toBe(false);
    // The same batch still attaches once the session runs.
    const updated = attachPendingPmImages(repoos.config, task, () => true);
    expect(updated).not.toBeNull();
    expect(updated!.body).toContain("## Screenshots");
  });

  it("expires unclaimed batches after the TTL", () => {
    vi.useFakeTimers();
    const repoos = fixture();
    const task = taskWithBody(repoos, "never claimed");
    queuePmImages(repoos.config, SESSION, [{ name: "w.png", mime: "image/png", data: PNG_1PX }]);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(attachPendingPmImages(repoos.config, task, () => true)).toBeNull();
    expect(readFileSync(task.absPath, "utf8").includes("## Screenshots")).toBe(false);
  });
});
