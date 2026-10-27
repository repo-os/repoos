import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types.js";
import type { LiveIndex } from "../../server/live-index.js";
import { ReviewManager } from "../../server/review.js";
import { closeGitWorker, getGitWorker } from "../../server/git-worker.js";

// A delayed worker response must not expose a finished review before its
// report/counters are persisted. Exercise both normal and adopted completion
// hooks, including failure and duplicate process-exit notifications.
describe("review completion fence", () => {
  it.each([
    ["run", false],
    ["run", true],
    ["chat", false],
    ["chat", true],
  ] as const)("keeps %s running through finalization (failure=%s)", async (kind, fail) => {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-completion-"));
    const config = {
      root,
      cacheDir: ".repoos",
      agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
    } as RepoOSConfig;
    const task = { id: "0001", status: "review" } as Task;
    const index = { getTask: () => task } as unknown as LiveIndex;
    const reviews = new ReviewManager(config, () => {}, undefined, index);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const internal = reviews as unknown as {
      finalizeRun: () => Promise<void>;
      finalizeChat: () => Promise<void>;
      afterCompletion: (id: string, callback: () => void) => void;
    };
    let stored = false;
    const followup = vi.fn(() => ({ stored, running: reviews.isRunning("0001") }));
    const finalize = vi
      .spyOn(internal, kind === "run" ? "finalizeRun" : "finalizeChat")
      .mockImplementation(async () => {
        await gate;
        if (fail) throw new Error("worker failed");
        internal.afterCompletion("0001", followup);
        stored = true;
      });
    try {
      const completion = reviews.handleReviewDone("review:0001", true, kind);
      expect(reviews.handleReviewDone("review:0001", true, kind)).toBe(completion);
      // No Run is registered: this also tests a review adopted after reload.
      expect(reviews.isRunning("0001")).toBe(true);
      expect(reviews.runningCount()).toBe(1);
      await Promise.resolve();
      expect(finalize).toHaveBeenCalledOnce();
      expect(stored).toBe(false);
      expect(reviews.isRunning("0001")).toBe(true);
      release();
      if (fail) await expect(completion).rejects.toThrow("worker failed");
      else await completion;
      expect(stored).toBe(!fail);
      expect(reviews.isRunning("0001")).toBe(false);
      expect(reviews.runningCount()).toBe(0);
      await Promise.resolve();
      expect(followup).toHaveBeenCalledTimes(fail ? 0 : 1);
      if (!fail) expect(followup.mock.results[0]?.value).toEqual({ stored: true, running: false });
    } finally {
      release();
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("review preparation fence", () => {
  it.each(["run", "checkpoint", "chat"] as const)(
    "reserves %s before worker reads, rejecting duplicate starts",
    async (kind) => {
      const root = mkdtempSync(join(tmpdir(), "repoos-review-start-"));
      const config = {
        root,
        cacheDir: ".repoos",
        agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
      } as RepoOSConfig;
      const task = { id: "0001", status: "review", branch: "feat/test" } as Task;
      const reviews = new ReviewManager(config, () => {});
      let release!: () => void;
      const gate = new Promise<null>((resolve) => {
        release = () => resolve(null);
      });
      const worker = getGitWorker(root);
      vi.spyOn(worker, "worktreePath").mockReturnValue(gate);
      vi.spyOn(worker, "runGit").mockResolvedValue({ status: 1, stdout: "", stderr: "" });
      vi.spyOn(worker, "currentBranch").mockResolvedValue("main");
      const start = () =>
        kind === "run"
          ? reviews.run(task, { manual: true })
          : kind === "checkpoint"
            ? reviews.runCheckpointDelta(task, "abc123")
            : reviews.send(task, "Please check");
      try {
        const pending = start();
        expect(reviews.isRunning(task.id)).toBe(true);
        expect(reviews.runningCount()).toBe(1);
        expect(await start()).toMatchObject({
          ok: false,
          reason: "a review is already running for this task",
        });
        reviews.cancel(task.id);
        release();
        expect(await pending).toMatchObject({ ok: false });
        expect(reviews.isRunning(task.id)).toBe(false);
        expect(reviews.runningCount()).toBe(0);
      } finally {
        release();
        vi.restoreAllMocks();
        closeGitWorker(root);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
