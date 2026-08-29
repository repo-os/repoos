import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureWorktree, listWorktrees, removeWorktree } from "../../core/git.js";
import { worktreesDir } from "../../core/config.js";
import { sweepStaleWorktrees, sweepAndWarn, countWorktrees } from "../../core/worktree-gc.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; main: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-gc-test-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  const main = git(root, ["branch", "--show-current"]);
  return {
    root,
    main,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktreesDir(root), { recursive: true, force: true });
    },
  };
}

/** A branch with one commit, merged into main, with a linked worktree. */
function mergedWorktree(root: string, main: string, branch: string): string {
  git(root, ["branch", branch, main]);
  const wt = ensureWorktree(root, branch).path;
  execFileSync("git", ["-C", wt, "commit", "--allow-empty", "-m", `${branch} work`]);
  git(root, ["merge", "--no-ff", "-m", `merge ${branch}`, branch]);
  return wt;
}

/** A branch with one unmerged commit and a linked worktree. */
function unmergedWorktree(root: string, main: string, branch: string): string {
  git(root, ["branch", branch, main]);
  const wt = ensureWorktree(root, branch).path;
  execFileSync("git", ["-C", wt, "commit", "--allow-empty", "-m", `${branch} unmerged`]);
  return wt;
}

function cfg(root: string): RepoOSConfig {
  return { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
}

function task(id: string, branch: string, status: string): Task {
  return { id, branch, status } as unknown as Task;
}

function branches(root: string): Set<string> {
  return new Set(
    listWorktrees(root)
      .map((w) => w.branch)
      .filter(Boolean) as string[],
  );
}

describe("sweepStaleWorktrees — full mode", () => {
  it("removes done/absent/integrate/half-deleted worktrees, keeps live and unmerged", () => {
    const { root, main, clean } = makeRepo();
    try {
      const doneWt = mergedWorktree(root, main, "feat/done");
      mergedWorktree(root, main, "feat/absent"); // merged, but no task
      const liveWt = ensureWorktree(root, "feat/live").path;
      unmergedWorktree(root, main, "feat/done-unmerged");
      ensureWorktree(root, "repoos/integrate/0009");
      const goneWt = mergedWorktree(root, main, "feat/gone");
      rmSync(goneWt, { recursive: true, force: true }); // directory vanishes, metadata stays

      // A worktree OUTSIDE worktreesDir(root) — simulates another agent / Claude Code.
      const external = join(root, "external-wt");
      git(root, ["worktree", "add", "-b", "other/thing", external]);

      const tasks = [
        task("0001", "feat/done", "done"),
        task("0002", "feat/live", "active"),
        task("0003", "feat/done-unmerged", "done"),
      ];

      const report = sweepStaleWorktrees(cfg(root), { mode: "full", tasks });

      const removed = new Set(report.removedWorktrees.map((w) => w.branch));
      expect(removed).toContain("feat/done");
      expect(removed).toContain("feat/absent");
      expect(removed).toContain("repoos/integrate/0009");
      expect(removed).toContain("feat/gone");

      expect(report.keptDirty.map((k) => k.branch)).toContain("feat/done-unmerged");
      expect(report.prunedMetadata).toBe(true);

      const left = branches(root);
      expect(left.has("feat/live")).toBe(true);
      expect(left.has("feat/done-unmerged")).toBe(true);
      expect(left.has("feat/done")).toBe(false);
      expect(left.has("feat/gone")).toBe(false);
      expect(left.has("other/thing")).toBe(true); // out of scope, untouched

      // Deleted branches really gone; kept ones still there.
      const allBranches = git(root, ["branch", "--format=%(refname:short)"]).split("\n");
      expect(allBranches).not.toContain("feat/done");
      expect(allBranches).not.toContain("repoos/integrate/0009");
      expect(allBranches).toContain("feat/done-unmerged");

      // Main checkout untouched.
      expect(git(root, ["branch", "--show-current"])).toBe(main);
      expect(doneWt).toBeTruthy();
      expect(liveWt).toBeTruthy();
    } finally {
      clean();
    }
  });

  it("dry run reports the same set but mutates nothing", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/done");
      ensureWorktree(root, "repoos/integrate/0009");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        dryRun: true,
        tasks: [task("0001", "feat/done", "done")],
      });

      expect(report.removedWorktrees.map((w) => w.branch).sort()).toEqual([
        "feat/done",
        "repoos/integrate/0009",
      ]);
      // Nothing actually removed.
      expect(branches(root).has("feat/done")).toBe(true);
      expect(branches(root).has("repoos/integrate/0009")).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("sweepStaleWorktrees — integrate-only mode", () => {
  it("removes only repoos/integrate/* and leaves every feature worktree", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/done");
      ensureWorktree(root, "repoos/integrate/0009");

      const report = sweepStaleWorktrees(cfg(root), { mode: "integrate-only" });

      expect(report.removedWorktrees.map((w) => w.branch)).toEqual(["repoos/integrate/0009"]);
      const left = branches(root);
      expect(left.has("feat/done")).toBe(true);
      expect(left.has("repoos/integrate/0009")).toBe(false);
    } finally {
      clean();
    }
  });

  it("spares a candidate whose close-out job is still active", () => {
    const { root, clean } = makeRepo();
    try {
      ensureWorktree(root, "repoos/integrate/0009");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "integrate-only",
        activeJobIds: new Set(["0009"]),
      });

      expect(report.removedWorktrees).toHaveLength(0);
      expect(report.keptDirty.map((k) => k.branch)).toContain("repoos/integrate/0009");
      expect(branches(root).has("repoos/integrate/0009")).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("sweepAndWarn", () => {
  it("sweeps integrate candidates and logs a threshold warning when over the ceiling", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/live-a");
      mergedWorktree(root, main, "feat/live-b");
      ensureWorktree(root, "repoos/integrate/0009");
      // main + 2 feat + 1 candidate = 4 registered.

      const logs: Array<{ level: string; msg: string }> = [];
      sweepAndWarn(cfg(root), { threshold: 3, log: (level, msg) => logs.push({ level, msg }) });

      // Candidate swept, feature worktrees untouched.
      const left = branches(root);
      expect(left.has("repoos/integrate/0009")).toBe(false);
      expect(left.has("feat/live-a")).toBe(true);
      expect(countWorktrees(root)).toBe(3); // main + 2 feat, now == threshold, not over

      expect(logs.some((l) => l.level === "info" && l.msg === "worktree gc")).toBe(true);
      // 3 is not > 3, so no warning this run.
      expect(logs.some((l) => l.level === "warn")).toBe(false);
    } finally {
      clean();
    }
  });

  it("warns when still over the ceiling after sweeping, and stays silent when threshold is 0", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/a");
      mergedWorktree(root, main, "feat/b");
      mergedWorktree(root, main, "feat/c"); // main + 3 = 4 registered, no candidates

      const over: string[] = [];
      sweepAndWarn(cfg(root), { threshold: 2, log: (lvl, msg) => lvl === "warn" && over.push(msg) });
      expect(over.length).toBe(1);
      expect(over[0]).toMatch(/run `repoos gc`/);

      const off: string[] = [];
      sweepAndWarn(cfg(root), { threshold: 0, log: (lvl, msg) => lvl === "warn" && off.push(msg) });
      expect(off.length).toBe(0);
    } finally {
      clean();
    }
  });
});

describe("removeWorktree heals a half-deleted worktree", () => {
  it("returns true when the directory vanished under a registered worktree", () => {
    const { root, main, clean } = makeRepo();
    try {
      const wt = mergedWorktree(root, main, "feat/x");
      rmSync(wt, { recursive: true, force: true });
      expect(listWorktrees(root).some((w) => w.branch === "feat/x")).toBe(true);

      expect(removeWorktree(root, "feat/x")).toBe(true);
      expect(listWorktrees(root).some((w) => w.branch === "feat/x")).toBe(false);
    } finally {
      clean();
    }
  });
});
