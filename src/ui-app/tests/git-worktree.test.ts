import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { rmFixture } from "./helpers";
import { join, dirname } from "node:path";
import {
  ensureWorktree,
  worktreeStatus,
  resetWorktree,
  removeWorktree,
  listWorktrees,
  dirtyFiles,
  commitDirtyFiles,
  mergeBranch,
  GitDirtyCheckError,
} from "../../core/git.js";
import { worktreesDir } from "../../core/config.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-wt-test-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

describe("ensureWorktree", () => {
  it("creates a worktree for a new branch without touching the main checkout", () => {
    const { root, clean } = makeRepo();
    try {
      const before = git(root, ["branch", "--show-current"]);

      const res = ensureWorktree(root, "feat/one");

      expect(res.ok).toBe(true);
      expect(res.created).toBe(true);
      expect(res.path).toBe(realpathSync(join(worktreesDir(root), "feat/one")));
      expect(git(root, ["branch", "--show-current"])).toBe(before);
      expect(git(root, ["worktree", "list", "--porcelain"])).toContain(res.path);
    } finally {
      clean();
    }
  });

  it("is idempotent: a second call reuses the same worktree path", () => {
    const { root, clean } = makeRepo();
    try {
      const first = ensureWorktree(root, "feat/one");
      expect(first.ok).toBe(true);

      const second = ensureWorktree(root, "feat/one");

      expect(second.ok).toBe(true);
      expect(second.created).toBe(false);
      expect(second.path).toBe(first.path);
    } finally {
      clean();
    }
  });

  it("reuses an existing worktree for a branch, even on the second start", () => {
    const { root, clean } = makeRepo();
    try {
      const created = ensureWorktree(root, "feat/one");
      expect(created.created).toBe(true);

      const again = ensureWorktree(root, "feat/one");

      expect(again.created).toBe(false);
      expect(again.path).toBe(created.path);
      expect(git(root, ["worktree", "list"]).split("\n").filter(Boolean)).toHaveLength(2);
    } finally {
      clean();
    }
  });

  it("returns the main checkout when the branch is already checked out there", () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["checkout", "-b", "feat/current"]);

      const res = ensureWorktree(root, "feat/current");

      expect(res.ok).toBe(true);
      expect(res.created).toBe(false);
      expect(res.path).toBe(root);
      expect(git(root, ["branch", "--show-current"])).toBe("feat/current");
    } finally {
      clean();
    }
  });

  it("heals a worktree cut before the task's own file landed on main", () => {
    // Reproduces the #0151 incident: a worktree/branch got created (or was
    // left over from an earlier aborted start) from a main HEAD that
    // predates the task file's own commit. Once that worktree exists,
    // reuse alone never notices the task file is missing — every future
    // start/resume would hand the agent (and finalization) a worktree
    // without the very file it's supposed to work from.
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/late-task");
      expect(wt.created).toBe(true);

      // The task file lands on main AFTER the worktree already exists.
      const taskRel = "work/0151-example.md";
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(join(root, taskRel), "status: active\n");
      git(root, ["add", "--", taskRel]);
      git(root, ["commit", "-m", "docs(0151): add task"]);
      expect(existsSync(join(wt.path, taskRel))).toBe(false);

      const resumed = ensureWorktree(root, "feat/late-task", taskRel);

      expect(resumed.ok).toBe(true);
      expect(resumed.created).toBe(false);
      expect(resumed.path).toBe(wt.path);
      expect(existsSync(join(resumed.path, taskRel))).toBe(true);
      expect(readFileSync(join(resumed.path, taskRel), "utf8")).toBe("status: active\n");
      // Healed as a real commit on the worktree's branch, not a dirty file.
      expect(git(resumed.path, ["status", "--porcelain", "--", taskRel])).toBe("");
    } finally {
      clean();
    }
  });

  it("does not touch a worktree that already has its own copy of the task file", () => {
    const { root, clean } = makeRepo();
    try {
      const taskRel = "work/0002-example.md";
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(join(root, taskRel), "status: ready\n");
      git(root, ["add", "--", taskRel]);
      git(root, ["commit", "-m", "docs(0002): add task"]);

      const wt = ensureWorktree(root, "feat/has-file", taskRel);
      expect(wt.created).toBe(true);
      // The worktree's own copy diverges from main after the branch is cut —
      // this must never be overwritten by the heal.
      writeFileSync(join(wt.path, taskRel), "status: active\n");
      git(wt.path, ["add", "--", taskRel]);
      git(wt.path, ["commit", "-m", "docs(0002): update task"]);

      const resumed = ensureWorktree(root, "feat/has-file", taskRel);

      expect(readFileSync(join(resumed.path, taskRel), "utf8")).toBe("status: active\n");
    } finally {
      clean();
    }
  });

  it("fails soft when the directory is not a git repository", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-wt-nogit-"));

    try {
      const res = ensureWorktree(root, "feat/one");

      expect(res.ok).toBe(false);
      expect(res.created).toBe(false);
      expect(res.reason).toMatch(/not a git repository/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("worktreeStatus", () => {
  it("reports no worktree when the branch has none", () => {
    const { root, clean } = makeRepo();
    try {
      expect(worktreeStatus(root, "feat/ghost")).toEqual({ path: null, dirty: false });
    } finally {
      clean();
    }
  });

  it("reports the path and a clean state for a fresh linked worktree", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/one");
      expect(wt.ok).toBe(true);

      const status = worktreeStatus(root, "feat/one");

      expect(status.path).toBe(wt.path);
      expect(status.dirty).toBe(false);
    } finally {
      clean();
    }
  });

  it("marks the worktree dirty when it has uncommitted changes", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/one");
      writeFileSync(join(wt.path, "work-in-progress.txt"), "draft\n");

      const status = worktreeStatus(root, "feat/one");

      expect(status.path).toBe(wt.path);
      expect(status.dirty).toBe(true);
    } finally {
      clean();
    }
  });

  it("marks the worktree dirty when the branch has commits ahead of base", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/one");
      writeFileSync(join(wt.path, "committed.txt"), "done\n");
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-m", "work"]);

      const status = worktreeStatus(root, "feat/one");

      expect(status.dirty).toBe(true);
    } finally {
      clean();
    }
  });

  it("never treats the main checkout as a task worktree", () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["checkout", "-b", "feat/current"]);

      expect(worktreeStatus(root, "feat/current")).toEqual({ path: null, dirty: false });
    } finally {
      clean();
    }
  });
});

