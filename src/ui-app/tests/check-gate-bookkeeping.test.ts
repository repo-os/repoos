/**
 * Check gate bookkeeping tolerance + lock/defer queue (#1061).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import {
  checkGateHeadDriftAllowed,
  isCheckGateBookkeepingPath,
} from "../../core/check-gate-bookkeeping.js";
import { engineerSelfCheckCheckpointMessage } from "../../core/engineer-checkpoint-commit.js";
import {
  runGit,
  setCheckGateGitRefusal,
  setCheckGateWorktreeWriteRefusal,
  writeWorktreeSourceFile,
} from "../../core/git.js";
import {
  acquireCheckGateLock,
  activeCheckGateForCommitRoot,
  aliveCheckGateLockForWorktree,
  checkGateEngineerBusyRefusal,
  checkGateSourceWriteRefusal,
  clearCheckGateLock,
  enqueueDeferredBranchCommit,
  flushDeferredBranchCommits,
  readDeferredBranchCommits,
  reconcileDeadCheckGateLock,
  releaseCheckGateLock,
  CHECK_GATE_WRITE_REFUSAL,
} from "../../server/check-gate-lock.js";
import { commitFiles, setCheckGateCommitHook } from "../../core/git.js";
import { installCheckGateCommitHook } from "../../server/check-gate-lock.js";

const roots: string[] = [];

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function cfg(root: string): RepoOSConfig {
  mkdirSync(join(root, "work"), { recursive: true });
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function initRepo(): { root: string; wt: string; branch: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-1061-"));
  roots.push(root);
  const wt = `${root}-wt`;
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "v1\n");
  writeFileSync(join(root, "work", "0001-task.md"), "---\nid: '0001'\n---\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "init"]);
  const branch = "feat/1061";
  git(root, ["branch", branch]);
  git(root, ["worktree", "add", "-q", wt, branch]);
  return { root, wt, branch };
}

afterEach(() => {
  setCheckGateCommitHook(null);
  setCheckGateGitRefusal(null);
  setCheckGateWorktreeWriteRefusal(null);
  delete process.env.REPOOS_CHECK_STORE_ROOT;
  delete process.env.REPOOS_CACHE_DIR;
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("isCheckGateBookkeepingPath (#1061)", () => {
  it("treats work and .repoos as bookkeeping", () => {
    const config = cfg("/tmp");
    expect(isCheckGateBookkeepingPath("work/0001-task.md", config)).toBe(true);
    expect(isCheckGateBookkeepingPath("work/reports/0001/review-1.md", config)).toBe(true);
    expect(isCheckGateBookkeepingPath(".repoos/logs/x", config)).toBe(true);
    expect(isCheckGateBookkeepingPath("src/app.ts", config)).toBe(false);
  });
});

describe("checkGateHeadDriftAllowed (#1061)", () => {
  it("allows bookkeeping-only commits during the gate", async () => {
    const { wt } = initRepo();
    const before = git(wt, ["rev-parse", "HEAD"]);
    mkdirSync(join(wt, "work", "reports", "0001"), { recursive: true });
    writeFileSync(join(wt, "work", "reports", "0001", "review-1.md"), "# ok\n");
    git(wt, ["add", "work/reports/0001/review-1.md"]);
    git(wt, ["commit", "-qm", "docs(0001): record review pass 1"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result).toEqual({ ok: true });
  });

  it("rejects WIP checkpoint commits that touch source paths", async () => {
    const { wt } = initRepo();
    const before = git(wt, ["rev-parse", "HEAD"]);
    writeFileSync(join(wt, "src", "app.ts"), "wip-branch\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", engineerSelfCheckCheckpointMessage("0001")]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.affectingPaths).toContain("src/app.ts");
  });

  it("rejects src changes and names paths", async () => {
    const { wt } = initRepo();
    const before = git(wt, ["rev-parse", "HEAD"]);
    writeFileSync(join(wt, "src", "app.ts"), "v2\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", "feat: tweak app"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/touched/);
      expect(result.reason).toContain("src/app.ts");
      expect(result.affectingPaths).toContain("src/app.ts");
    }
  });

  it("fails closed when path diff is unavailable", async () => {
    const { wt } = initRepo();
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", "notasha", "alsobad");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/could not determine/);
  });
});

describe("check gate lock and deferred commits (#1061)", () => {
  it("defers bookkeeping commits and flushes after release", async () => {
    const { root, wt, branch } = initRepo();
    const config = cfg(root);
    installCheckGateCommitHook(config);
    process.env.REPOOS_CHECK_STORE_ROOT = root;
    const headBefore = git(wt, ["rev-parse", "HEAD"]);
    await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    expect(activeCheckGateForCommitRoot(root, ".repoos", wt)?.taskId).toBe("0001");
    const report = join(wt, "work", "0001-task.md");
    writeFileSync(report, readFileSync(report, "utf8") + "\n");
    const deferred = commitFiles(wt, [report], "docs(0001): update task");
    expect(deferred).toBe(true);
    expect(git(wt, ["rev-parse", "HEAD"])).toBe(headBefore);
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(1);
    await releaseCheckGateLock(root, ".repoos", "0001");
    expect(git(wt, ["rev-parse", "HEAD"])).not.toBe(headBefore);
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(0);
    expect(activeCheckGateForCommitRoot(root, ".repoos", wt)).toBeNull();
  });

  it("refuses non-bookkeeping commits during the gate", async () => {
    const { root, wt, branch } = initRepo();
    const config = cfg(root);
    installCheckGateCommitHook(config);
    process.env.REPOOS_CHECK_STORE_ROOT = root;
    await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    const src = join(wt, "src", "app.ts");
    writeFileSync(src, "v3\n");
    const ok = commitFiles(wt, [src], "feat: blocked");
    expect(ok).toBe(false);
    expect(git(wt, ["show", "HEAD:src/app.ts"])).toBe("v1");
  });

  it("preserves queue entries across flush after stale lock recovery", async () => {
    const { root, wt } = initRepo();
    enqueueDeferredBranchCommit(
      root,
      ".repoos",
      "0001",
      wt,
      [join(wt, "work", "0001-task.md")],
      "docs(0001): queued",
    );
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(1);
    writeFileSync(
      join(wt, "work", "0001-task.md"),
      readFileSync(join(wt, "work", "0001-task.md")) + "\n",
    );
    process.env.REPOOS_CHECK_GATE_INTERNAL = "1";
    try {
      await flushDeferredBranchCommits(root, ".repoos", "0001");
    } finally {
      delete process.env.REPOOS_CHECK_GATE_INTERNAL;
    }
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(0);
    expect(git(wt, ["log", "--oneline", "-1"])).toMatch(/docs\(0001\)/);
  });

  it("exposes the engineer refusal string", () => {
    expect(CHECK_GATE_WRITE_REFUSAL).toMatch(/check is running/i);
  });

  it("blocks runGit commits and worktree writes while the gate is active", async () => {
    const { root, wt, branch } = initRepo();
    const config = cfg(root);
    process.env.REPOOS_CHECK_STORE_ROOT = root;
    installCheckGateCommitHook(config);
    await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    expect(aliveCheckGateLockForWorktree(root, ".repoos", wt)?.taskId).toBe("0001");
    writeFileSync(join(wt, "src", "app.ts"), "mid-gate\n");
    const denied = await runGit(wt, ["add", "src/app.ts"], 10_000);
    expect(denied.stderr).toMatch(/check is running/i);
    expect(denied.status).not.toBe(0);
    expect(() => writeWorktreeSourceFile(wt, join(wt, "src", "app.ts"), "blocked\n")).toThrow(
      CHECK_GATE_WRITE_REFUSAL,
    );
    writeWorktreeSourceFile(
      wt,
      join(wt, "work", "0001-task.md"),
      `${readFileSync(join(wt, "work", "0001-task.md"))}\n`,
    );
    await releaseCheckGateLock(root, ".repoos", "0001");
  });

  it("blocks source writes and allows work bookkeeping paths", async () => {
    const { root, wt, branch } = initRepo();
    const config = cfg(root);
    await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    expect(checkGateSourceWriteRefusal(root, ".repoos", wt, "src/app.ts", config)).toBe(
      CHECK_GATE_WRITE_REFUSAL,
    );
    expect(checkGateSourceWriteRefusal(root, ".repoos", wt, "work/0001-task.md", config)).toBe(
      undefined,
    );
    expect(checkGateEngineerBusyRefusal(root, ".repoos", wt)).toBe(CHECK_GATE_WRITE_REFUSAL);
    await releaseCheckGateLock(root, ".repoos", "0001");
    expect(checkGateEngineerBusyRefusal(root, ".repoos", wt)).toBeUndefined();
  });

  it("uses custom cacheDir for lock and hook paths", async () => {
    const { root, wt, branch } = initRepo();
    const custom = ".cache-alt";
    const config = { ...cfg(root), cacheDir: custom };
    installCheckGateCommitHook(config);
    process.env.REPOOS_CHECK_STORE_ROOT = root;
    process.env.REPOOS_CACHE_DIR = custom;
    await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: custom,
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    const report = join(wt, "work", "0001-task.md");
    writeFileSync(report, readFileSync(report, "utf8") + "\n");
    expect(commitFiles(wt, [report], "docs(0001): custom cache")).toBe(true);
    expect(aliveCheckGateLockForWorktree(root, custom, wt)?.taskId).toBe("0001");
    await releaseCheckGateLock(root, custom, "0001");
    expect(git(wt, ["log", "--oneline", "-1"])).toMatch(/custom cache/);
  });

  it("retains deferred queue entries when a flush commit fails", async () => {
    const { root, wt } = initRepo();
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [], "docs(0001): empty path list");
    process.env.REPOOS_CHECK_GATE_INTERNAL = "1";
    try {
      const result = await flushDeferredBranchCommits(root, ".repoos", "0001");
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(1);
      expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(1);
    } finally {
      delete process.env.REPOOS_CHECK_GATE_INTERNAL;
    }
  });

  it("reconciles a dead lock holder and flushes deferred commits", async () => {
    const { root, wt, branch } = initRepo();
    await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    const lock = aliveCheckGateLockForWorktree(root, ".repoos", wt);
    expect(lock).not.toBeNull();
    if (!lock) return;
    const dead = { ...lock, pid: 2_147_483_647 };
    clearCheckGateLock(root, ".repoos", "0001");
    const { writeFileSync: writeJson, mkdirSync: mkdirCache } = await import("node:fs");
    const { join: joinPath } = await import("node:path");
    const lockDir = joinPath(root, ".repoos", "check-gate-locks");
    mkdirCache(lockDir, { recursive: true });
    writeJson(joinPath(lockDir, "0001.json"), `${JSON.stringify(dead, null, 2)}\n`);
    const report = join(wt, "work", "0001-task.md");
    writeFileSync(report, readFileSync(report, "utf8") + "x");
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [report], "docs(0001): after crash");
    await reconcileDeadCheckGateLock(root, ".repoos", dead);
    expect(aliveCheckGateLockForWorktree(root, ".repoos", wt)).toBeNull();
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(0);
    expect(git(wt, ["log", "--oneline", "-1"])).toMatch(/after crash/);
  });
});
