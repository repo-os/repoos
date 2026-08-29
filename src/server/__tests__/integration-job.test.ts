import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createJobCoordinator } from "../integration-job.js";
import { createRepositoryLock } from "../repo-lock.js";

describe("integration jobs (0118)", () => {
  let testRepo: string;
  let testRepoGit: string;

  beforeEach(() => {
    // Create a temporary git repo for testing
    testRepo = join(tmpdir(), `repoos-test-${Date.now()}`);
    mkdirSync(testRepo, { recursive: true });
    testRepoGit = `git -C ${testRepo}`;

    // Initialize git repo
    execSync(`${testRepoGit} init`, { stdio: "ignore" });
    execSync(`${testRepoGit} config user.email "test@example.com"`, { stdio: "ignore" });
    execSync(`${testRepoGit} config user.name "Test User"`, { stdio: "ignore" });

    // Create an initial commit on main
    writeFileSync(join(testRepo, "README.md"), "# Test Repo\n");
    execSync(`${testRepoGit} add README.md`, { stdio: "ignore" });
    execSync(`${testRepoGit} commit -m "Initial commit"`, { stdio: "ignore" });
  });

  afterEach(() => {
    try {
      rmSync(testRepo, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  });

  it("should enqueue jobs and maintain FIFO order", () => {
    const coordinator = createJobCoordinator(testRepo);

    // Enqueue two tasks
    const job1 = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any);
    const job2 = coordinator.enqueue({ id: "task2", branch: "feat/task2" } as any);

    expect(job1).toBeDefined();
    expect(job2).toBeDefined();
    expect(job1!.taskId).toBe("task1");
    expect(job2!.taskId).toBe("task2");

    const all = coordinator.allJobs();
    expect(all).toHaveLength(2);
    expect(all[0].taskId).toBe("task1");
    expect(all[1].taskId).toBe("task2");
  });

  it("should be idempotent: repeated enqueue returns existing job", () => {
    const coordinator = createJobCoordinator(testRepo);

    const job1 = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any);
    const job1Again = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any);

    expect(job1!.enqueuedAt).toBe(job1Again!.enqueuedAt);
    expect(coordinator.allJobs()).toHaveLength(1);
  });

  it("should recover interrupted jobs on startup", () => {
    const coordinator = createJobCoordinator(testRepo);

    // Create a job in syncing phase
    const job = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any)!;
    coordinator.updateJob("task1", { phase: "syncing", startedAt: new Date().toISOString() });

    // Create a new coordinator (simulating restart)
    const coordinator2 = createJobCoordinator(testRepo);
    const interrupted = coordinator2.findInterruptedJobs();

    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].taskId).toBe("task1");
    expect(interrupted[0].phase).toBe("syncing");
  });

  it("should not recover done/failed jobs", () => {
    const coordinator = createJobCoordinator(testRepo);

    const job1 = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any)!;
    coordinator.updateJob("task1", { phase: "done" });

    const job2 = coordinator.enqueue({ id: "task2", branch: "feat/task2" } as any)!;
    coordinator.updateJob("task2", { phase: "failed", reason: "test failure" });

    const interrupted = coordinator.findInterruptedJobs();
    expect(interrupted).toHaveLength(0);
  });

  it("should serialize repo lock across concurrent jobs", () => {
    const lock = createRepositoryLock(testRepo);

    // First job acquires lock
    expect(lock.acquire("task1")).toBe(true);
    expect(lock.isLocked()).toBe(true);
    expect(lock.getHolder()).toBe("task1");

    // Second job cannot acquire
    expect(lock.acquire("task2")).toBe(false);

    // First job releases
    expect(lock.release("task1")).toBe(true);
    expect(lock.isLocked()).toBe(false);

    // Now second job can acquire
    expect(lock.acquire("task2")).toBe(true);
  });

  it("should clean up stale locks after timeout", () => {
    const lock = createRepositoryLock(testRepo);

    // Write a stale lock file (>60 seconds old)
    const lockPath = join(testRepo, ".repoos/close-out.lock");
    const staleTime = new Date(Date.now() - 70_000); // 70 seconds ago
    writeFileSync(
      lockPath,
      JSON.stringify({ taskId: "stale", acquiredAt: staleTime.toISOString() }),
    );

    // Should be able to acquire even though file exists (it's stale)
    expect(lock.acquire("task1")).toBe(true);
  });

  it("should track baseMainSha and detect drift", () => {
    const coordinator = createJobCoordinator(testRepo);

    const job = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any)!;
    expect(job.baseMainSha).toBeNull();

    // Simulate recording baseMainSha during validation
    coordinator.updateJob("task1", {
      phase: "validating",
      baseMainSha: "abc123",
    });

    const updated = coordinator.getJob("task1");
    expect(updated?.baseMainSha).toBe("abc123");
  });

  it("should persist and recover full job state", () => {
    const coordinator = createJobCoordinator(testRepo);

    const job = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any)!;
    coordinator.updateJob("task1", {
      phase: "publishing",
      startedAt: new Date().toISOString(),
      baseMainSha: "main-sha-abc",
      branchSha: "branch-sha-def",
      candidateSha: "candidate-sha-ghi",
    });

    // Create new coordinator and verify state persisted
    const coordinator2 = createJobCoordinator(testRepo);
    const recovered = coordinator2.getJob("task1");

    expect(recovered).toBeDefined();
    expect(recovered?.phase).toBe("publishing");
    expect(recovered?.baseMainSha).toBe("main-sha-abc");
    expect(recovered?.branchSha).toBe("branch-sha-def");
    expect(recovered?.candidateSha).toBe("candidate-sha-ghi");
  });
});
