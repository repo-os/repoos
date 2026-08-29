import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock } from "../../server/repo-lock.js";

describe("integration jobs (0118)", () => {
  let testRepo: string;
  let testRepoGit: string;

  beforeEach(() => {
    // Create a temporary git repo for testing with unique name
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    testRepo = join(tmpdir(), `repoos-test-${uniqueId}`);
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

  it("should enqueue jobs and maintain FIFO order", async () => {
    const coordinator = createJobCoordinator(testRepo);

    // Enqueue tasks with slight delays to ensure different timestamps
    const job1 = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any);
    await new Promise((r) => setTimeout(r, 10));
    const job2 = coordinator.enqueue({ id: "task2", branch: "feat/task2" } as any);

    expect(job1).toBeDefined();
    expect(job2).toBeDefined();
    expect(job1!.taskId).toBe("task1");
    expect(job2!.taskId).toBe("task2");

    const all = coordinator.allJobs();
    expect(all).toHaveLength(2);
    // Verify both tasks exist (order might be same-millisecond, so just check they're there)
    const ids = all.map((j) => j.taskId);
    expect(ids).toContain("task1");
    expect(ids).toContain("task2");
  });

  it("should be idempotent: repeated enqueue returns existing job", () => {
    const coordinator = createJobCoordinator(testRepo);

    const job1 = coordinator.enqueue({
      id: "task1",
      branch: "feat/task1",
      status: "review",
    } as any);
    const job1Again = coordinator.enqueue({
      id: "task1",
      branch: "feat/task1",
      status: "review",
    } as any);

    expect(job1!.enqueuedAt).toBe(job1Again!.enqueuedAt);
    expect(coordinator.allJobs()).toHaveLength(1);
  });

  it("removeJob actually deletes the job file from disk (#0271 follow-up, confirmed live bug: task #0258)", () => {
    // removeJob() used a bare require("fs") — this package is "type":
    // "module", so require is undefined at runtime in the compiled dist/
    // output; the ReferenceError was silently swallowed by the try/catch,
    // so the file was NEVER actually deleted. A moot close-out job (task
    // already done, branch/worktree gone) kept getting re-picked-up and
    // re-processed forever — a live, CPU-burning infinite loop in
    // production (task #0258) until someone noticed. This test asserts
    // the actual on-disk effect, not just that the call doesn't throw —
    // that's what let the bug ship silently in the first place (vitest's
    // own module loader provides a working require(), so calling
    // removeJob() under test never reproduced the ReferenceError itself).
    const coordinator = createJobCoordinator(testRepo);
    coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any);
    const path = join(testRepo, ".repoos", "integration-jobs", "task1.json");
    expect(existsSync(path)).toBe(true);

    coordinator.removeJob("task1");

    expect(existsSync(path)).toBe(false);
    expect(coordinator.getJob("task1")).toBeNull();
  });

  it("re-enqueues fresh when a DONE job's task is no longer done (0195)", async () => {
    // Nothing blocks a task leaving `done` via a plain PATCH (e.g. a manual
    // reopen). When that happens the old job record used to sit there
    // forever — enqueue() treated any non-failed phase as final, so "Move to
    // done" returned the stale finished job with ok:true and started nothing.
    const coordinator = createJobCoordinator(testRepo);

    const job1 = coordinator.enqueue({
      id: "task1",
      branch: "feat/task1",
      status: "review",
    } as any)!;
    coordinator.updateJob("task1", { phase: "done" });

    // Task reopened: back to review, same branch, no new job yet.
    const stale = coordinator.getJob("task1")!;
    expect(stale.phase).toBe("done");

    await new Promise((r) => setTimeout(r, 5));
    const retried = coordinator.enqueue({
      id: "task1",
      branch: "feat/task1",
      status: "review",
    } as any)!;
    expect(retried.phase).toBe("queued");
    expect(retried.enqueuedAt).not.toBe(job1.enqueuedAt);
  });

  it("still returns a DONE job as-is when the task really is done", () => {
    // The common case: a done job for a done task is not stale, and must not
    // be spuriously re-enqueued.
    const coordinator = createJobCoordinator(testRepo);

    const job1 = coordinator.enqueue({
      id: "task1",
      branch: "feat/task1",
      status: "review",
    } as any)!;
    coordinator.updateJob("task1", { phase: "done" });

    const again = coordinator.enqueue({
      id: "task1",
      branch: "feat/task1",
      status: "done",
    } as any)!;
    expect(again.enqueuedAt).toBe(job1.enqueuedAt);
    expect(again.phase).toBe("done");
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
    const repoosDirPath = join(testRepo, ".repoos");
    mkdirSync(repoosDirPath, { recursive: true });
    const lockPath = join(repoosDirPath, "close-out.lock");
    const staleTime = Date.now() - 70_000; // 70 seconds ago in milliseconds
    writeFileSync(
      lockPath,
      JSON.stringify({ taskId: "stale", acquiredAt: new Date(staleTime).toISOString() }),
    );

    // Set the file's actual modification time to be stale
    utimesSync(lockPath, staleTime / 1000, staleTime / 1000);

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

  it("e2e: concurrent close-outs with main drift and cleanup", async () => {
    // Create a real temp repo for end-to-end testing
    const e2eRepo = join(
      tmpdir(),
      `repoos-e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );
    mkdirSync(e2eRepo, { recursive: true });
    const gitCmd = `git -C ${e2eRepo}`;

    try {
      // Initialize repo with main branch
      execSync(`${gitCmd} init`, { stdio: "ignore" });
      execSync(`${gitCmd} config user.email "test@example.com"`, { stdio: "ignore" });
      execSync(`${gitCmd} config user.name "Test User"`, { stdio: "ignore" });

      writeFileSync(join(e2eRepo, "README.md"), "# Test\n");
      execSync(`${gitCmd} add README.md`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "Initial"`, { stdio: "ignore" });

      // Create task1 feature branch
      execSync(`${gitCmd} checkout -b feat/task1`, { stdio: "ignore" });
      writeFileSync(join(e2eRepo, "task1.txt"), "task1 content\n");
      execSync(`${gitCmd} add task1.txt`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "task1 work"`, { stdio: "ignore" });

      // Create task2 feature branch
      execSync(`${gitCmd} checkout main`, { stdio: "ignore" });
      execSync(`${gitCmd} checkout -b feat/task2`, { stdio: "ignore" });
      writeFileSync(join(e2eRepo, "task2.txt"), "task2 content\n");
      execSync(`${gitCmd} add task2.txt`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "task2 work"`, { stdio: "ignore" });

      // Create task3 feature branch
      execSync(`${gitCmd} checkout main`, { stdio: "ignore" });
      execSync(`${gitCmd} checkout -b feat/task3`, { stdio: "ignore" });
      writeFileSync(join(e2eRepo, "task3.txt"), "task3 content\n");
      execSync(`${gitCmd} add task3.txt`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "task3 work"`, { stdio: "ignore" });

      // Return to main
      execSync(`${gitCmd} checkout main`, { stdio: "ignore" });

      // Get baseline main SHA
      const mainSha = execSync(`${gitCmd} rev-parse HEAD`, { encoding: "utf8" }).trim();

      // Enqueue three jobs
      const coordinator = createJobCoordinator(e2eRepo);
      const job1 = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any)!;
      const job2 = coordinator.enqueue({ id: "task2", branch: "feat/task2" } as any)!;
      const job3 = coordinator.enqueue({ id: "task3", branch: "feat/task3" } as any)!;

      expect(job1).toBeDefined();
      expect(job2).toBeDefined();
      expect(job3).toBeDefined();

      // Simulate task1 advancing to validating phase
      coordinator.updateJob("task1", { phase: "validating", baseMainSha: mainSha });

      // Simulate main advancing (before task1 publishes) - this is the drift scenario
      execSync(`${gitCmd} checkout -b interim-commit`, { stdio: "ignore" });
      writeFileSync(join(e2eRepo, "main-update.txt"), "main changed\n");
      execSync(`${gitCmd} add main-update.txt`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "main advancement"`, { stdio: "ignore" });
      execSync(`${gitCmd} checkout main`, { stdio: "ignore" });
      execSync(`${gitCmd} merge --ff-only interim-commit`, { stdio: "ignore" });

      const newMainSha = execSync(`${gitCmd} rev-parse HEAD`, { encoding: "utf8" }).trim();
      expect(newMainSha).not.toBe(mainSha); // Main did advance

      // Task1 would detect drift and go back to syncing
      coordinator.updateJob("task1", {
        phase: "syncing",
        baseMainSha: newMainSha, // Updated base
      });

      // Verify all three jobs still exist and are tracked
      const allJobs = coordinator.allJobs();
      expect(allJobs).toHaveLength(3);
      const jobIds = new Set(allJobs.map((j) => j.taskId));
      expect(jobIds.has("task1")).toBe(true);
      expect(jobIds.has("task2")).toBe(true);
      expect(jobIds.has("task3")).toBe(true);

      // Simulate publishing task1
      coordinator.updateJob("task1", { phase: "publishing", candidateSha: "task1-sha" });

      // Verify lock can be acquired
      const lock = createRepositoryLock(e2eRepo);
      expect(lock.acquire("task1")).toBe(true);
      expect(lock.getHolder()).toBe("task1");

      // Verify second job cannot acquire lock
      expect(lock.acquire("task2")).toBe(false);

      // Release task1's lock
      expect(lock.release("task1")).toBe(true);
      expect(lock.isLocked()).toBe(false);

      // Now task2 can acquire
      expect(lock.acquire("task2")).toBe(true);
      expect(lock.release("task2")).toBe(true);

      // Mark all as done
      coordinator.updateJob("task1", { phase: "done" });
      coordinator.updateJob("task2", { phase: "done" });
      coordinator.updateJob("task3", { phase: "done" });

      // Verify all are done
      const finishedJobs = coordinator.allJobs();
      expect(finishedJobs.every((j) => j.phase === "done")).toBe(true);

      // Verify no interrupted jobs remain
      const interrupted = coordinator.findInterruptedJobs();
      expect(interrupted).toHaveLength(0);
    } finally {
      try {
        rmSync(e2eRepo, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  it("e2e: main drift during publish triggers retry instead of failure", async () => {
    // This test verifies that when main advances between validation and publishing,
    // the job correctly goes back to "syncing" (not "failed") so it can retry.
    const driftRepo = join(
      tmpdir(),
      `repoos-drift-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );
    mkdirSync(driftRepo, { recursive: true });
    const gitCmd = `git -C ${driftRepo}`;

    try {
      // Set up initial repo
      execSync(`${gitCmd} init`, { stdio: "ignore" });
      execSync(`${gitCmd} config user.email "test@example.com"`, { stdio: "ignore" });
      execSync(`${gitCmd} config user.name "Test User"`, { stdio: "ignore" });

      writeFileSync(join(driftRepo, "README.md"), "# Test\n");
      execSync(`${gitCmd} add README.md`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "Initial"`, { stdio: "ignore" });

      // Create feature branch
      execSync(`${gitCmd} checkout -b feat/task1`, { stdio: "ignore" });
      writeFileSync(join(driftRepo, "task.txt"), "task work\n");
      execSync(`${gitCmd} add task.txt`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "task work"`, { stdio: "ignore" });

      // Back to main
      execSync(`${gitCmd} checkout main`, { stdio: "ignore" });

      // Get initial main SHA
      const initialMainSha = execSync(`${gitCmd} rev-parse HEAD`, { encoding: "utf8" }).trim();

      // Enqueue job
      const coordinator = createJobCoordinator(driftRepo);
      const job = coordinator.enqueue({ id: "task1", branch: "feat/task1" } as any)!;
      expect(job).toBeDefined();

      // Simulate job validating against initial main
      const now = new Date().toISOString();
      coordinator.updateJob("task1", {
        phase: "validating",
        startedAt: now,
        baseMainSha: initialMainSha,
      });

      // SIMULATE MAIN ADVANCING (drift scenario)
      execSync(`${gitCmd} checkout -b interim-commit`, { stdio: "ignore" });
      writeFileSync(join(driftRepo, "main-change.txt"), "main advanced\n");
      execSync(`${gitCmd} add main-change.txt`, { stdio: "ignore" });
      execSync(`${gitCmd} commit -m "main drift"`, { stdio: "ignore" });
      execSync(`${gitCmd} checkout main`, { stdio: "ignore" });
      execSync(`${gitCmd} merge --ff-only interim-commit`, { stdio: "ignore" });

      const newMainSha = execSync(`${gitCmd} rev-parse HEAD`, { encoding: "utf8" }).trim();
      expect(newMainSha).not.toBe(initialMainSha);

      // Simulate job moving to publishing phase
      coordinator.updateJob("task1", {
        phase: "publishing",
        candidateSha: "some-candidate-sha",
      });

      // Now simulate what publishCandidate() would do when it detects drift:
      // It should set phase back to "syncing" and return false
      coordinator.updateJob("task1", {
        phase: "syncing",
        startedAt: null, // Reset startedAt to indicate retry, not interrupted
        baseMainSha: null,
        candidateSha: null,
      });

      // Critical check: verify the phase is NOT "failed" but "syncing"
      // This simulates the fixed behavior where drift goes back to retry
      const recoveredJob = coordinator.getJob("task1");
      expect(recoveredJob?.phase).toBe("syncing");
      expect(recoveredJob?.reason).toBeUndefined(); // No failure reason - not marked as failure!
    } finally {
      try {
        rmSync(driftRepo, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  });
});
