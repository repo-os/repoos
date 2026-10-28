/**
 * Post-handoff engineer checkpoint recovery (#0834).
 */
import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import type { RepoOSConfig } from "../../core/types.js";
import { ensureWorktree } from "../../core/git.js";
import { parseTask } from "../../core/task.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import {
  clearPostHandoffCheckpointRecovery,
  readPostHandoffCheckpointRecovery,
  resumeCloseOutAfterCheckpointRecovery,
  startPostHandoffCheckpointRecovery,
} from "../../server/post-handoff-checkpoint-recovery.js";
import { writeHandoffSnapshot } from "../../server/worktree-handoff-guard.js";
import { reviewMission, ReviewManager } from "../../server/review.js";
import type { Agent, Task } from "../../core/types.js";

describe("post-handoff checkpoint recovery (#0834)", () => {
  it("persists recovery state when Move to done starts recovery", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-phc-"));
    const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
    mkdirSync(join(root, ".repoos"), { recursive: true });
    const task = {
      id: "0834",
      status: "review",
      branch: "feat/x",
      title: "t",
    } as Task;
    const reviews = {
      isRunning: () => false,
      runCheckpointDelta: vi.fn(async () => ({ ok: true })),
    };
    const started = await startPostHandoffCheckpointRecovery(
      {
        config,
        index: { getTask: () => task } as any,
        jobCoordinator: createJobCoordinator(root),
        reviews: reviews as any,
        reload: null,
        emitEvent: () => {},
        triggerJobProcessing: () => {},
      },
      task,
      "aaa111",
      "bbb222",
    );
    expect(started.ok).toBe(true);
    const rec = readPostHandoffCheckpointRecovery(config, "0834");
    expect(rec?.approvedSha).toBe("aaa111");
    expect(rec?.headSha).toBe("bbb222");
    clearPostHandoffCheckpointRecovery(config, "0834");
    rmFixture(root);
  });

  it("announces a failed recovery gate instead of leaving the task silent (#0834)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-phc-gatefail-"));
    try {
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      mkdirSync(join(root, ".repoos"), { recursive: true });
      const task = {
        id: "0834",
        status: "review",
        branch: "feat/missing-worktree",
        title: "t",
      } as Task;
      const events: Array<{ type: string; step?: string; detail?: string }> = [];
      const started = await startPostHandoffCheckpointRecovery(
        {
          config,
          index: { getTask: () => task } as any,
          jobCoordinator: createJobCoordinator(root),
          reviews: { isRunning: () => false, runCheckpointDelta: vi.fn() } as any,
          reload: null,
          emitEvent: (e) => events.push(e as never),
          triggerJobProcessing: () => {},
        },
        task,
        "aaa111",
        "bbb222",
      );
      expect(started.ok).toBe(true);
      // The pipeline cannot even find the worktree — it must fail CLOSED with
      // a terminal signal the UI renders, not vanish (#0834 AC: never silent).
      await vi.waitFor(() => {
        const terminal = events.find((e) => e.step === "checkpoint-recovery-failed");
        expect(terminal).toBeTruthy();
        expect(terminal?.detail).toContain("checkpoint recovery failed");
      });
      const rec = readPostHandoffCheckpointRecovery(config, "0834");
      expect(rec?.phase).toBe("failed");
      expect(rec?.approvedSha).toBe("aaa111");
    } finally {
      clearPostHandoffCheckpointRecovery({ root } as RepoOSConfig, "0834");
      rmFixture(root);
    }
  });

  it("resumeCloseOutAfterCheckpointRecovery enqueues close-out after delta review", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-phc-resume-"));
    const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
    mkdirSync(join(root, ".repoos", "post-handoff-checkpoint"), { recursive: true });
    const coordinator = createJobCoordinator(root);
    const task = {
      id: "0834",
      status: "review",
      branch: "feat/x",
      title: "t",
      isArchived: false,
    } as Task;
    writeHandoffSnapshot(root, ".repoos", {
      taskId: "0834",
      branch: "feat/x",
      sha: "newhead0000000000000000000000000000000001",
      at: "2026-10-18T00:00:00Z",
      clean: true,
    });
    const recPath = join(root, ".repoos/post-handoff-checkpoint/0834.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      recPath,
      JSON.stringify({
        taskId: "0834",
        approvedSha: "old000000000000000000000000000000000001",
        headSha: "newhead0000000000000000000000000000000001",
        phase: "review",
        startedAt: "2026-10-18T00:00:00Z",
      }),
      "utf8",
    );
    coordinator.enqueue(task as any);
    const events: Array<{ type: string; step?: string }> = [];
    await resumeCloseOutAfterCheckpointRecovery(
      {
        config,
        index: { getTask: () => task } as any,
        jobCoordinator: coordinator,
        reviews: { isRunning: () => false } as any,
        reload: null,
        emitEvent: (e) => events.push(e as never),
        triggerJobProcessing: vi.fn(),
      },
      task,
    );
    const job = coordinator.getJob("0834");
    expect(job?.handoffSha).toBe("newhead0000000000000000000000000000000001");
    expect(readPostHandoffCheckpointRecovery(config, "0834")).toBeNull();
    // Terminal signal (#0834): the card drops its "re-reviewing checkpoint"
    // hint exactly when close-out is actually enqueued.
    expect(
      events.some((e) => e.type === "task.progress" && e.step === "checkpoint-recovery-done"),
    ).toBe(true);
    rmFixture(root);
  });

  it("delta review mission scopes git diff to the approved handoff sha", () => {
    const reviewer = { name: "r", cli: "fake", model: "m" } as Agent;
    const task = { id: "1", title: "t", body: "spec", branch: "feat/x" } as Task;
    const mission = reviewMission(
      task,
      reviewer,
      "/wt",
      "main",
      { root: "/r", workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
      {
        deltaSinceApprovedSha: "deadbeef00000000000000000000000000000001",
      },
    );
    expect(mission).toContain("Delta review scope");
    expect(mission).toContain("deadbeef0000");
    expect(mission).toContain("git diff deadbeef00000000000000000000000000000001..HEAD");
  });

  /**
   * Criterion 3 (#0834): a delta review that is NOT "good to go" must reach the
   * checkpoint verdict handler and bounce the task like any other review
   * finding — it must not be swallowed by the delta path. `autoBounce` is
   * spied here so the test asserts the routing (delta verdict -> handler +
   * bounce) without depending on the engineer-session machinery `autoBounce`
   * itself needs; that behaviour is covered by agent-review.test.ts.
   */
  it("routes a failed delta verdict to the handler and bounces like any finding (#0834)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-phc-delta-"));
    try {
      mkdirSync(join(root, "work"), { recursive: true });
      mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
      execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: root });

      const branch = "feat/delta-review";
      const wt = ensureWorktree(root, branch);
      if (!wt.ok) throw new Error(wt.reason);
      writeFileSync(join(wt.path, "impl.ts"), "export const x = 1;\n");
      execFileSync("git", ["add", "-A"], { cwd: wt.path });
      execFileSync("git", ["commit", "-q", "-m", "engineer work"], { cwd: wt.path });

      const config = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
        agents: [{ name: "reviewer", cli: "opencode", model: "m", enabled: true }],
      } as RepoOSConfig;

      const absPath = join(root, "work", "0001-delta.md");
      writeFileSync(
        absPath,
        `---\nid: "0001"\ntitle: Delta\nstatus: review\npriority: p2\narea: server\nbranch: ${branch}\n---\nbody\n`,
      );
      const task = parseTask({
        content: readFileSync(absPath, "utf8"),
        absPath,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });

      const report = "## Verdict\nneeds some work — a real defect in the delta.\n";
      const fakeRunner = {
        clearSession: () => {},
        isRunning: () => false,
        output: (key: string) =>
          key.startsWith("review:") ? { lines: [{ type: "text", text: report }] } : null,
        startReview: () => ({ ok: true }),
        stop: () => {},
        system: () => {},
        hasSession: () => false,
        running: () => [],
      };
      const reviews = new ReviewManager(
        config,
        () => {},
        fakeRunner as never,
        { getTask: () => task, applyFileChange: () => {} } as never,
      );
      const handler = vi.fn();
      reviews.bindCheckpointDeltaReviewHandler(handler);
      const bounced = vi
        .spyOn(
          reviews as unknown as { autoBounce: (...a: unknown[]) => Promise<void> },
          "autoBounce",
        )
        .mockResolvedValue(undefined);
      vi.spyOn(
        reviews as unknown as { spawnDurable: (...a: unknown[]) => void },
        "spawnDurable",
      ).mockImplementation((...args: unknown[]) => {
        // prepareReview drops a run that never armed its timeout. A real spawn sets one.
        const run = args[4] as { timer?: ReturnType<typeof setTimeout> };
        const timer = setTimeout(() => {}, 60_000);
        timer.unref?.();
        run.timer = timer;
      });

      const started = await reviews.runCheckpointDelta(
        task,
        "abcdef1234567890abcdef1234567890abcdef12",
      );
      expect(started.ok).toBe(true);

      await reviews.handleReviewDone("review:0001");
      // The delta handler is scheduled after the completion fence resolves.
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][2]).toBe("needs some work");
      expect(bounced).toHaveBeenCalledTimes(1);
    } finally {
      rmFixture(root);
    }
  });
});
