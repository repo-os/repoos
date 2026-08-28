import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureWorktree,
  worktreeStatus,
  worktreeList,
  branchAheadCounts,
  resolveWorktreeStatuses,
  currentBranch,
} from "../../core/git.js";
import {
  buildIndexAsync,
  readWorktreeDirtyCache,
  writeWorktreeDirtyCache,
} from "../../core/indexer.js";
import { loadConfig } from "../../core/repoos.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-incr-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("branchAheadCounts", () => {
  it("returns the ahead count for every local branch in one call", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/ahead");
      writeFileSync(join(wt.path, "a.txt"), "1\n");
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-m", "c1"]);
      writeFileSync(join(wt.path, "b.txt"), "2\n");
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-m", "c2"]);
      ensureWorktree(root, "feat/level");

      const counts = branchAheadCounts(root, "main");
      expect(counts.get("feat/ahead")).toBe(2);
      expect(counts.get("feat/level")).toBe(0);
    } finally {
      clean();
    }
  });
});

describe("worktreeList", () => {
  it("captures the checked-out HEAD sha per worktree", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/one");
      const head = git(wt.path, ["rev-parse", "HEAD"]);
      const list = worktreeList(root);
      expect(list.get("feat/one")?.path).toBe(wt.path);
      expect(list.get("feat/one")?.head).toBe(head);
    } finally {
      clean();
    }
  });
});

describe("resolveWorktreeStatuses", () => {
  it("matches per-branch worktreeStatus for a mix of branches", async () => {
    const { root, clean } = makeRepo();
    try {
      const dirty = ensureWorktree(root, "feat/dirty");
      writeFileSync(join(dirty.path, "wip.txt"), "draft\n");
      const ahead = ensureWorktree(root, "feat/ahead");
      writeFileSync(join(ahead.path, "x.txt"), "x\n");
      git(ahead.path, ["add", "-A"]);
      git(ahead.path, ["commit", "-m", "work"]);
      ensureWorktree(root, "feat/clean");

      const branches = ["feat/dirty", "feat/ahead", "feat/clean", "feat/ghost"];
      const { statuses } = await resolveWorktreeStatuses(root, branches, {
        baseBranch: currentBranch(root),
      });

      for (const b of branches) {
        expect(statuses.get(b)).toEqual(worktreeStatus(root, b));
      }
      expect(statuses.get("feat/dirty")?.dirty).toBe(true);
      expect(statuses.get("feat/ahead")?.dirty).toBe(true);
      expect(statuses.get("feat/clean")?.dirty).toBe(false);
      expect(statuses.get("feat/ghost")).toEqual({ path: null, dirty: false });
    } finally {
      clean();
    }
  });

  it("reuses cached dirtiness when the worktree HEAD has not moved", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/cached");
      const base = currentBranch(root);

      const first = await resolveWorktreeStatuses(root, ["feat/cached"], {
        baseBranch: base,
        cache: new Map(),
      });
      expect(first.changed).toBe(true);
      expect(first.statuses.get("feat/cached")?.dirty).toBe(false);

      // Make the worktree dirty on disk but DON'T recompute — a cache hit
      // (same HEAD) must return the stale-but-cached clean value.
      writeFileSync(join(wt.path, "sneaky.txt"), "x\n");
      const cachedRun = await resolveWorktreeStatuses(root, ["feat/cached"], {
        baseBranch: base,
        cache: first.cache,
      });
      expect(cachedRun.changed).toBe(false);
      expect(cachedRun.statuses.get("feat/cached")?.dirty).toBe(false);

      // A commit moves HEAD -> cache miss -> fresh status sees the dirt.
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-m", "c"]);
      const freshRun = await resolveWorktreeStatuses(root, ["feat/cached"], {
        baseBranch: base,
        cache: cachedRun.cache,
      });
      expect(freshRun.statuses.get("feat/cached")?.dirty).toBe(true);
    } finally {
      clean();
    }
  });

  it("skipStatus never runs git status and reports ahead-only dirtiness", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/skip");
      writeFileSync(join(wt.path, "wip.txt"), "draft\n"); // uncommitted

      const { statuses } = await resolveWorktreeStatuses(root, ["feat/skip"], {
        baseBranch: currentBranch(root),
        cache: new Map(),
        skipStatus: true,
      });
      // uncommitted change is invisible under skipStatus, and no commits ahead
      expect(statuses.get("feat/skip")?.dirty).toBe(false);
      expect(statuses.get("feat/skip")?.path).toBe(wt.path);
    } finally {
      clean();
    }
  });
});

describe("worktree dirty cache persistence", () => {
  it("round-trips through the cache file", () => {
    const { root, clean } = makeRepo();
    try {
      const config = loadConfig(root);
      expect(readWorktreeDirtyCache(config).size).toBe(0);

      const cache = new Map([["feat/x", { head: "abc123", uncommitted: true }]]);
      writeWorktreeDirtyCache(config, cache);
      expect(existsSync(join(root, config.cacheDir, "worktree-status.json"))).toBe(true);

      const back = readWorktreeDirtyCache(config);
      expect(back.get("feat/x")).toEqual({ head: "abc123", uncommitted: true });
    } finally {
      clean();
    }
  });
});

describe("LiveIndex.refreshBranches / reconcileWorktreeStatus", () => {
  it("updates branch/worktree facts synchronously and dirty via the sweep", async () => {
    const { root, clean } = makeRepo();
    try {
      const { LiveIndex } = await import("../../server/live-index.js");
      const config = loadConfig(root);
      const work = join(root, config.workDir);
      execFileSync("mkdir", ["-p", work]);
      writeFileSync(
        join(work, "0001-demo.md"),
        `---\nid: "0001"\ntitle: Demo\nstatus: active\nbranch: feat/demo\n---\nbody\n`,
      );

      const index = new LiveIndex(config);
      index.refreshAll(); // no branch yet
      expect(index.getTask("0001")?.git.branchExists).toBe(false);

      const wt = ensureWorktree(root, "feat/demo");
      index.refreshBranches(); // synchronous: branch/worktree exist now
      expect(index.getTask("0001")?.git.branchExists).toBe(true);
      expect(index.getTask("0001")?.git.worktreeExists).toBe(true);
      expect(index.getTask("0001")?.git.worktreePath).toBe(wt.path);
      expect(index.getTask("0001")?.git.dirty).toBe(false);

      // dirty the worktree; the sweep (kicked off by refreshBranches) catches it
      writeFileSync(join(wt.path, "wip.txt"), "draft\n");
      await index.reconcileWorktreeStatus();
      expect(index.getTask("0001")?.git.dirty).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("buildIndexAsync fastWorktreeStatus", () => {
  it("defers git status but a follow-up full build agrees", async () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["config", "repoos.workDir", "work"]);
      const config = loadConfig(root);
      const workDir = join(root, config.workDir);
      execFileSync("mkdir", ["-p", workDir]);

      // one task with a dirty worktree
      writeFileSync(
        join(workDir, "0001-demo.md"),
        `---\nid: "0001"\ntitle: Demo\nstatus: active\nbranch: feat/demo\n---\nbody\n`,
      );
      const wt = ensureWorktree(root, "feat/demo");
      writeFileSync(join(wt.path, "wip.txt"), "draft\n");

      const fast = await buildIndexAsync(config, { fastWorktreeStatus: true });
      expect(fast.tasks[0].git.dirty).toBe(false); // deferred

      const full = await buildIndexAsync(config); // real status this time
      expect(full.tasks[0].git.dirty).toBe(true);
    } finally {
      clean();
    }
  });
});
