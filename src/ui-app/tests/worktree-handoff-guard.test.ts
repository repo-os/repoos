/**
 * Handoff snapshot, advisory lock, and close-out integrity checks (#0598).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";
import {
  discardWorktreeHandoffChanges,
  readHandoffSnapshot,
  readWorktreeReviewLock,
  recordWorktreeHandoffProtection,
  verifyWorktreeHandoffIntegrity,
  writeHandoffSnapshot,
  writeWorktreeReviewLock,
  WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX,
  worktreeReviewLockRefusal,
} from "../../server/worktree-handoff-guard.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-handoff-guard-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "README.md", ".gitignore"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  return { root, clean: () => rmFixture(root) };
}

describe("worktree handoff guard (#0598)", () => {
  it("records snapshot and lock on a clean worktree", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/0598";
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "src.ts"), "export const x = 1;\n");
      git(wt.path, ["add", "src.ts"]);
      git(wt.path, ["commit", "-m", "work"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      await recordWorktreeHandoffProtection(config, "0598", branch, wt.path);
      const snap = readHandoffSnapshot(root, ".repoos", "0598");
      expect(snap?.sha).toBe(git(wt.path, ["rev-parse", "HEAD"]));
      expect(readWorktreeReviewLock(root, ".repoos", "0598")?.status).toBe("review");
    } finally {
      clean();
    }
  });

  it("detects a dirty worktree and HEAD drift against the handoff SHA", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/dirty";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "f.txt"), "a\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      writeHandoffSnapshot(root, ".repoos", {
        taskId: "d1",
        branch,
        sha,
        at: "2026-09-30T00:00:00Z",
        clean: true,
      });
      writeFileSync(join(wt.path, "f.txt"), "a\n// edit\n");
      let check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
      expect(check.dirtyFiles).toContain("f.txt");

      git(wt.path, ["checkout", "--", "f.txt"]);
      writeFileSync(join(wt.path, "f.txt"), "b\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "after handoff"]);
      check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
    } finally {
      clean();
    }
  });

  it("allows HEAD drift when only task markdown bookkeeping changed (#0600)", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/bookkeeping";
      const wt = ensureWorktree(root, branch);
      mkdirSync(join(wt.path, "work"), { recursive: true });
      writeFileSync(join(wt.path, "f.txt"), "a\n");
      writeFileSync(join(wt.path, "work", "0599-self.md"), "---\nid: 0599\n---\n");
      git(wt.path, ["add", "f.txt", "work/0599-self.md"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      writeFileSync(join(wt.path, "work", "0599-self.md"), "---\nid: 0599\nstatus: review\n---\n");
      writeFileSync(join(wt.path, "work", "0598-other.md"), "---\nid: 0598\n---\nfrom sync\n");
      git(wt.path, ["add", "work"]);
      git(wt.path, ["commit", "-m", "docs(0599): update task"]);
      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(true);
    } finally {
      clean();
    }
  });

  it("still fails when source was renamed into work/*.md (#0600 review)", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/rename-trick";
      const wt = ensureWorktree(root, branch);
      mkdirSync(join(wt.path, "src"), { recursive: true });
      mkdirSync(join(wt.path, "work"), { recursive: true });
      writeFileSync(join(wt.path, "src", "foo.ts"), "export const x = 1;\n");
      git(wt.path, ["add", "src/foo.ts"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      git(wt.path, ["mv", "src/foo.ts", "work/foo.md"]);
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-m", "rename into work"]);
      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
    } finally {
      clean();
    }
  });

  it("allows identical-tree HEAD moves (empty or reworded bookkeeping)", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/empty";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "f.txt"), "a\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      git(wt.path, ["commit", "--allow-empty", "-m", "docs: bookkeeping stamp"]);
      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(true);
    } finally {
      clean();
    }
  });

  it("still fails when HEAD drift mixes task files with source (#0600)", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/mixed";
      const wt = ensureWorktree(root, branch);
      mkdirSync(join(wt.path, "work"), { recursive: true });
      writeFileSync(join(wt.path, "f.txt"), "a\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      writeFileSync(join(wt.path, "work", "0600-x.md"), "---\nid: 0600\n---\n");
      writeFileSync(join(wt.path, "f.txt"), "b\n");
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-m", "mixed"]);
      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
    } finally {
      clean();
    }
  });

  it("discard resets the worktree to the handoff commit", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/discard";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "g.txt"), "v1\n");
      git(wt.path, ["add", "g.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      writeHandoffSnapshot(root, ".repoos", {
        taskId: "d2",
        branch,
        sha,
        at: "2026-09-30T00:00:00Z",
        clean: true,
      });
      writeFileSync(join(wt.path, "g.txt"), "v1\n// stray\n");
      const discarded = await discardWorktreeHandoffChanges(config, "d2", branch);
      expect(discarded.ok).toBe(true);
      expect(readFileSync(join(wt.path, "g.txt"), "utf8")).toBe("v1\n");
    } finally {
      clean();
    }
  });

  it("refuses runner spawns in a locked review worktree", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "feat/x";
      const wt = ensureWorktree(root, branch);
      writeWorktreeReviewLock(root, ".repoos", "1", {
        status: "review",
        sha: "abc",
        at: "2026-09-30T00:00:00Z",
      });
      const reason = worktreeReviewLockRefusal(root, ".repoos", wt.path, "1", "review", branch);
      expect(reason).toMatch(/locked while it is in review/i);
      expect(
        worktreeReviewLockRefusal(root, ".repoos", wt.path, "1", "active", branch),
      ).toBeUndefined();
    } finally {
      clean();
    }
  });

  it("fails sync before the gate when the worktree changed after handoff", async () => {
    const { root, clean } = makeRepo();
    try {
      const id = "0598-sync";
      const branch = `feat/${id}`;
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "impl.txt"), "ok\n");
      git(wt.path, ["add", "impl.txt"]);
      git(wt.path, ["commit", "-m", "impl"]);
      const handoffSha = git(wt.path, ["rev-parse", "HEAD"]);
      writeHandoffSnapshot(root, ".repoos", {
        taskId: id,
        branch,
        sha: handoffSha,
        at: "2026-09-30T00:00:00Z",
        clean: true,
      });
      writeFileSync(join(wt.path, "impl.txt"), "ok\n// review fix\n");

      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id, branch } as any);
      coordinator.updateJob(id, { handoffSha });

      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
      );
      const result = await orchestrator.processNext();
      expect(result.ok).toBe(false);
      expect(result.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
      const job = coordinator.getJob(id);
      expect(job?.phase).toBe("failed");
      expect(job?.failedPhase).toBe("syncing");
      expect(existsSync(join(root, ".repoos", "integration-jobs", `${id}.json`))).toBe(true);
    } finally {
      clean();
    }
  });

  it("aborts publish when the worktree changes mid-close-out", async () => {
    const { root, clean } = makeRepo();
    try {
      const id = "0598-pub";
      const branch = `feat/${id}`;
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "impl.txt"), "ok\n");
      git(wt.path, ["add", "impl.txt"]);
      git(wt.path, ["commit", "-m", "impl"]);
      const handoffSha = git(wt.path, ["rev-parse", "HEAD"]);
      const mainSha = git(root, ["rev-parse", "main"]);
      const candidateBranch = `repoos/integrate/${id}`;
      const cand = ensureWorktree(root, candidateBranch);
      writeFileSync(join(cand.path, "impl.txt"), "ok\n");
      git(cand.path, ["add", "impl.txt"]);
      git(cand.path, ["commit", "-m", "candidate"]);
      const candidateSha = git(cand.path, ["rev-parse", "HEAD"]);

      writeHandoffSnapshot(root, ".repoos", {
        taskId: id,
        branch,
        sha: handoffSha,
        at: "2026-09-30T00:00:00Z",
        clean: true,
      });

      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id, branch } as any);
      coordinator.updateJob(id, {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha: mainSha,
        branchSha: handoffSha,
        candidateSha,
        handoffSha,
      });

      writeFileSync(join(wt.path, "impl.txt"), "ok\n// mid job\n");

      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
      );
      const result = await orchestrator.processNext();
      expect(result.ok).toBe(false);
      expect(result.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
      expect(git(root, ["rev-parse", "main"])).toBe(mainSha);
    } finally {
      clean();
    }
  });
});
