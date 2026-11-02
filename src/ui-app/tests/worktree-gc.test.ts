import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ensureWorktree, listWorktrees, removeWorktree } from "../../core/git.js";
import { worktreesDir } from "../../core/config.js";
import { sweepStaleWorktrees, sweepAndWarn, countWorktrees } from "../../core/worktree-gc.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { createJobCoordinator } from "../../server/integration-job.js";

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

function write(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function commitAll(root: string, message: string): void {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
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
  write(wt, "src/unmerged.ts", `export const value = ${JSON.stringify(branch)};\n`);
  commitAll(wt, `${branch} unmerged`);
  return wt;
}

/** A branch + worktree carrying real file changes, not merged into main. */
function worktreeWithFiles(
  root: string,
  main: string,
  branch: string,
  files: Record<string, string>,
): string {
  git(root, ["branch", branch, main]);
  const wt = ensureWorktree(root, branch).path;
  for (const [rel, content] of Object.entries(files)) write(wt, rel, content);
  commitAll(wt, `${branch} work`);
  return wt;
}

function cfg(root: string): RepoOSConfig {
  return { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
}

function task(id: string, branch: string, status: string, extra: Partial<Task> = {}): Task {
  return { id, branch, status, assignee: "ai", ...extra } as unknown as Task;
}

function branches(root: string): Set<string> {
  return new Set(
    listWorktrees(root)
      .map((w) => w.branch)
      .filter(Boolean) as string[],
  );
}

describe("sweepStaleWorktrees — lifecycle rules", () => {
  it.each(["active", "review"])(
    "reports candidate and feature worktrees kept for %s tasks",
    (status) => {
      const { root, clean } = makeRepo();
      try {
        ensureWorktree(root, "repoos/integrate/0009");
        ensureWorktree(root, "feat/live");

        const report = sweepStaleWorktrees(cfg(root), {
          mode: "full",
          dryRun: true,
          tasks: [task("0009", "feat/live", status)],
        });

        expect(report.removedWorktrees).toHaveLength(0);
        expect(
          report.retained
            .map(({ branch, reason }) => [branch, reason])
            .sort(([a], [b]) => a!.localeCompare(b!)),
        ).toEqual([
          ["feat/live", "task agent still active"],
          ["repoos/integrate/0009", "task agent still active"],
        ]);
      } finally {
        clean();
      }
    },
  );

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

      expect(report.retained.map((k) => k.branch)).toContain("feat/done-unmerged");
      expect(report.prunedMetadata).toBe(true);
      expect(report.summary).toEqual({
        candidates: report.removedWorktrees.length,
        retained: report.retained.length,
        external: report.external.length,
      });

      const left = branches(root);
      expect(left.has("feat/live")).toBe(true);
      expect(left.has("feat/done-unmerged")).toBe(true);
      expect(left.has("feat/done")).toBe(false);
      expect(left.has("feat/gone")).toBe(false);
      expect(left.has("other/thing")).toBe(true); // out of scope, untouched

      // External worktrees are reported separately, never treated as candidates.
      expect(report.external).toContainEqual(
        expect.objectContaining({
          branch: "other/thing",
          reason: "outside RepoOS's managed worktree directory",
        }),
      );
      expect(report.removedWorktrees.every((w) => w.branch !== "other/thing")).toBe(true);
      expect(report.retained.every((w) => w.branch !== "other/thing")).toBe(true);

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
  }, 20_000);

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

  it("reclaims a done branch whose content landed without its commits being ancestors", () => {
    const { root, main, clean } = makeRepo();
    try {
      const wt = worktreeWithFiles(root, main, "feat/squashed", {
        "src/a.ts": "export const a = 1;\n",
      });
      // Land the same content on main under a different commit (squash/rebase).
      git(root, ["commit", "--allow-empty", "-m", "main moves on"]);
      const sha = git(wt, ["rev-parse", "HEAD"]);
      git(root, ["cherry-pick", sha]);
      let ancestor = true;
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", sha, main], {
          cwd: root,
          stdio: "ignore",
        });
      } catch {
        ancestor = false;
      }
      expect(ancestor).toBe(false);

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/squashed", "done")],
      });

      expect(report.removedWorktrees).toContainEqual(
        expect.objectContaining({
          branch: "feat/squashed",
          reason: "represented in main and clean",
        }),
      );
      expect(branches(root).has("feat/squashed")).toBe(false);
    } finally {
      clean();
    }
  });

  it("reclaims post-close-out WIP checkpoints via the recorded merged commit", () => {
    const { root, main, clean } = makeRepo();
    try {
      // The landed feature commit.
      const wt = worktreeWithFiles(root, main, "feat/checkpointed", {
        "src/feature.ts": "export const feature = 1;\n",
      });
      const mergedCommit = git(wt, ["rev-parse", "HEAD"]);
      git(root, ["merge", "--no-ff", "-m", "merge feature", "feat/checkpointed"]);

      // A later WIP self-check checkpoint on the branch (#0834) whose content
      // also landed in main through another path.
      write(wt, "src/wip.ts", "export const wip = 2;\n");
      commitAll(wt, "WIP: engineer self-check checkpoint");
      write(root, "src/wip.ts", "export const wip = 2;\n");
      commitAll(root, "land the checkpoint content");

      // Main keeps evolving the original file after the close-out. A full
      // merge-base proof would now fail; the recorded merged commit still proves
      // the only post-merge delta is redundant.
      write(root, "src/feature.ts", "export const feature = 3;\n");
      commitAll(root, "main evolves the feature");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/checkpointed", "done", { mergedCommit })],
      });

      expect(report.removedWorktrees).toContainEqual(
        expect.objectContaining({
          branch: "feat/checkpointed",
          reason: "represented in main and clean",
        }),
      );
      expect(branches(root).has("feat/checkpointed")).toBe(false);
    } finally {
      clean();
    }
  });

  it("keeps a done branch with source changes not represented in main", () => {
    const { root, main, clean } = makeRepo();
    try {
      worktreeWithFiles(root, main, "feat/unlanded", {
        "src/a.ts": "export const a = 1;\n",
      });

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/unlanded", "done")],
      });

      expect(report.retained).toContainEqual(
        expect.objectContaining({
          branch: "feat/unlanded",
          reason: expect.stringContaining("not in main"),
        }),
      );
      expect(branches(root).has("feat/unlanded")).toBe(true);
    } finally {
      clean();
    }
  });

  it("keeps a done branch holding a task file main does not have", () => {
    const { root, main, clean } = makeRepo();
    try {
      write(root, "work/0000-existing.md", "existing task\n");
      commitAll(root, "existing task");
      worktreeWithFiles(root, main, "feat/unique-task", {
        "work/0001-new-task.md": "unique task data\n",
      });

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/unique-task", "done")],
      });

      expect(report.retained).toContainEqual(
        expect.objectContaining({
          branch: "feat/unique-task",
          reason: expect.stringContaining("task file not on"),
        }),
      );
      expect(branches(root).has("feat/unique-task")).toBe(true);
    } finally {
      clean();
    }
  });

  it("reclaims task-file-only dirt that is byte-identical to main", () => {
    const { root, main, clean } = makeRepo();
    try {
      write(root, "work/0001-done.md", "body A\n");
      commitAll(root, "task A");
      const wt = mergedWorktree(root, main, "feat/done");

      // Main's canonical task file advances; the worktree holds a stale dirty
      // copy that happens to be main's exact bytes.
      write(root, "work/0001-done.md", "body B\n");
      commitAll(root, "task B");
      write(wt, "work/0001-done.md", "body B\n");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/done", "done")],
      });

      expect(report.removedWorktrees).toContainEqual(
        expect.objectContaining({
          branch: "feat/done",
          reason: "merged into main; dirty task-file changes match main",
        }),
      );
      expect(branches(root).has("feat/done")).toBe(false);
    } finally {
      clean();
    }
  });

  it("keeps task-file-only dirt holding unique task data", () => {
    const { root, main, clean } = makeRepo();
    try {
      write(root, "work/0001-done.md", "body A\n");
      commitAll(root, "task A");
      const wt = mergedWorktree(root, main, "feat/done");
      write(wt, "work/0001-done.md", "unique local note\n");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/done", "done")],
      });

      expect(report.retained).toContainEqual(
        expect.objectContaining({
          branch: "feat/done",
          reason: expect.stringContaining("unique data"),
          dirtyPaths: ["work/0001-done.md"],
        }),
      );
      expect(branches(root).has("feat/done")).toBe(true);
    } finally {
      clean();
    }
  });

  it("keeps dirty source files even when the branch is merged", () => {
    const { root, main, clean } = makeRepo();
    try {
      const wt = mergedWorktree(root, main, "feat/done");
      write(wt, "src/a.ts", "export const a = 1;\n");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/done", "done")],
      });

      expect(report.retained).toContainEqual(
        expect.objectContaining({
          branch: "feat/done",
          dirtyPaths: ["src/a.ts"],
        }),
      );
      expect(branches(root).has("feat/done")).toBe(true);
    } finally {
      clean();
    }
  });

  it("keeps archived unmerged work but reclaims archived work represented in main", () => {
    const { root, main, clean } = makeRepo();
    try {
      unmergedWorktree(root, main, "feat/archived-unmerged");

      const wt = worktreeWithFiles(root, main, "feat/archived-landed", {
        "src/b.ts": "export const b = 2;\n",
      });
      git(root, ["commit", "--allow-empty", "-m", "main moves on"]);
      const sha = git(wt, ["rev-parse", "HEAD"]);
      git(root, ["cherry-pick", sha]);

      const tasks = [
        task("0001", "feat/archived-unmerged", "ready", { isArchived: true }),
        task("0002", "feat/archived-landed", "ready", { isArchived: true }),
      ];
      const report = sweepStaleWorktrees(cfg(root), { mode: "full", tasks });

      expect(report.retained).toContainEqual(
        expect.objectContaining({
          branch: "feat/archived-unmerged",
          reason: expect.stringContaining("not in main"),
        }),
      );
      expect(report.removedWorktrees).toContainEqual(
        expect.objectContaining({ branch: "feat/archived-landed" }),
      );
      expect(branches(root).has("feat/archived-unmerged")).toBe(true);
      expect(branches(root).has("feat/archived-landed")).toBe(false);
    } finally {
      clean();
    }
  });

  it("keeps human-assigned work even when merged and clean", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/human");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/human", "done", { assignee: "human" })],
      });

      expect(report.removedWorktrees).toHaveLength(0);
      expect(report.retained).toContainEqual(
        expect.objectContaining({ branch: "feat/human", reason: "human-assigned task" }),
      );
      expect(branches(root).has("feat/human")).toBe(true);
    } finally {
      clean();
    }
  });

  it("keeps active worktrees for tasks that are also archived", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/archived-active");

      const report = sweepStaleWorktrees(cfg(root), {
        mode: "full",
        tasks: [task("0001", "feat/archived-active", "active", { isArchived: true })],
      });

      expect(report.retained).toContainEqual(
        expect.objectContaining({
          branch: "feat/archived-active",
          reason: "task agent still active",
        }),
      );
      expect(branches(root).has("feat/archived-active")).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("sweepStaleWorktrees — integrate-only mode", () => {
  it("derives validating close-out jobs and keeps their candidates by default", () => {
    const { root, clean } = makeRepo();
    try {
      ensureWorktree(root, "repoos/integrate/0009");
      const coordinator = createJobCoordinator(root);
      const activeTask = task("0009", "feat/0009", "done");
      coordinator.enqueue(activeTask);
      coordinator.updateJob("0009", { phase: "validating" });

      for (const mode of ["integrate-only", "full"] as const) {
        for (const dryRun of [false, true]) {
          const report = sweepStaleWorktrees(cfg(root), { mode, dryRun });
          expect(report.removedWorktrees).toHaveLength(0);
          expect(report.retained).toContainEqual(
            expect.objectContaining({
              branch: "repoos/integrate/0009",
              reason: "close-out job still active",
            }),
          );
          expect(branches(root).has("repoos/integrate/0009")).toBe(true);
        }
      }
    } finally {
      clean();
    }
  });

  it.each(["done", "failed"] as const)("removes a candidate whose job is %s", (phase) => {
    const { root, clean } = makeRepo();
    try {
      ensureWorktree(root, "repoos/integrate/0009");
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue(task("0009", "feat/0009", "done"));
      coordinator.updateJob("0009", { phase });
      const report = sweepStaleWorktrees(cfg(root), { mode: "integrate-only" });
      expect(report.removedWorktrees.map((w) => w.branch)).toEqual(["repoos/integrate/0009"]);
    } finally {
      clean();
    }
  });

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
      expect(report.retained.map((k) => k.branch)).toContain("repoos/integrate/0009");
      expect(branches(root).has("repoos/integrate/0009")).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("sweepAndWarn", () => {
  it("runs the safe full sweep automatically and logs candidate/retained/external counts", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/done");
      const liveWt = ensureWorktree(root, "feat/live").path;
      ensureWorktree(root, "repoos/integrate/0009");
      // main + done + live + candidate = 4 registered. The done branch and the
      // candidate are safe; the live task is not.
      const tasks = [task("0001", "feat/done", "done"), task("0002", "feat/live", "active")];

      const logs: Array<{ level: string; msg: string }> = [];
      sweepAndWarn(cfg(root), {
        threshold: 3,
        tasks,
        log: (level, msg) => logs.push({ level, msg }),
      });

      const left = branches(root);
      expect(left.has("repoos/integrate/0009")).toBe(false);
      expect(left.has("feat/done")).toBe(false);
      expect(left.has("feat/live")).toBe(true);
      expect(countWorktrees(root)).toBe(2); // main + live, now below the ceiling

      expect(logs.some((l) => l.level === "info" && l.msg === "worktree gc")).toBe(true);
      // 2 is not > 3, so no warning this run.
      expect(logs.some((l) => l.level === "warn")).toBe(false);
      expect(readFileSync(join(liveWt, ".git"), "utf8")).toContain("gitdir:");
    } finally {
      clean();
    }
  });

  it("warns with the breakdown when still over the ceiling, and stays silent at 0", () => {
    const { root, main, clean } = makeRepo();
    try {
      mergedWorktree(root, main, "feat/live-a");
      mergedWorktree(root, main, "feat/live-b");
      mergedWorktree(root, main, "feat/live-c");
      const tasks = [
        task("0001", "feat/live-a", "active"),
        task("0002", "feat/live-b", "active"),
        task("0003", "feat/live-c", "active"),
      ];

      const over: string[] = [];
      sweepAndWarn(cfg(root), {
        threshold: 2,
        tasks,
        log: (lvl, msg) => lvl === "warn" && over.push(msg),
      });
      expect(over.length).toBe(1);
      expect(over[0]).toMatch(/safe candidate/);
      expect(over[0]).toMatch(/retained/);
      expect(over[0]).toMatch(/outside RepoOS's managed directory/);
      expect(over[0]).toMatch(/repoos gc --dry-run/);

      const off: string[] = [];
      sweepAndWarn(cfg(root), {
        threshold: 0,
        tasks,
        log: (lvl, msg) => lvl === "warn" && off.push(msg),
      });
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
