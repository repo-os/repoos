/**
 * #0643 — branch-mode hotfix close-out recovery and git lock tolerance.
 *
 * Observed on #0642: Move to done on a branch-mode hotfix failed at publish
 * with `Unable to create .git/index.lock: File exists`, and every retry then
 * failed in the sync phase with `feature branch hotfix/… worktree not found`.
 * Two defects:
 *
 *  1. publish deliberately switches the main checkout (which IS the hotfix's
 *     "worktree") to `main`, and any failure left it there — so the hotfix
 *     branch had no worktree and every retry's sync failed.
 *  2. the publish merge failed immediately on a short-lived `index.lock`.
 *
 * These tests drive the real orchestrator against real git repos.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree, isGitLockContention, retryOnGitLock } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-hotfix-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "README.md", ".gitignore"]);
  git(root, ["commit", "-q", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  return { root, clean: () => rmFixture(root) };
}

interface SyncResult {
  ok: boolean;
  reason?: string;
  candidateSha?: string;
}

function makeOrchestrator(root: string, getTask?: (id: string) => Task | null) {
  const config = {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  } as RepoOSConfig;
  const coordinator = createJobCoordinator(root);
  const orchestrator = new CloseOutOrchestrator(
    config,
    coordinator,
    createRepositoryLock(root),
    createRootLock(root),
    getTask,
  );
  const syncCandidate = (job: unknown): Promise<SyncResult> =>
    (orchestrator as never as { syncCandidate: (j: unknown) => Promise<SyncResult> }).syncCandidate(
      job,
    );
  return { config, coordinator, orchestrator, syncCandidate };
}

/** Re-drive the phase machine until the job is terminal, like the server does. */
async function driveToTerminal(
  orchestrator: CloseOutOrchestrator,
  coordinator: ReturnType<typeof createJobCoordinator>,
  id: string,
): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const job = coordinator.getJob(id);
    if (!job || job.phase === "done" || job.phase === "failed") return;
    await orchestrator.processNext();
  }
}

/** A candidate branch/worktree ahead of main, with `baseMainSha` as its base. */
function makeCandidate(
  root: string,
  id: string,
): { branch: string; candidateSha: string; baseMainSha: string } {
  const branch = `repoos/integrate/${id}`;
  const wt = ensureWorktree(root, branch);
  expect(wt.ok).toBe(true);
  writeFileSync(join(wt.path, "feature.txt"), "new\n");
  git(wt.path, ["add", "feature.txt"]);
  git(wt.path, ["commit", "-q", "-m", "candidate work"]);
  return {
    branch,
    candidateSha: git(wt.path, ["rev-parse", "HEAD"]),
    baseMainSha: git(root, ["rev-parse", "main"]),
  };
}

describe("branch-mode hotfix publish failure restores the checkout (#0643)", () => {
  it("puts the hotfix branch back after a failed publish, so the retry completes", async () => {
    const { root, clean } = makeRepo();
    try {
      // The main checkout is on a branch-mode hotfix branch with its work.
      git(root, ["checkout", "-q", "-b", "hotfix/HF1"]);
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "fix.md"), "# fix\n");
      git(root, ["add", "docs/fix.md"]);
      git(root, ["commit", "-q", "-m", "hotfix(HF1): docs fix"]);

      const { coordinator, orchestrator } = makeOrchestrator(root);
      coordinator.enqueue({ id: "HF1", branch: "hotfix/HF1" } as never);
      coordinator.updateJob("HF1", { phase: "syncing", startedAt: new Date().toISOString() });

      // Dirty main with a source file. The publish switches the checkout to
      // main BEFORE the dirty check, so this fails the publish exactly where
      // #0642 did — after the checkout switch.
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "dirty.ts"), "uncommitted\n");

      await orchestrator.processNext();

      const job = coordinator.getJob("HF1");
      expect(job?.phase).toBe("failed");
      expect(job?.reason).toMatch(/uncommitted file/i);

      // The recovery: the checkout is back on the hotfix branch, so the branch
      // still has a worktree and the next retry's sync does not fail with
      // "worktree not found".
      expect(git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("hotfix/HF1");

      // Clear the blocker and retry the way a second Move to done would.
      rmSync(join(root, "src", "dirty.ts"), { force: true });
      rmSync(join(root, "src"), { recursive: true, force: true });
      coordinator.updateJob("HF1", {
        phase: "syncing",
        baseMainSha: null,
        candidateSha: null,
        reason: undefined,
      });
      await driveToTerminal(orchestrator, coordinator, "HF1");

      expect(coordinator.getJob("HF1")?.phase).toBe("done");
      expect(existsSync(join(root, "docs", "fix.md"))).toBe(true);
      // Successful hotfix close-out leaves the checkout on main and removes
      // the hotfix branch.
      expect(git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(git(root, ["branch", "--list", "hotfix/HF1"])).toBe("");
    } finally {
      clean();
    }
  }, 30_000);
});