describe("resetWorktree", () => {
  it("removes the worktree and branch so the next ensure creates a clean one", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/one");
      writeFileSync(join(wt.path, "work-in-progress.txt"), "draft\n");
      expect(worktreeStatus(root, "feat/one").dirty).toBe(true);

      expect(resetWorktree(root, "feat/one")).toBe(true);

      expect(worktreeStatus(root, "feat/one")).toEqual({ path: null, dirty: false });
      const fresh = ensureWorktree(root, "feat/one");
      expect(fresh.ok).toBe(true);
      expect(fresh.created).toBe(true);
      expect(worktreeStatus(root, "feat/one").dirty).toBe(false);
    } finally {
      clean();
    }
  });

  it("is a no-op success when the branch has no worktree or branch", () => {
    const { root, clean } = makeRepo();
    try {
      expect(resetWorktree(root, "feat/ghost")).toBe(true);
    } finally {
      clean();
    }
  });

  it("refuses to reset the main checkout", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = git(root, ["branch", "--show-current"]);

      expect(resetWorktree(root, branch)).toBe(false);
    } finally {
      clean();
    }
  });
});

describe("removeWorktree", () => {
  it("heals a worktree whose directory was deleted out from under it", () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/one");
      rmSync(wt.path, { recursive: true, force: true });
      // Metadata is still registered until something prunes it.
      expect(listWorktrees(root).some((w) => w.branch === "feat/one")).toBe(true);

      expect(removeWorktree(root, "feat/one")).toBe(true);
      expect(listWorktrees(root).some((w) => w.branch === "feat/one")).toBe(false);
    } finally {
      clean();
    }
  });

  it("is a no-op success when the branch has no worktree", () => {
    const { root, clean } = makeRepo();
    try {
      expect(removeWorktree(root, "feat/ghost")).toBe(true);
    } finally {
      clean();
    }
  });

  it("refuses to remove the main checkout", () => {
    const { root, clean } = makeRepo();
    try {
      const branch = git(root, ["branch", "--show-current"]);
      expect(removeWorktree(root, branch)).toBe(false);
      expect(existsSync(join(root, ".git"))).toBe(true);
    } finally {
      clean();
    }
  });
});

