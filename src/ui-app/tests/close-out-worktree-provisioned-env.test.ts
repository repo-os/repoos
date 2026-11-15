/**
 * Close-out must not keep a worktree just because RepoOS provisioned the
 * inherited `.env` symlink there (#1135). A half-removed worktree loses its
 * `.gitignore`, so `git status` reports `?? .env` — the link and main's ignore
 * rules are both gone from the tree — and close-out used to call that leftover
 * task work, keeping the worktree and flagging the Done card as Needs input.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";

import { ensureWorktree, listWorktrees, uncommittedWorkFiles } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-closeout-env-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n.env\n");
  writeFileSync(join(root, "repoos.toml"), "[worktrees]\ninheritEnv = true\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "README.md", ".gitignore", "repoos.toml"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  // Main's real secret file, the target of the provisioned symlink.
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  return { root, clean: () => rmFixture(root) };
}

/** The task file markTaskReleased/patchTaskFile rewrite in the main checkout. */
function writeTaskFile(root: string, id: string, branch: string): string {
  mkdirSync(join(root, "work"), { recursive: true });
  const path = join(root, "work", `${id}-env-cleanup.md`);
  writeFileSync(
    path,
    `---\nid: "${id}"\ntitle: Env cleanup fixture\ntype: bug\nstatus: review\npriority: p1\n` +
      `area: core\nassigned_to: ai\nbranch: ${branch}\n---\n## Problem\n\nFixture body.\n`,
  );
  git(root, ["add", path]);
  git(root, ["commit", "-m", `docs(${id}): add task`]);
  return path;
}

/**
 * A task worktree merged into main whose removal stalled half-way: the tree
 * lost its `.gitignore` (so `.env` reads as untracked), and the RepoOS-created
 * `.env` symlink is still on disk. Reproduces the #1128 close-out report.
 */
function setupMergedWorktree(id: string): {
  root: string;
  clean: () => void;
  branch: string;
  worktree: string;
  taskPath: string;
} {
  const { root, clean } = makeRepo();
  const branch = `feat/${id}`;
  const taskPath = writeTaskFile(root, id, branch);

  const wt = ensureWorktree(root, branch);
  expect(wt.ok).toBe(true);
  expect(lstatSync(join(wt.path, ".env")).isSymbolicLink()).toBe(true);

  writeFileSync(join(wt.path, "feature.txt"), "implemented\n");
  git(wt.path, ["add", "feature.txt"]);
  git(wt.path, ["commit", "-m", "the work"]);
  git(root, ["merge", "--ff-only", branch]);

  // The stalled removal deleted the tree's ignore rules (the `.env` link, which
  // `git worktree remove` leaves for last, survived).
  rmSync(join(wt.path, ".gitignore"));
  expect(git(wt.path, ["status", "--porcelain"]).split("\n")).toEqual(["D .gitignore", "?? .env"]);
  return { root, clean, branch, worktree: wt.path, taskPath };
}

async function runCleanup(root: string, id: string, branch: string) {
  const coordinator = createJobCoordinator(root);
  coordinator.enqueue({ id, branch } as any);
  coordinator.updateJob(id, { phase: "cleanup", startedAt: new Date().toISOString() });
  const orchestrator = new CloseOutOrchestrator(
    { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
    coordinator,
    createRepositoryLock(root),
    createRootLock(root),
  );
  return orchestrator.processNext();
}

describe("close-out worktree cleanup and the inherited .env (#1135)", () => {
  it("removes the worktree instead of keeping it for the provisioned .env link", async () => {
    const { root, clean, branch, worktree, taskPath } = setupMergedWorktree("1135a");
    try {
      const filter = { workDir: "work", cacheDir: ".repoos" };
      // The repro: the leftover list names only RepoOS's own link...
      expect(
        await uncommittedWorkFiles(worktree, filter, {
          omitWorktreeDeletionsPresentAtRef: branch,
        }),
      ).toEqual([".env"]);
      // ...and the close-out filter drops it, because nothing was lost.
      expect(
        await uncommittedWorkFiles(worktree, filter, {
          omitWorktreeDeletionsPresentAtRef: branch,
          ignoreProvisionedFromMain: root,
        }),
      ).toEqual([]);

      const result = await runCleanup(root, "1135a", branch);

      expect(result.ok).toBe(true);
      expect(listWorktrees(root).map((w) => w.branch)).not.toContain(branch);
      expect(existsSync(worktree)).toBe(false);
      expect(readFileSync(taskPath, "utf8")).not.toMatch(/needs_input: true/);
      // The link target in the main checkout was never touched.
      expect(readFileSync(join(root, ".env"), "utf8")).toBe("SECRET=1\n");
    } finally {
      clean();
    }
  });

  it("still keeps the worktree and asks for input on a real uncommitted change", async () => {
    const { root, clean, branch, worktree, taskPath } = setupMergedWorktree("1135b");
    try {
      writeFileSync(join(worktree, "real-work.txt"), "not committed\n");

      const result = await runCleanup(root, "1135b", branch);

      expect(result.ok).toBe(true);
      expect(listWorktrees(root).map((w) => w.branch)).toContain(branch);
      expect(existsSync(join(worktree, "real-work.txt"))).toBe(true);
      const task = readFileSync(taskPath, "utf8");
      expect(task).toMatch(/needs_input: true/);
      expect(task).toMatch(/needs_input_reason: closeout-worktree-dirty/);
      // The real file is named; RepoOS's own link is not blamed.
      expect(task).toContain("real-work.txt");
      expect(task).not.toContain(".env");
    } finally {
      clean();
    }
  });
});
