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
import {
  acquireCheckGateLock,
  activeCheckGateForCommitRoot,
  enqueueDeferredBranchCommit,
  flushDeferredBranchCommits,
  readDeferredBranchCommits,
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
});