describe("dirtyFiles / commitDirtyFiles (0204)", () => {
  it("reports a clean tree as empty", async () => {
    const { root, clean } = makeRepo();
    try {
      expect(await dirtyFiles(root)).toEqual([]);
    } finally {
      clean();
    }
  });

  it("lists tracked modifications and untracked files in repo-relative form", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "tracked.txt"), "v2\n");
      git(root, ["add", "tracked.txt"]);
      git(root, ["commit", "-m", "add tracked"]);
      writeFileSync(join(root, "tracked.txt"), "dirty\n");
      writeFileSync(join(root, "untracked.txt"), "new\n");

      const files = await dirtyFiles(root);
      expect(files).toContain("tracked.txt");
      expect(files).toContain("untracked.txt");
    } finally {
      clean();
    }
  });

  it("reports a renamed file under its new path", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "old.txt"), "v1\n");
      git(root, ["add", "old.txt"]);
      git(root, ["commit", "-m", "add old"]);
      git(root, ["mv", "old.txt", "new.txt"]);

      const files = await dirtyFiles(root);
      expect(files).toContain("new.txt");
    } finally {
      clean();
    }
  });

  it("commits every dirty file in a single checkpoint commit", async () => {
    const { root, clean } = makeRepo();
    try {
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      writeFileSync(join(root, "tracked.txt"), "v2\n");
      git(root, ["add", "tracked.txt"]);
      git(root, ["commit", "-m", "add tracked"]);
      writeFileSync(join(root, "tracked.txt"), "dirty\n");
      writeFileSync(join(root, "untracked.txt"), "new\n");

      const committed = await commitDirtyFiles(root, "chore: checkpoint before close-out (#0204)");
      expect(committed).toContain("tracked.txt");
      expect(committed).toContain("untracked.txt");
      expect(await dirtyFiles(root)).toEqual([]);
      expect(git(root, ["log", "-1", "--format=%s"])).toBe(
        "chore: checkpoint before close-out (#0204)",
      );
    } finally {
      clean();
    }
  });

  it("is a no-op when the tree is already clean", async () => {
    const { root, clean } = makeRepo();
    try {
      expect(await commitDirtyFiles(root, "checkpoint")).toEqual([]);
    } finally {
      clean();
    }
  });
});

describe("dirtyFiles fails closed (#0211)", () => {
  it("throws GitDirtyCheckError on a directory that is not a git repo, not []", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-not-repo-"));
    try {
      await expect(dirtyFiles(notARepo)).rejects.toBeInstanceOf(GitDirtyCheckError);
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });

  it("throws GitDirtyCheckError on a corrupted git repo, not []", async () => {
    const { root, clean } = makeRepo();
    try {
      // Corrupt the git dir so `git status` fails with a non-zero exit.
      writeFileSync(join(root, ".git", "HEAD"), "garbage\n");
      await expect(dirtyFiles(root)).rejects.toBeInstanceOf(GitDirtyCheckError);
    } finally {
      clean();
    }
  });

  it("returns [] only for a genuinely clean tracked tree", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "a.txt"), "v1\n");
      git(root, ["add", "a.txt"]);
      git(root, ["commit", "-m", "add a"]);
      expect(await dirtyFiles(root)).toEqual([]);
    } finally {
      clean();
    }
  });
});

