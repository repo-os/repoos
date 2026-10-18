/**
 * Post-handoff engineer checkpoint recovery (#0834).
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import type { RepoOSConfig } from "../../core/types.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import {
  clearPostHandoffCheckpointRecovery,
  readPostHandoffCheckpointRecovery,
  resumeCloseOutAfterCheckpointRecovery,
  startPostHandoffCheckpointRecovery,
} from "../../server/post-handoff-checkpoint-recovery.js";
import { writeHandoffSnapshot } from "../../server/worktree-handoff-guard.js";
import { reviewMission } from "../../server/review.js";
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
    expect(rec?.phase).toBe("gate");
    expect(rec?.approvedSha).toBe("aaa111");
    clearPostHandoffCheckpointRecovery(config, "0834");
    rmFixture(root);
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
    await resumeCloseOutAfterCheckpointRecovery(
      {
        config,
        index: { getTask: () => task } as any,
        jobCoordinator: coordinator,
        reviews: { isRunning: () => false } as any,
        reload: null,
        emitEvent: () => {},
        triggerJobProcessing: vi.fn(),
      },
      task,
    );
    const job = coordinator.getJob("0834");
    expect(job?.handoffSha).toBe("newhead0000000000000000000000000000000001");
    expect(readPostHandoffCheckpointRecovery(config, "0834")).toBeNull();
    rmFixture(root);
  });

  it("delta review mission scopes git diff to the approved handoff sha", () => {
    const reviewer = { name: "r", cli: "fake", model: "m" } as Agent;
    const task = { id: "1", title: "t", body: "spec", branch: "feat/x" } as Task;
    const mission = reviewMission(task, reviewer, "/wt", "main", { root: "/r" } as RepoOSConfig, {
      deltaSinceApprovedSha: "deadbeef00000000000000000000000000000001",
    });
    expect(mission).toContain("Delta review scope");
    expect(mission).toContain("deadbeef0000");
    expect(mission).toContain("git diff deadbeef00000000000000000000000000000001..HEAD");
  });
});
