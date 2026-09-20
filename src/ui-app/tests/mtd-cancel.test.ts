/**
 * #0459 — Stop MTD: cancelling an in-flight close-out.
 *
 * A job marked cancelled must be dropped cooperatively by the orchestrator:
 * the throwaway `repoos/integrate/<id>` candidate is torn down, the job record
 * is removed (so the task leaves `inPipeline`), and — crucially — the task's
 * own feature branch/worktree is never touched, so a later "Move to done"
 * resumes from intact work.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree, worktreePathForBranch } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator, CANCEL_REASON } from "../../server/integration-orchestrator.js";
import { buildIntegrationSnapshot } from "../../server/integration-status.js";
import { cancelDone } from "../../server/routes/tasks.js";
import type { RepoOSConfig } from "../../core/types";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commitFile(dir: string, name: string, content: string, msg: string): void {
  const full = join(dir, name);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-cancel-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

function makeOrchestrator(root: string) {
  const config = {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  } as RepoOSConfig;
  const coordinator = createJobCoordinator(root);
  const orch = new CloseOutOrchestrator(config, coordinator);
  return { orch, coordinator };
}

describe("Stop MTD cancellation (#0459)", () => {
  it("drops a cancelled job and leaves the feature branch/worktree intact", async () => {
    const { root, clean } = makeRepo();
    try {
      const featureWt = ensureWorktree(root, "feat/t1").path!;
      commitFile(featureWt, "src/new.ts", "export const n = 1;\n", "feature work");

      const { orch, coordinator } = makeOrchestrator(root);
      coordinator.enqueue({ id: "0001", branch: "feat/t1" } as never);
      coordinator.requestCancel("0001");

      const res = await orch.processNext();

      expect(res.ok).toBe(false);
      expect(res.reason).toBe(CANCEL_REASON);
      // Job record is gone, so the task is no longer `inPipeline`.
      expect(coordinator.getJob("0001")).toBeNull();
      // The throwaway candidate never survived, and the task's own work is
      // untouched and still on its branch.
      expect(worktreePathForBranch(root, "repoos/integrate/0001")).toBeNull();
      expect(worktreePathForBranch(root, "feat/t1")).toBe(featureWt);
      expect(git(root, ["branch", "--list", "feat/t1"])).toContain("feat/t1");
      expect(git(featureWt, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });

  it("tears down an already-created candidate when cancellation arrives later", async () => {
    const { root, clean } = makeRepo();
    try {
      const featureWt = ensureWorktree(root, "feat/t2").path!;
      commitFile(featureWt, "src/new.ts", "export const n = 2;\n", "feature work");

      const { orch, coordinator } = makeOrchestrator(root);
      const job = coordinator.enqueue({ id: "0002", branch: "feat/t2" } as never)!;
      // Run just the syncing phase to materialize the candidate worktree.
      const syncCandidate = (
        orch as unknown as { syncCandidate: (j: unknown) => Promise<{ ok: boolean }> }
      ).syncCandidate.bind(orch);
      const synced = await syncCandidate(coordinator.getJob(job.taskId));
      expect(synced.ok).toBe(true);
      expect(worktreePathForBranch(root, "repoos/integrate/0002")).not.toBeNull();

      coordinator.requestCancel("0002");
      const res = await orch.processNext();

      expect(res.ok).toBe(false);
      expect(coordinator.getJob("0002")).toBeNull();
      expect(worktreePathForBranch(root, "repoos/integrate/0002")).toBeNull();
      // Feature branch survives for a retry.
      expect(worktreePathForBranch(root, "feat/t2")).toBe(featureWt);
      expect(git(root, ["branch", "--list", "feat/t2"])).toContain("feat/t2");
    } finally {
      clean();
    }
  });

  it("hides a cancelled job from the pipeline snapshot immediately", () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "0003", branch: "feat/t3" } as never);
      coordinator.enqueue({ id: "0004", branch: "feat/t4" } as never);
      // Pin enqueue order explicitly: two enqueues in the same millisecond
      // otherwise tie on `enqueuedAt` and the FIFO order falls back to
      // filesystem readdir order, which is not stable.
      coordinator.updateJob("0003", { enqueuedAt: "2026-01-01T00:00:00.000Z" });
      coordinator.updateJob("0004", { enqueuedAt: "2026-01-01T00:00:01.000Z" });
      const before = buildIntegrationSnapshot(coordinator, {});
      expect(before.active?.taskId).toBe("0003");
      expect(before.queue).toEqual(["0004"]);

      coordinator.requestCancel("0003");
      const after = buildIntegrationSnapshot(coordinator, {});

      expect(after.active?.taskId).toBe("0004");
      expect(after.queue).toEqual([]);
      expect(after.empty).toBe(false);
    } finally {
      clean();
    }
  });

  describe("JobCoordinator.requestCancel", () => {
    it("marks an in-flight job cancelled and persists the flag", () => {
      const { root, clean } = makeRepo();
      try {
        const coordinator = createJobCoordinator(root);
        coordinator.enqueue({ id: "0010", branch: "feat/t10" } as never);
        coordinator.updateJob("0010", {
          phase: "validating",
          startedAt: new Date().toISOString(),
        });

        expect(coordinator.requestCancel("0010")).toBe(true);

        const reloaded = createJobCoordinator(root).getJob("0010");
        expect(reloaded?.cancelled).toBe(true);
        expect(reloaded?.phase).toBe("validating");
      } finally {
        clean();
      }
    });

    it("is idempotent and refuses terminal/unknown jobs", () => {
      const { root, clean } = makeRepo();
      try {
        const coordinator = createJobCoordinator(root);
        coordinator.enqueue({ id: "0011", branch: "feat/t11" } as never);
        expect(coordinator.requestCancel("0011")).toBe(true);
        expect(coordinator.requestCancel("0011")).toBe(true);

        coordinator.enqueue({ id: "0012", branch: "feat/t12" } as never);
        coordinator.updateJob("0012", { phase: "done" });
        expect(coordinator.requestCancel("0012")).toBe(false);
        expect(coordinator.requestCancel("missing")).toBe(false);
      } finally {
        clean();
      }
    });

    it("re-enqueues a fresh job rather than handing back a cancelled one", () => {
      const { root, clean } = makeRepo();
      try {
        const coordinator = createJobCoordinator(root);
        coordinator.enqueue({ id: "0013", branch: "feat/t13" } as never);
        coordinator.requestCancel("0013");

        const again = coordinator.enqueue({ id: "0013", branch: "feat/t13" } as never)!;

        expect(again.cancelled).toBeFalsy();
        expect(again.phase).toBe("queued");
        // A fresh record replaced the cancelled one.
        expect(coordinator.getJob("0013")?.cancelled).toBeFalsy();
      } finally {
        clean();
      }
    });
  });

  describe("POST /api/tasks/:id/done/cancel handler (#0459)", () => {
    interface Captured {
      status: number;
      body: Record<string, unknown>;
    }

    function fakeCtx(coordinator: ReturnType<typeof createJobCoordinator>, events: unknown[]) {
      const task = { id: "0020", status: "review", branch: "feat/t20" };
      return {
        jobCoordinator: coordinator,
        index: { getTask: (id: string) => (id === "0020" ? (task as never) : null) },
        config: { workDir: "work", docsDir: "docs" } as RepoOSConfig,
        emitEvent: (e: unknown) => events.push(e),
      } as never;
    }

    function callCancel(
      ctx: unknown,
      id: string,
    ): { res: unknown; captured: Captured; done: Promise<void> } {
      const captured: Captured = { status: 0, body: {} };
      const res = {
        writeHead(status: number) {
          captured.status = status;
        },
        end(payload: string) {
          captured.body = JSON.parse(payload) as Record<string, unknown>;
        },
      };
      const done = Promise.resolve(
        cancelDone(ctx as never, {} as never, res as never, { param1: id }),
      );
      return { res, captured, done };
    }

    it("cancels a queued job and drops it from the pipeline", async () => {
      const { root, clean } = makeRepo();
      try {
        const coordinator = createJobCoordinator(root);
        coordinator.enqueue({ id: "0020", branch: "feat/t20" } as never);
        const events: unknown[] = [];
        const { captured, done } = callCancel(fakeCtx(coordinator, events), "0020");
        await done;

        expect(captured.status).toBe(200);
        expect(captured.body.ok).toBe(true);
        expect(coordinator.getJob("0020")).toBeNull();
        expect(events).toHaveLength(1);
        const pipeline = (events[0] as { pipeline: { empty: boolean } }).pipeline;
        expect(pipeline.empty).toBe(true);
      } finally {
        clean();
      }
    });

    it("404s when the task is not in the pipeline", async () => {
      const { root, clean } = makeRepo();
      try {
        const coordinator = createJobCoordinator(root);
        const { captured, done } = callCancel(fakeCtx(coordinator, []), "0020");
        await done;
        expect(captured.status).toBe(404);
      } finally {
        clean();
      }
    });

    it("refuses a job that already merged and is in cleanup", async () => {
      const { root, clean } = makeRepo();
      try {
        const coordinator = createJobCoordinator(root);
        coordinator.enqueue({ id: "0020", branch: "feat/t20" } as never);
        coordinator.updateJob("0020", { phase: "cleanup" });
        const { captured, done } = callCancel(fakeCtx(coordinator, []), "0020");
        await done;

        expect(captured.status).toBe(409);
        expect(coordinator.getJob("0020")?.phase).toBe("cleanup");
        expect(coordinator.getJob("0020")?.cancelled).toBeFalsy();
      } finally {
        clean();
      }
    });
  });
});
