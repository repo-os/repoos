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

function gitAllowFail(root: string, args: string[]): { status: number; stdout: string } {
  try {
    return { status: 0, stdout: execFileSync("git", args, { cwd: root, encoding: "utf8" }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "" };
  }
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

  it("allows a conflict-free merge of main into the branch after handoff (#0624)", async () => {
    const { root, clean } = makeRepo();
    try {
      // A common base file both sides may touch later.
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/main-sync";
      const wt = ensureWorktree(root, branch);
      mkdirSync(join(wt.path, "work"), { recursive: true });
      writeFileSync(join(wt.path, "impl.txt"), "work\n");
      writeFileSync(join(wt.path, "work", "0624-self.md"), "---\nid: 0624\n---\n");
      git(wt.path, ["add", "impl.txt", "work/0624-self.md"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Main advances with already-landed work (source + another task's file).
      writeFileSync(join(root, "f.txt"), "base\n// main tweak\n");
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(join(root, "work", "0623-other.md"), "---\nid: 0623\n---\n");
      git(root, ["add", "f.txt", "work/0623-other.md"]);
      git(root, ["commit", "-m", "main advance"]);

      // The main-sync merge lands on the branch after handoff.
      git(wt.path, ["merge", "main", "-m", "merge main into feat/main-sync"]);
      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(true);
    } finally {
      clean();
    }
  });

  it("still fails when a post-handoff edit goes beyond what main contains (#0624)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/author-edit";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "impl.txt"), "work\n");
      git(wt.path, ["add", "impl.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Main advances, and the branch syncs it — but the author also edits
      // a source file afterwards.
      writeFileSync(join(root, "f.txt"), "base\n// main tweak\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "main advance"]);
      git(wt.path, ["merge", "main", "-m", "merge main into feat/author-edit"]);
      writeFileSync(join(wt.path, "f.txt"), "base\n// author edit\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "review fix"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
    } finally {
      clean();
    }
  });

  it("still fails when a sync merge's conflict resolution diverges from main (#0624)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/conflicted-sync";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "f.txt"), "task\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Main rewrites the same file; the merge on the branch conflicts and is
      // resolved to content that is neither the task's nor main's.
      writeFileSync(join(root, "f.txt"), "main\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "main rewrite"]);
      const merge = gitAllowFail(wt.path, ["merge", "main"]);
      expect(merge.status).not.toBe(0);
      expect(merge.stdout).toContain("CONFLICT");
      writeFileSync(join(wt.path, "f.txt"), "hand-resolved\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "merge main into feat/conflicted-sync"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
    } finally {
      clean();
    }
  });

  it("still fails when a post-handoff commit changes only a file mode (#0624 review)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/mode-change";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "impl.txt"), "work\n");
      git(wt.path, ["add", "impl.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Content is untouched; only the mode flips.
      git(wt.path, ["update-index", "--chmod=+x", "f.txt"]);
      git(wt.path, ["commit", "-m", "chmod +x"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
    } finally {
      clean();
    }
  });

  it("allows a sync merge whose main parent predates a later main advance (#0624 review)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/main-advanced";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "impl.txt"), "work\n");
      git(wt.path, ["add", "impl.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Main advances, the branch syncs it, and THEN main advances again on
      // the same path — the merge parent is still an ancestor of main.
      writeFileSync(join(root, "f.txt"), "base\n// main tweak\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "main advance"]);
      git(wt.path, ["merge", "main", "-m", "merge main into feat/main-advanced"]);
      writeFileSync(join(root, "f.txt"), "base\n// later main advance\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "later main advance"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(true);
    } finally {
      clean();
    }
  });

  it("still fails when a post-handoff merge brings in a branch main never contained (#0624 review)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/side-merge";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "impl.txt"), "work\n");
      git(wt.path, ["add", "impl.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // A side branch main does not contain; merging it in post-handoff is
      // real drift even though the merge is conflict-free.
      git(root, ["checkout", "-b", "side/wip"]);
      writeFileSync(join(root, "f.txt"), "base\n// side work\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "side work"]);
      git(root, ["checkout", "main"]);
      git(wt.path, ["merge", "side/wip", "-m", "merge side/wip into feat/side-merge"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
    } finally {
      clean();
    }
  });

  it("still fails when a sync merge resolves a conflict by keeping the task's version (#0624 review)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/keep-ours";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "f.txt"), "task\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Main rewrites the same file; the merge conflicts and is resolved by
      // keeping the task side. The path is then unchanged from the merge's
      // first parent, so only the backward check can catch it.
      writeFileSync(join(root, "f.txt"), "main\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "main rewrite"]);
      const merge = gitAllowFail(wt.path, ["merge", "main"]);
      expect(merge.status).not.toBe(0);
      expect(merge.stdout).toContain("CONFLICT");
      git(wt.path, ["checkout", "--ours", "--", "f.txt"]);
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "merge main into feat/keep-ours"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
    } finally {
      clean();
    }
  });

  it("still fails when a sync merge resolves a conflict by keeping main's side (#0624 review)", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "f.txt"), "base\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "base"]);
      const branch = "feat/keep-theirs";
      const wt = ensureWorktree(root, branch);
      writeFileSync(join(wt.path, "f.txt"), "task\n");
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "handoff"]);
      const sha = git(wt.path, ["rev-parse", "HEAD"]);
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;

      // Main rewrites the same file; the merge is resolved by taking main's
      // side, silently discarding the task's reviewed change to f.txt.
      writeFileSync(join(root, "f.txt"), "main\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-m", "main rewrite"]);
      const merge = gitAllowFail(wt.path, ["merge", "main"]);
      expect(merge.status).not.toBe(0);
      expect(merge.stdout).toContain("CONFLICT");
      git(wt.path, ["checkout", "--theirs", "--", "f.txt"]);
      git(wt.path, ["add", "f.txt"]);
      git(wt.path, ["commit", "-m", "merge main into feat/keep-theirs"]);

      const check = await verifyWorktreeHandoffIntegrity(config, branch, sha);
      expect(check.ok).toBe(false);
      expect(check.headMoved).toBe(true);
      expect(check.reason).toContain(WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX);
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
