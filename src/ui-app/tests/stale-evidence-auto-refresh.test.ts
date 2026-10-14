import { afterEach, describe, expect, it } from "vitest";
import { ReviewManager } from "../../server/review.js";
import {
  endEvidenceRefresh,
  isEvidenceRefreshActive,
  withEvidenceRefreshLock,
} from "../../server/evidence-refresh-lock.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

afterEach(() => {
  endEvidenceRefresh("0766");
});

describe("automatic stale evidence refresh locking (#0766)", () => {
  it("withEvidenceRefreshLock blocks review while work is in flight", async () => {
    const config = {
      root: "/tmp",
      workDir: "work",
      cacheDir: ".repoos",
      agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
    } as RepoOSConfig;
    const task = { id: "0766", branch: "main" } as Task;
    const reviews = new ReviewManager(config, () => {});
    let release!: () => void;
    const work = withEvidenceRefreshLock(task.id, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(isEvidenceRefreshActive(task.id)).toBe(true);
    expect(reviews.canRun(task).ok).toBe(false);
    release();
    await expect(work).resolves.toEqual({ ok: true, value: true });
    expect(isEvidenceRefreshActive(task.id)).toBe(false);
  });
});
