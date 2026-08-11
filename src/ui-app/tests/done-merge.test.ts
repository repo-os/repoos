/**
 * Review → done merge orchestration (#0095).
 *
 * When a task moves to done, the branch is merged into main; if that merge hits
 * a synchronization snag (the branch drifted from main), the branch is
 * automatically synced with main and the merge retried — no manual "Sync with
 * main" step. These tests exercise `mergeTaskBranchWithAutoSync` against real
 * git repos with linked worktrees, covering:
 *
 *   1. direct merge success (no sync needed),
 *   2. successful sync-and-retry (the worktree carries a resolution the branch
 *      ref doesn't, so the sync commits it and the retry completes),
 *   3. unrecoverable merge/sync failure (a real source conflict both merges
 *      share) — the failure is surfaced, the branch stays unmerged, and nothing
 *      is left half-applied.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureWorktree, syncBranchWithMain } from "../../core/git";
import { mergeTaskBranchWithAutoSync } from "../../server/done";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** Real repo with user identity configured and an initial commit. */
function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-done-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

/** Commit a file with the given content in `dir` (any checkout/worktree). */
function commitFile(dir: string, name: string, content: string, msg: string): void {
  writeFileSync(join(dir, name), content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

describe("mergeTaskBranchWithAutoSync", () => {
  it("merges directly when main is behind the branch (fast-forward, no sync)", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/direct");
      expect(wt.ok).toBe(true);
      commitFile(wt.path, "b.txt", "branch\n", "branch work");
      const tip = git(root, ["rev-parse", "feat/direct"]);

      const result = await mergeTaskBranchWithAutoSync(root, "feat/direct");

      expect(result.merged).toBe(true);
      expect(result.autoSynced).toBeUndefined();
      expect(result.ff).toBe(true);
      expect(result.drifted).toBe(false);
      // main moved to the branch tip — the branch is now merged in.
      expect(git(root, ["rev-parse", "main"])).toBe(tip);
    } finally {
      clean();
    }
  });

  it("auto-syncs with main and retries when the first merge hits a snag", async () => {
    const { root, clean } = makeRepo();
    try {
      // main: f.txt="base" → (later) f.txt="main". branch: f.txt="branch".
      commitFile(root, "f.txt", "base\n", "base file");
      const wt = ensureWorktree(root, "feat/sync");
      expect(wt.ok).toBe(true);
      commitFile(wt.path, "f.txt", "branch\n", "branch edit");
      commitFile(root, "f.txt", "main\n", "main edit");

      // The worktree already carries the resolution (f.txt matches main) that
      // the committed branch ref does not — the sync commits it and merges.
      writeFileSync(join(wt.path, "f.txt"), "main\n");

      const result = await mergeTaskBranchWithAutoSync(root, "feat/sync");

      expect(result.merged).toBe(true);
      expect(result.autoSynced).toBe(true);
      expect(result.ff).toBe(true);
      // The merged main has the branch's resolved content and the branch is gone.
      expect(git(root, ["show", "main:f.txt"])).toBe("main");
    } finally {
      clean();
    }
  });

  it("surfaces the conflict when neither the merge nor the sync can complete", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "f.txt", "base\n", "base file");
      const wt = ensureWorktree(root, "feat/conflict");
      expect(wt.ok).toBe(true);
      commitFile(wt.path, "f.txt", "branch\n", "branch edit");
      commitFile(root, "f.txt", "main\n", "main edit");

      const result = await mergeTaskBranchWithAutoSync(root, "feat/conflict");

      expect(result.merged).toBe(false);
      expect(result.autoSynced).toBeUndefined();
      expect(result.drifted).toBe(true);
      expect(result.conflicts).toEqual(["f.txt"]);
      expect(result.reason).toMatch(/merge conflict: f\.txt/);
      // The failed merges were aborted: no half-applied merge, branch still exists.
      expect(git(root, ["branch", "--list", "feat/conflict"])).toContain("feat/conflict");
      expect(git(root, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });
});

describe("syncBranchWithMain", () => {
  it("fails soft when the branch has no linked worktree", async () => {
    const { root, clean } = makeRepo();
    try {
      const result = await syncBranchWithMain(root, "feat/ghost");

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/no worktree for branch/i);
    } finally {
      clean();
    }
  });
});
