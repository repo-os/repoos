/**
 * Check gate bookkeeping tolerance + lock/defer queue (#1061).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import {
  checkGateHeadDriftAllowed,
  isCheckGateBookkeepingPath,
} from "../../core/check-gate-bookkeeping.js";
import { engineerSelfCheckCheckpointMessage } from "../../core/engineer-checkpoint-commit.js";
import { runGit, setCheckGateGitRefusal } from "../../core/git.js";
import { gitDirectorySnapshot } from "../../core/git-directory-snapshot.js";
import {
  acquireCheckGateLock,
  activeCheckGateForCommitRoot,
  aliveCheckGateLockForWorktree,
  checkGateEngineerBusyRefusal,
  clearCheckGateLock,
  enqueueDeferredBranchCommit,
  flushDeferredBranchCommits,
  readDeferredBranchCommits,
  reconcileDeadCheckGateLock,
  recoverStaleCheckGateLocks,
  releaseCheckGateLock,
  CHECK_GATE_WRITE_REFUSAL,
} from "../../server/check-gate-lock.js";
import { commitFiles, setCheckGateCommitHook } from "../../core/git.js";
import { installCheckGateCommitHook } from "../../server/check-gate-lock.js";
import { trackedSourceSnapshot } from "../../commands/check.js";

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

  it("rejects a source change followed by a revert and names both commits", async () => {
    const { wt } = initRepo();
    const before = git(wt, ["rev-parse", "HEAD"]);
    writeFileSync(join(wt, "src", "app.ts"), "intermediate\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", "feat: temporary source change"]);
    writeFileSync(join(wt, "src", "app.ts"), "v1\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", "revert: restore source"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('"feat: temporary source change"');
      expect(result.reason).toContain('"revert: restore source"');
      expect(result.reason).toContain("src/app.ts");
    }
    expect(git(wt, ["show", `${before}:src/app.ts`])).toBe(
      git(wt, ["show", `${after}:src/app.ts`]),
    );
  });

  it("inspects source commits carried by a merged side branch", async () => {
    const { root, wt } = initRepo();
    const before = git(wt, ["rev-parse", "HEAD"]);
    git(root, ["checkout", "-b", "side-source"]);
    writeFileSync(join(root, "src", "app.ts"), "side change\n");
    git(root, ["add", "src/app.ts"]);
    git(root, ["commit", "-qm", "feat: side branch source"]);
    git(root, ["checkout", "main"]);
    git(wt, ["merge", "--no-ff", "side-source", "-m", "merge side source"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('"merge side source"');
      expect(result.reason).toContain("src/app.ts");
    }
  });

  it("compares merge commits against the checked branch first parent", async () => {
    const { root, wt } = initRepo();
    writeFileSync(join(wt, "src", "app.ts"), "checked branch source\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", "feat: source before gate"]);
    const before = git(wt, ["rev-parse", "HEAD"]);
    git(root, ["checkout", "-b", "side-bookkeeping"]);
    mkdirSync(join(root, ".repoos"), { recursive: true });
    writeFileSync(join(root, ".repoos", "side-note.json"), "{}\n");
    git(root, ["add", ".repoos/side-note.json"]);
    git(root, ["commit", "-qm", "docs: side bookkeeping"]);
    git(root, ["checkout", "main"]);
    git(wt, ["merge", "--no-ff", "side-bookkeeping", "-m", "merge bookkeeping"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result).toEqual({ ok: true });
  });

  it("accepts a bookkeeping-only merge when the side branch source matches the check-start tree", async () => {
    const { root, wt } = initRepo();
    git(root, ["checkout", "-b", "side-old-source"]);
    writeFileSync(join(root, "src", "app.ts"), "side content\n");
    git(root, ["add", "src/app.ts"]);
    git(root, ["commit", "-qm", "feat: old side source"]);
    writeFileSync(join(root, "work", "side-report.md"), "bookkeeping\n");
    git(root, ["add", "work/side-report.md"]);
    git(root, ["commit", "-qm", "docs: side bookkeeping"]);
    git(wt, ["checkout", "-b", "feat/checked-equivalent"]);
    writeFileSync(join(wt, "src", "app.ts"), "side content\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", "feat: equivalent source already checked"]);
    const before = git(wt, ["rev-parse", "HEAD"]);
    git(wt, ["merge", "--no-ff", "side-old-source", "-m", "merge bookkeeping only"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    expect(git(wt, ["diff", "--name-only", `${before}..${after}`])).toBe("work/side-report.md");
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result).toEqual({ ok: true });
  });

  it("ignores first-parent source commits that were already in the check-start tree's second-parent history", async () => {
    const { root, wt } = initRepo();
    git(root, ["checkout", "-b", "checked-side"]);
    writeFileSync(join(root, "src", "app.ts"), "checked source\n");
    git(root, ["add", "src/app.ts"]);
    git(root, ["commit", "-qm", "feat: source present when check started"]);
    const before = git(root, ["rev-parse", "HEAD"]);

    git(root, ["checkout", "main"]);
    writeFileSync(join(root, "src", "app.ts"), "temporary source\n");
    git(root, ["add", "src/app.ts"]);
    git(root, ["commit", "-qm", "feat: old first-parent source change"]);
    writeFileSync(join(root, "src", "app.ts"), "v1\n");
    git(root, ["add", "src/app.ts"]);
    git(root, ["commit", "-qm", "revert: old first-parent source change"]);
    mkdirSync(join(root, "work", "reports", "0001"), { recursive: true });
    writeFileSync(join(root, "work", "reports", "0001", "note.md"), "bookkeeping\n");
    git(root, ["add", "work/reports/0001/note.md"]);
    git(root, ["commit", "-qm", "docs: first-parent bookkeeping"]);

    git(wt, ["checkout", "-B", "feat/1061", "main"]);
    git(wt, ["merge", "--no-ff", "checked-side", "-m", "merge checked tree"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result).toEqual({ ok: true });
  });

  it("rejects a source delta introduced by a merge whose second parent is the check-start commit", async () => {
    const { root, wt } = initRepo();
    git(root, ["checkout", "-b", "checked-side"]);
    writeFileSync(join(root, "src", "app.ts"), "checked source\n");
    git(root, ["add", "src/app.ts"]);
    git(root, ["commit", "-qm", "feat: source present when check started"]);
    const before = git(root, ["rev-parse", "HEAD"]);

    git(root, ["checkout", "main"]);
    mkdirSync(join(root, "work", "reports", "0001"), { recursive: true });
    writeFileSync(join(root, "work", "reports", "0001", "note.md"), "bookkeeping\n");
    git(root, ["add", "work/reports/0001/note.md"]);
    git(root, ["commit", "-qm", "docs: first-parent bookkeeping"]);
    writeFileSync(join(root, "src", "added.ts"), "source drift\n");
    git(root, ["add", "src/added.ts"]);
    git(root, ["commit", "-qm", "feat: first-parent source drift"]);

    git(wt, ["checkout", "-B", "feat/1061", "main"]);
    git(wt, ["merge", "--no-ff", "checked-side", "-m", "merge checked tree"]);
    const after = git(wt, ["rev-parse", "HEAD"]);
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('"merge checked tree"');
      expect(result.reason).toContain("src/added.ts");
    }
  });

  it("fails closed when path diff is unavailable", async () => {
    const { wt } = initRepo();
    const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", "notasha", "alsobad");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/could not be inspected|paths unavailable/);
  });

  it("fails closed with net source paths when history cannot explain the diff", async () => {
    const { wt } = initRepo();
    const before = git(wt, ["rev-parse", "HEAD"]);
    writeFileSync(join(wt, "src", "app.ts"), "unexplained drift\n");
    git(wt, ["add", "src/app.ts"]);
    git(wt, ["commit", "-qm", "feat: source drift"]);
    const after = git(wt, ["rev-parse", "HEAD"]);

    const bin = mkdtempSync(join(tmpdir(), "repoos-1061-git-bin-"));
    roots.push(bin);
    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const escapedGit = `'${realGit.replaceAll("'", "'\\''")}'`;
    const fakeGit = join(bin, "git");
    writeFileSync(
      fakeGit,
      `#!/bin/sh\nif [ "$1" = "rev-list" ] && [ "$2" = "--first-parent" ]; then exit 0; fi\nexec ${escapedGit} "$@"\n`,
    );
    chmodSync(fakeGit, 0o755);
    const previousPath = process.env.PATH;
    process.env.PATH = `${bin}:${previousPath ?? ""}`;
    try {
      const result = await checkGateHeadDriftAllowed(wt, cfg(wt), "0001", before, after);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("history could not be explained");
        expect(result.reason).toContain("src/app.ts");
        expect(result.affectingPaths).toContain("src/app.ts");
      }
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });
});

describe("tracked source snapshots for non-regular entries (#1061)", () => {
  it("snapshots a tracked gitlink directory by its checked-out commit", async () => {
    const { wt } = initRepo();
    const dependency = join(wt, "src", "dependency");
    mkdirSync(dependency);
    git(dependency, ["init", "-q"]);
    git(dependency, ["config", "user.email", "t@example.com"]);
    git(dependency, ["config", "user.name", "Test"]);
    writeFileSync(join(dependency, "lib.ts"), "export {};\n");
    git(dependency, ["add", "lib.ts"]);
    git(dependency, ["commit", "-qm", "dependency"]);
    git(wt, ["add", "src/dependency"]);
    git(wt, ["commit", "-qm", "add dependency"]);

    const snapshot = await trackedSourceSnapshot(wt, cfg(wt));
    expect(snapshot?.get("src/dependency")).toBe(
      `repository:${statSync(dependency).mode & 0o777}:${git(dependency, ["rev-parse", "HEAD"])}:`,
    );
  });

  it("uses the index gitlink SHA when the submodule is uninitialized", async () => {
    const { wt } = initRepo();
    const dependency = join(wt, "src", "dependency");
    mkdirSync(dependency);
    git(dependency, ["init", "-q"]);
    git(dependency, ["config", "user.email", "t@example.com"]);
    git(dependency, ["config", "user.name", "Test"]);
    writeFileSync(join(dependency, "lib.ts"), "export {};\n");
    git(dependency, ["add", "lib.ts"]);
    git(dependency, ["commit", "-qm", "dependency"]);
    const expected = git(dependency, ["rev-parse", "HEAD"]);
    git(wt, ["add", "src/dependency"]);
    git(wt, ["commit", "-qm", "add dependency"]);
    rmSync(join(dependency, ".git"), { recursive: true, force: true });

    const snapshot = await trackedSourceSnapshot(wt, cfg(wt));
    expect(snapshot?.get("src/dependency")).toBe(`gitlink:${expected}`);
    writeFileSync(join(wt, "work", "bookkeeping.md"), "ok\n");
    git(wt, ["add", "work/bookkeeping.md"]);
    git(wt, ["commit", "-qm", "record bookkeeping"]);
    expect(await trackedSourceSnapshot(wt, cfg(wt))).toEqual(snapshot);
  });

  it("detects dirty files inside an initialized submodule", async () => {
    const { wt } = initRepo();
    const dependency = join(wt, "src", "dependency");
    mkdirSync(dependency);
    git(dependency, ["init", "-q"]);
    git(dependency, ["config", "user.email", "t@example.com"]);
    git(dependency, ["config", "user.name", "Test"]);
    writeFileSync(join(dependency, "lib.ts"), "export {};\n");
    git(dependency, ["add", "lib.ts"]);
    git(dependency, ["commit", "-qm", "dependency"]);
    git(wt, ["add", "src/dependency"]);
    git(wt, ["commit", "-qm", "add dependency"]);

    const before = await trackedSourceSnapshot(wt, cfg(wt));
    writeFileSync(join(dependency, "lib.ts"), "export const changed = true;\n");
    const after = await trackedSourceSnapshot(wt, cfg(wt));
    expect(after?.get("src/dependency")).not.toBe(before?.get("src/dependency"));
  });

  it("snapshots an untracked nested repository with no commits", async () => {
    const { wt } = initRepo();
    const nested = join(wt, "src", "nested");
    mkdirSync(nested);
    git(nested, ["init", "-q"]);
    writeFileSync(join(nested, "new.ts"), "export {};\n");

    const snapshot = await trackedSourceSnapshot(wt, cfg(wt));
    expect(snapshot).not.toBeNull();
    expect([...snapshot!.keys()].some((path) => path.startsWith("src/nested"))).toBe(true);
    expect(await gitDirectorySnapshot(wt, "src/nested")).toMatch(/^repository::unborn:/);
  });

  it("snapshots a tracked symlink without following its target", async () => {
    const { wt } = initRepo();
    const outside = join(wt, "..", "outside-target.ts");
    writeFileSync(outside, "outside\n");
    symlinkSync(outside, join(wt, "src", "outside-link.ts"));
    git(wt, ["add", "src/outside-link.ts"]);
    git(wt, ["commit", "-qm", "add outside link"]);

    const snapshot = await trackedSourceSnapshot(wt, cfg(wt));
    expect(snapshot?.get("src/outside-link.ts")).toBe(`symlink:${outside}`);
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

  it("persists original source modes in the lock before making files read-only", async () => {
    const { root, wt, branch } = initRepo();
    const source = join(wt, "src", "app.ts");
    const originalMode = statSync(source).mode & 0o777;
    const acquired = await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    expect(acquired.ok).toBe(true);
    const lock = readFileSync(join(root, ".repoos", "check-gate-locks", "0001.json"), "utf8");
    expect(JSON.parse(lock).protectedFileModes[source]).toBe(originalMode);
    expect(statSync(source).mode & 0o222).toBe(0);
    if (acquired.ok) await acquired.release();
    expect(statSync(source).mode & 0o777).toBe(originalMode);
  });

  it("does not chmod a tracked symlink target outside the worktree", async () => {
    const { root, wt, branch } = initRepo();
    const outside = join(root, "outside.ts");
    writeFileSync(outside, "outside\n", { mode: 0o644 });
    const link = join(wt, "src", "outside.ts");
    symlinkSync(outside, link);
    git(wt, ["add", "src/outside.ts"]);
    git(wt, ["commit", "-qm", "add outside symlink"]);
    const originalMode = statSync(outside).mode & 0o777;

    const acquired = await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    expect(acquired.ok).toBe(true);
    expect(statSync(outside).mode & 0o777).toBe(originalMode);
    if (acquired.ok) await acquired.release();
    expect(statSync(outside).mode & 0o777).toBe(originalMode);
  });

  it("restores source modes if protection fails after the durable lock write", async () => {
    const { root, wt, branch } = initRepo();
    const source = join(wt, "src", "app.ts");
    const secondSource = join(wt, "src", "second.ts");
    writeFileSync(secondSource, "v1\n");
    git(wt, ["add", "src/second.ts"]);
    git(wt, ["commit", "-qm", "second source"]);
    const originalMode = statSync(source).mode & 0o777;
    const secondOriginalMode = statSync(secondSource).mode & 0o777;
    let injected = false;
    const protectionChmod: typeof chmodSync = (path, mode) => {
      if (!injected && String(path) === secondSource) {
        injected = true;
        throw Object.assign(new Error("simulated crash window"), { code: "EIO" });
      }
      return chmodSync(path, mode);
    };
    await expect(
      acquireCheckGateLock({
        boardRoot: root,
        cacheDir: ".repoos",
        taskId: "0001",
        branch,
        worktree: wt,
        kind: "handoff-finalize",
        protectionChmod,
      }),
    ).rejects.toThrow("simulated crash window");
    expect(injected).toBe(true);
    expect(statSync(source).mode & 0o777).toBe(originalMode);
    expect(statSync(secondSource).mode & 0o777).toBe(secondOriginalMode);
    expect(existsSync(join(root, ".repoos", "check-gate-locks", "0001.json"))).toBe(false);
  });

  it("keeps concurrent gate holders when they acquire from separate calls", async () => {
    const { root, wt, branch } = initRepo();
    const args = {
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize" as const,
    };
    const [first, second] = await Promise.all([
      acquireCheckGateLock(args),
      acquireCheckGateLock({ ...args, kind: "merge-gate" }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(aliveCheckGateLockForWorktree(root, ".repoos", wt)?.holders).toHaveLength(2);
    if (first.ok) await first.release();
    if (second.ok) await second.release();
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
    expect(statSync(src).mode & 0o222).toBe(0);
    expect(() => writeFileSync(src, "v3\n")).toThrow();
    const ok = commitFiles(wt, [src], "feat: blocked");
    expect(ok).toBe(false);
    expect(git(wt, ["show", "HEAD:src/app.ts"])).toBe("v1");
    await releaseCheckGateLock(root, ".repoos", "0001");
    expect(statSync(src).mode & 0o222).not.toBe(0);
  });

  it("preserves queue entries across flush after stale lock recovery", async () => {
    const { root, wt } = initRepo();
    const taskFile = join(wt, "work", "0001-task.md");
    writeFileSync(taskFile, readFileSync(taskFile, "utf8") + "\n");
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): queued");
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(1);
    process.env.REPOOS_CHECK_GATE_INTERNAL = "1";
    try {
      await flushDeferredBranchCommits(root, ".repoos", "0001");
    } finally {
      delete process.env.REPOOS_CHECK_GATE_INTERNAL;
    }
    expect(readDeferredBranchCommits(root, ".repoos", "0001").length).toBe(0);
    expect(git(wt, ["log", "--oneline", "-1"])).toMatch(/docs\(0001\)/);
  });

  it("reclaims an old state mutex directory left without its pid file", () => {
    const { root, wt } = initRepo();
    const mutex = join(root, ".repoos", "check-gate-state", "0001");
    mkdirSync(mutex, { recursive: true });
    const staleAt = new Date(Date.now() - 60_000);
    utimesSync(mutex, staleAt, staleAt);
    const taskFile = join(wt, "work", "0001-task.md");
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): recover");
    expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(1);
  });

  it("replays repeated writes to one bookkeeping file as ordered commits", async () => {
    const { root, wt } = initRepo();
    const taskFile = join(wt, "work", "0001-task.md");
    const original = readFileSync(taskFile, "utf8");
    writeFileSync(taskFile, `${original}\nfirst`);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): first");
    writeFileSync(taskFile, `${original}\nfirst\nsecond`);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): second");
    await flushDeferredBranchCommits(root, ".repoos", "0001");
    expect(git(wt, ["log", "-2", "--format=%s"]).split("\n")).toEqual([
      "docs(0001): second",
      "docs(0001): first",
    ]);
    expect(readFileSync(taskFile, "utf8")).toBe(`${original}\nfirst\nsecond`);
  });

  it("persists replay progress and resumes from the intermediate snapshot after a failed entry", async () => {
    const { root, wt } = initRepo();
    const taskFile = join(wt, "work", "0001-task.md");
    const original = readFileSync(taskFile, "utf8");
    writeFileSync(taskFile, `${original}\nfirst`);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): first");
    writeFileSync(taskFile, `${original}\nfirst\nsecond`);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): second");
    setCheckGateCommitHook(({ message }) => (message.endsWith("second") ? "refuse" : "proceed"));
    const firstFlush = await flushDeferredBranchCommits(root, ".repoos", "0001");
    expect(firstFlush).toMatchObject({ ok: false, remaining: 1 });
    expect(git(wt, ["log", "-1", "--format=%s"])).toBe("docs(0001): first");
    expect(readFileSync(taskFile, "utf8")).toBe(`${original}\nfirst`);
    expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(1);

    // A later RepoOS write may arrive after partial replay. It replaces the
    // on-disk task file with the latest queued content; recovery must fence on
    // that content while still replaying the older entry first.
    writeFileSync(taskFile, `${original}\nfirst\nsecond\nthird`);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): third");

    setCheckGateCommitHook(null);
    const resumed = await flushDeferredBranchCommits(root, ".repoos", "0001");
    expect(resumed).toEqual({ ok: true, remaining: 0 });
    expect(git(wt, ["log", "-3", "--format=%s"]).split("\n")).toEqual([
      "docs(0001): third",
      "docs(0001): second",
      "docs(0001): first",
    ]);
    expect(readFileSync(taskFile, "utf8")).toBe(`${original}\nfirst\nsecond\nthird`);
  });

  it("queues new production bookkeeping writes behind entries left after partial replay", async () => {
    const { root, wt, branch } = initRepo();
    const config = cfg(root);
    installCheckGateCommitHook(config);
    process.env.REPOOS_CHECK_STORE_ROOT = root;
    const taskFile = join(wt, "work", "0001-task.md");
    const original = readFileSync(taskFile, "utf8");
    const acquired = await acquireCheckGateLock({
      boardRoot: root,
      cacheDir: ".repoos",
      taskId: "0001",
      branch,
      worktree: wt,
      kind: "handoff-finalize",
    });
    expect(acquired.ok).toBe(true);

    writeFileSync(taskFile, `${original}\nfirst`);
    expect(commitFiles(wt, [taskFile], "docs(0001): first")).toBe(true);
    writeFileSync(taskFile, `${original}\nfirst\nsecond`);
    expect(commitFiles(wt, [taskFile], "docs(0001): second")).toBe(true);

    // Fail only the second actual replayed git commit, after the first one has
    // committed and the holder release has converted the lock into a pending
    // replay fence.
    const hooks = join(root, "failing-hooks");
    mkdirSync(hooks, { recursive: true });
    const preCommit = join(hooks, "pre-commit");
    writeFileSync(
      preCommit,
      "#!/bin/sh\nif grep -q 'second$' work/0001-task.md; then exit 1; fi\nexit 0\n",
    );
    chmodSync(preCommit, 0o755);
    git(wt, ["config", "core.hooksPath", hooks]);

    if (acquired.ok) await acquired.release();
    expect(git(wt, ["log", "-1", "--format=%s"])).toBe("docs(0001): first");
    expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(1);

    // A fresh server bookkeeping write must be deferred behind the failed
    // entry; it cannot commit around the pending replay fence.
    writeFileSync(taskFile, `${original}\nfirst\nsecond\nthird`);
    expect(commitFiles(wt, [taskFile], "docs(0001): third")).toBe(true);
    expect(git(wt, ["log", "-1", "--format=%s"])).toBe("docs(0001): first");
    expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(2);

    git(wt, ["config", "--unset", "core.hooksPath"]);
    await recoverStaleCheckGateLocks(root, ".repoos");
    expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(0);
    expect(git(wt, ["log", "-3", "--format=%s"]).split("\n")).toEqual([
      "docs(0001): third",
      "docs(0001): second",
      "docs(0001): first",
    ]);
    expect(readFileSync(taskFile, "utf8")).toBe(`${original}\nfirst\nsecond\nthird`);
  });

  it("restores queued deletions as absent files", async () => {
    const { root, wt } = initRepo();
    const taskFile = join(wt, "work", "0001-task.md");
    const original = readFileSync(taskFile, "utf8");
    writeFileSync(taskFile, `${original}\nfirst`);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): first");
    rmSync(taskFile);
    enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): delete");
    await flushDeferredBranchCommits(root, ".repoos", "0001");
    expect(() => readFileSync(taskFile, "utf8")).toThrow();
    expect(git(wt, ["log", "-2", "--format=%s"]).split("\n")).toEqual([
      "docs(0001): delete",
      "docs(0001): first",
    ]);
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
    expect(() => writeFileSync(join(wt, "src", "app.ts"), "mid-gate\n")).toThrow();
    const denied = await runGit(wt, ["add", "src/app.ts"], 10_000);
    expect(denied.stderr).toMatch(/check is running/i);
    expect(denied.status).not.toBe(0);
    const taskFile = join(wt, "work", "0001-task.md");
    writeFileSync(taskFile, `${readFileSync(taskFile, "utf8")}\n`);
    expect(commitFiles(wt, [taskFile], "docs(0001): bookkeeping during gate")).toBe(true);
    await releaseCheckGateLock(root, ".repoos", "0001");
    expect(git(wt, ["log", "-1", "--format=%s"])).toBe("docs(0001): bookkeeping during gate");
  });

  it("refuses a new engineer turn while the production gate is active", async () => {
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

  it.each(["holder release", "process release", "stale-lock recovery"] as const)(
    "keeps the lock fence and queued commits when %s cannot flush",
    async (releasePath) => {
      const { root, wt, branch } = initRepo();
      const acquired = await acquireCheckGateLock({
        boardRoot: root,
        cacheDir: ".repoos",
        taskId: "0001",
        branch,
        worktree: wt,
        kind: "handoff-finalize",
      });
      expect(acquired.ok).toBe(true);
      const taskFile = join(wt, "work", "0001-task.md");
      writeFileSync(taskFile, `${readFileSync(taskFile, "utf8")}queued\n`);
      enqueueDeferredBranchCommit(root, ".repoos", "0001", wt, [taskFile], "docs(0001): queued");
      let staleLock: Awaited<ReturnType<typeof aliveCheckGateLockForWorktree>> | null = null;
      if (releasePath === "stale-lock recovery") {
        const current = aliveCheckGateLockForWorktree(root, ".repoos", wt);
        expect(current).not.toBeNull();
        if (!current) return;
        staleLock = {
          ...current,
          holders: current.holders.map((holder) => ({ ...holder, pid: 2_147_483_647 })),
        };
        const lockFile = join(root, ".repoos", "check-gate-locks", "0001.json");
        writeFileSync(lockFile, `${JSON.stringify(staleLock, null, 2)}\n`);
      }
      setCheckGateCommitHook(() => "refuse");
      if (releasePath === "holder release" && acquired.ok) await acquired.release();
      else if (releasePath === "process release")
        await releaseCheckGateLock(root, ".repoos", "0001");
      else if (staleLock) await reconcileDeadCheckGateLock(root, ".repoos", staleLock);

      const pending = aliveCheckGateLockForWorktree(root, ".repoos", wt);
      expect(pending?.flushPending).toBe(true);
      expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(1);

      // The empty pending holder still fences the worktree: new RepoOS
      // bookkeeping joins the durable queue instead of passing through.
      setCheckGateCommitHook(null);
      process.env.REPOOS_CHECK_STORE_ROOT = root;
      installCheckGateCommitHook(cfg(root));
      writeFileSync(taskFile, `${readFileSync(taskFile, "utf8")}later\n`);
      expect(commitFiles(wt, [taskFile], "docs(0001): later")).toBe(true);
      expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(2);

      await reconcileDeadCheckGateLock(root, ".repoos", pending!);
      expect(aliveCheckGateLockForWorktree(root, ".repoos", wt)).toBeNull();
      expect(readDeferredBranchCommits(root, ".repoos", "0001")).toHaveLength(0);
    },
  );

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
    const dead = {
      ...lock,
      holders: lock.holders.map((holder) => ({ ...holder, pid: 2_147_483_647 })),
    };
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