describe("sync of a hotfix branch with no checked-out worktree (#0643)", () => {
  it("uses the branch ref instead of failing 'worktree not found'", async () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["checkout", "-q", "-b", "hotfix/HF2"]);
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "fix2.md"), "# fix2\n");
      git(root, ["add", "docs/fix2.md"]);
      git(root, ["commit", "-q", "-m", "hotfix(HF2): docs fix"]);
      const hotfixSha = git(root, ["rev-parse", "HEAD"]);
      // Leave the hotfix branch with no linked worktree at all.
      git(root, ["checkout", "-q", "main"]);

      const getTask = (id: string): Task | null =>
        id === "HF2" ? ({ id, hotfix: true, branch: "hotfix/HF2" } as Task) : null;
      const { coordinator, syncCandidate } = makeOrchestrator(root, getTask);
      coordinator.enqueue({ id: "HF2", branch: "hotfix/HF2" } as never);

      const res = await syncCandidate(coordinator.getJob("HF2"));

      expect(res.ok).toBe(true);
      expect(res.reason ?? "").not.toMatch(/worktree not found/i);
      // The branch ref was read directly, not through a worktree.
      expect(coordinator.getJob("HF2")?.branchSha).toBe(hotfixSha);
    } finally {
      clean();
    }
  }, 30_000);
});

describe("publish tolerates a transient git index.lock (#0643)", () => {
  it("retries the merge and completes when the lock clears", async () => {
    const { root, clean } = makeRepo();
    try {
      const { branch, candidateSha, baseMainSha } = makeCandidate(root, "T30");

      const { coordinator, orchestrator } = makeOrchestrator(root);
      coordinator.enqueue({ id: "T30", branch } as never);
      coordinator.updateJob("T30", {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha,
        branchSha: candidateSha,
        candidateSha,
      });

      // Hold the lock past the first attempt(s) but inside the bounded retry
      // window. A single attempt would fail the publish outright.
      const lockPath = join(root, ".git", "index.lock");
      writeFileSync(lockPath, "");
      const release = setTimeout(() => rmSync(lockPath, { force: true }), 250);
      try {
        await orchestrator.processNext();
      } finally {
        clearTimeout(release);
        rmSync(lockPath, { force: true });
      }

      expect(coordinator.getJob("T30")?.phase).toBe("done");
      expect(existsSync(join(root, "feature.txt"))).toBe(true);
    } finally {
      clean();
    }
  }, 30_000);

  it("fails with a clear, retry-safe message when the lock never clears", async () => {
    const { root, clean } = makeRepo();
    try {
      const { branch, candidateSha, baseMainSha } = makeCandidate(root, "T31");

      const { coordinator, orchestrator } = makeOrchestrator(root);
      coordinator.enqueue({ id: "T31", branch } as never);
      coordinator.updateJob("T31", {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha,
        branchSha: candidateSha,
        candidateSha,
      });

      const lockPath = join(root, ".git", "index.lock");
      writeFileSync(lockPath, "");
      try {
        await orchestrator.processNext();
      } finally {
        rmSync(lockPath, { force: true });
      }

      const job = coordinator.getJob("T31");
      expect(job?.phase).toBe("failed");
      expect(job?.reason).toMatch(/index\.lock/i);
      expect(job?.reason).toMatch(/retry/i);
      // Never merged while the lock was held.
      expect(existsSync(join(root, "feature.txt"))).toBe(false);
    } finally {
      clean();
    }
  }, 30_000);
});

describe("retryOnGitLock helper (#0643)", () => {
  it("retries while the failure is lock contention and stops at success", async () => {
    let calls = 0;
    const result = await retryOnGitLock(
      async () => ({ status: ++calls < 3 ? 128 : 0, stderr: "index.lock" }),
      (r) => (r.status !== 0 ? r.stderr : null),
      { attempts: 5, baseDelayMs: 0 },
    );
    expect(result.status).toBe(0);
    expect(calls).toBe(3);
  });

  it("gives up after the bounded attempts and returns the last failure", async () => {
    let calls = 0;
    const result = await retryOnGitLock(
      async () => {
        calls++;
        return {
          status: 128,
          stderr: "fatal: Unable to create '/x/.git/index.lock': File exists.",
        };
      },
      (r) => (r.status !== 0 ? r.stderr : null),
      { attempts: 3, baseDelayMs: 0 },
    );
    expect(calls).toBe(3);
    expect(result.status).toBe(128);
  });

  it("does not retry a non-lock failure", async () => {
    let calls = 0;
    await retryOnGitLock(
      async () => {
        calls++;
        return { status: 1, stderr: "a real failure" };
      },
      (r) => (r.status !== 0 && isGitLockContention(r.stderr) ? r.stderr : null),
      { attempts: 5, baseDelayMs: 0 },
    );
    expect(calls).toBe(1);
  });

  it("classifies git's lock-contention messages", () => {
    expect(
      isGitLockContention("fatal: Unable to create '/repo/.git/index.lock': File exists."),
    ).toBe(true);
    expect(isGitLockContention("Another git process seems to be running in this repository")).toBe(
      true,
    );
    expect(isGitLockContention("error: Your local changes would be overwritten")).toBe(false);
  });
});
