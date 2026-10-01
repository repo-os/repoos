/**
 * Close-out cleanup must not treat an unreadable dirty check as "clean" (#0609).
 */
import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";

let rejectUncommittedWorkFiles = false;

vi.mock("../../core/git.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/git.js")>();
  return {
    ...actual,
    uncommittedWorkFiles: async (
      ...args: Parameters<typeof actual.uncommittedWorkFiles>
    ): ReturnType<typeof actual.uncommittedWorkFiles> => {
      if (rejectUncommittedWorkFiles) {
        throw new actual.GitDirtyCheckError("timeout", "git status exceeded its time budget");
      }
      return actual.uncommittedWorkFiles(...args);
    },
  };
});

import { ensureWorktree, listWorktrees } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-closeout-read-fail-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "README.md", ".gitignore"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  return { root, clean: () => rmFixture(root) };
}

describe("close-out cleanup unreadable dirty check (#0609)", () => {
  it("does not force-remove when uncommittedWorkFiles throws, even if the branch merged", async () => {
    rejectUncommittedWorkFiles = true;
    const { root, clean } = makeRepo();
    try {
      const id = "0609b";
      const branch = `feat/${id}`;
      mkdirSync(join(root, "work"), { recursive: true });
      const path = join(root, "work", `${id}-cleanup.md`);
      writeFileSync(
        path,
        `---\nid: "${id}"\ntitle: Cleanup fixture\ntype: bug\nstatus: review\npriority: p1\n` +
          `area: server\nassigned_to: ai\nbranch: ${branch}\n---\n## Problem\n\nFixture body.\n`,
      );
      git(root, ["add", path]);
      git(root, ["commit", "-m", `docs(${id}): add task`]);

      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "feature.txt"), "implemented\n");
      git(wt.path, ["add", "feature.txt"]);
      git(wt.path, ["commit", "-m", "the work"]);
      writeFileSync(join(wt.path, "feature.txt"), "uncommitted\n");
      git(root, ["merge", "--ff-only", branch]);

      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id, branch } as any);
      coordinator.updateJob(id, { phase: "cleanup", startedAt: new Date().toISOString() });

      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
      );

      const result = await orchestrator.processNext();

      expect(result.ok).toBe(true);
      expect(listWorktrees(root).map((w) => w.branch)).toContain(branch);
      expect(existsSync(join(wt.path, "feature.txt"))).toBe(true);
      expect(readFileSync(join(wt.path, "feature.txt"), "utf8")).toBe("uncommitted\n");
      expect(git(root, ["branch", "--list", branch])).toContain(branch);
      expect(readFileSync(path, "utf8")).not.toMatch(/needs_input: true/);
    } finally {
      rejectUncommittedWorkFiles = false;
      clean();
    }
  });
});