/**
 * mergeBranch conflict reporting (#0271).
 *
 * A close-out merge into a candidate reset to main must never surface the
 * task's own bookkeeping as a hard conflict, and when a REAL source conflict
 * sits alongside that bookkeeping, the reported conflicts must name the real
 * culprit — not the task file that the close-out is supposed to auto-resolve.
 */
function commitFile(dir: string, name: string, content: string, msg: string): void {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

describe("mergeBranch conflict reporting (#0271)", () => {
  it("auto-resolves when the only divergence is the task file's own bookkeeping", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/task120");
      expect(wt.ok).toBe(true);
      const wtPath = wt.path!;

      // Branch: real source change + the task's own file at review status.
      commitFile(wtPath, "src/genuine.ts", "export const a = 1;\n", "branch: source change");
      commitFile(
        wtPath,
        "work/0120-some-task.md",
        "---\nid: '0120'\nstatus: review\n---\nbody\n",
        "branch: task file",
      );

      // Main: the task file gains NEWER bookkeeping + a concurrent task edit.
      commitFile(
        root,
        "work/0120-some-task.md",
        "---\nid: '0120'\nstatus: done\n---\nbody\nupdated on main\n",
        "main: task bookkeeping",
      );
      commitFile(
        root,
        "work/0099-other.md",
        "---\nid: '0099'\n---\nother\n",
        "main: concurrent edit",
      );

      // Candidate reset to main, mirroring validateCandidate's syncCandidate.
      const candidate = ensureWorktree(root, "repoos/integrate/0120");
      expect(candidate.ok).toBe(true);
      const candPath = candidate.path!;
      git(candPath, ["reset", "--hard", "main"]);

      const result = await mergeBranch(candPath, "feat/task120", {
        autoResolve: ["dist/", "screenshots/", "work/0120-some-task.md"],
        autoResolveOurs: ["work/"],
      });

      expect(result.merged).toBe(true);
      expect(result.conflicts).toEqual([]);
      // The branch's source change landed in the candidate.
      expect(git(candPath, ["show", "HEAD:src/genuine.ts"])).toContain("a = 1");
    } finally {
      clean();
    }
  });

  it("names only the real source culprit when a genuine conflict sits alongside task-file bookkeeping", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/task120");
      expect(wt.ok).toBe(true);
      const wtPath = wt.path!;

      commitFile(wtPath, "src/genuine.ts", "export const a = 1;\n", "branch: source change");
      commitFile(
        wtPath,
        "work/0120-some-task.md",
        "---\nid: '0120'\nstatus: review\n---\nbody\n",
        "branch: task file",
      );

      // Main: the task file gains bookkeeping AND a genuinely competing edit of
      // the same source file the branch changed.
      commitFile(
        root,
        "work/0120-some-task.md",
        "---\nid: '0120'\nstatus: done\n---\nbody\nupdated on main\n",
        "main: task bookkeeping",
      );
      commitFile(root, "src/genuine.ts", "export const b = 2;\n", "main: genuine competing change");

      const candidate = ensureWorktree(root, "repoos/integrate/0120");
      expect(candidate.ok).toBe(true);
      const candPath = candidate.path!;
      git(candPath, ["reset", "--hard", "main"]);

      const result = await mergeBranch(candPath, "feat/task120", {
        autoResolve: ["dist/", "screenshots/", "work/0120-some-task.md"],
        autoResolveOurs: ["work/"],
      });

      expect(result.merged).toBe(false);
      // The reported conflict is the REAL blocker, never the task file the
      // close-out is meant to auto-resolve (#0271).
      expect(result.conflicts).toEqual(["src/genuine.ts"]);
      expect(result.reason).toMatch(/merge conflict/);
      // The failed merge was aborted — nothing half-applied.
      expect(git(candPath, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });
});
