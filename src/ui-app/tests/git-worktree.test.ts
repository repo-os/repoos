import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureWorktree, worktreeStatus, resetWorktree } from "../../core/git.js";
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
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
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
      expect(
        git(root, ["worktree", "list", "--porcelain"]),
      ).toContain(res.path);
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
      expect(
        git(root, ["worktree", "list"]).split("\n").filter(Boolean),
      ).toHaveLength(2);
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
