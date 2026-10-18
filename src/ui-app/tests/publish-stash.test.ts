/**
 * Publish-time stash of dirty main files the merge would overwrite (#0820).
 *
 * A close-out merges the candidate into the LIVE main checkout. The start-up
 * dirty-main guard runs only at enqueue; a file dirtied mid-close-out (a
 * settings save to repoos.toml, a routine task-file stamp) reaches the merge.
 * git refuses a merge that would overwrite a locally modified path, so the
 * publish step now stashes exactly the dirty paths the merge would overwrite,
 * merges, and always pops the stash back on top. Dirty paths the merge does
 * not touch are never stashed.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import {
  PUBLISH_STASH_MESSAGE,
  dirtyPathsOverwrittenByMerge,
  ensureWorktree,
} from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-publish-stash-"));
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

/** Queue a job already in the publishing phase and run it through the orchestrator. */
async function publish(
  root: string,
  opts: { id: string; branch: string; baseMainSha: string; candidateSha: string },
): Promise<{ ok: boolean; reason?: string }> {
  const coordinator = createJobCoordinator(root);
  coordinator.enqueue({ id: opts.id, branch: opts.branch } as never);
  coordinator.updateJob(opts.id, {
    phase: "publishing",
    startedAt: new Date().toISOString(),
    baseMainSha: opts.baseMainSha,
    branchSha: opts.candidateSha,
    candidateSha: opts.candidateSha,
  } as never);
  const orchestrator = new CloseOutOrchestrator(
    { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
    coordinator,
    createRepositoryLock(root),
    createRootLock(root),
  );
  return orchestrator.processNext();
}

describe("dirtyPathsOverwrittenByMerge", () => {
  it("returns only the dirty paths the merge would overwrite", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "touched.txt"), "base\n");
      writeFileSync(join(root, "untouched.txt"), "base\n");
      git(root, ["add", "."]);
      git(root, ["commit", "-m", "seed"]);
      git(root, ["checkout", "-q", "-b", "feat"]);
      writeFileSync(join(root, "touched.txt"), "feat\n");
      git(root, ["commit", "-qam", "branch change"]);
      git(root, ["checkout", "-q", "main"]);

      writeFileSync(join(root, "touched.txt"), "local-touched\n");
      writeFileSync(join(root, "untouched.txt"), "local-untouched\n");

      const overwritten = await dirtyPathsOverwrittenByMerge(root, "feat", [
        "touched.txt",
        "untouched.txt",
      ]);
      expect(overwritten).toEqual(["touched.txt"]);
    } finally {
      clean();
    }
  });
});

describe("publish stashes only the dirty files the merge overwrites (#0820)", () => {
  it("leaves a dirty file the merge does not touch alone (no stash)", async () => {
    const { root, clean } = makeRepo();
    try {
      const id = "T-untouched";
      const branch = `repoos/integrate/${id}`;
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "feature.txt"), "new\n");
      git(wt.path, ["add", "feature.txt"]);
      git(wt.path, ["commit", "-m", "candidate work"]);
      const mainSha = git(root, ["rev-parse", "main"]);
      const candidateSha = git(wt.path, ["rev-parse", "HEAD"]);

      // A settings save landed on main mid-validation; the candidate does not
      // touch repoos.toml, so the merge keeps the edit.
      writeFileSync(join(root, "repoos.toml"), 'theme = "dark"\n');

      const result = await publish(root, { id, branch, baseMainSha: mainSha, candidateSha });

      expect(result.ok).toBe(true);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe('theme = "dark"\n');
      expect(git(root, ["stash", "list"])).toBe("");
    } finally {
      clean();
    }
  });

  it("stashes a dirty file the merge overwrites and reapplies the edit on top", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "config.txt"), "l1\nl2\nl3\nl4\n");
      git(root, ["add", "config.txt"]);
      git(root, ["commit", "-m", "seed config"]);

      const id = "T-reapply";
      const branch = `repoos/integrate/${id}`;
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "config.txt"), "H1\nl2\nl3\nl4\n");
      git(wt.path, ["add", "config.txt"]);
      git(wt.path, ["commit", "-m", "candidate edits line 1"]);
      const mainSha = git(root, ["rev-parse", "main"]);
      const candidateSha = git(wt.path, ["rev-parse", "HEAD"]);

      // main's local edit is on a different line, so the pop applies cleanly.
      writeFileSync(join(root, "config.txt"), "l1\nl2\nl3\nLOCAL\n");

      const result = await publish(root, { id, branch, baseMainSha: mainSha, candidateSha });

      expect(result.ok).toBe(true);
      // Both the branch change and the local edit survive.
      expect(readFileSync(join(root, "config.txt"), "utf8")).toBe("H1\nl2\nl3\nLOCAL\n");
      expect(git(root, ["stash", "list"])).toBe("");
    } finally {
      clean();
    }
  });

  it("pops the stash even when the merge fails", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "config.txt"), "BASE\n");
      git(root, ["add", "config.txt"]);
      git(root, ["commit", "-m", "seed config"]);

      const id = "T-failmerge";
      const branch = `repoos/integrate/${id}`;
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "config.txt"), "FEAT\n");
      git(wt.path, ["add", "config.txt"]);
      git(wt.path, ["commit", "-m", "candidate"]);
      const candidateSha = git(wt.path, ["rev-parse", "HEAD"]);

      // main advances with a conflicting change...
      writeFileSync(join(root, "config.txt"), "MAIN\n");
      git(root, ["commit", "-qam", "main change"]);
      const baseMainSha = git(root, ["rev-parse", "main"]);
      // ...and is dirty on the same file.
      writeFileSync(join(root, "config.txt"), "LOCAL\n");

      const result = await publish(root, { id, branch, baseMainSha, candidateSha });

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/merge conflict/i);
      // The stash was popped anyway: the local edit is back, nothing stranded.
      expect(git(root, ["stash", "list"])).toBe("");
      expect(readFileSync(join(root, "config.txt"), "utf8")).toBe("LOCAL\n");
    } finally {
      clean();
    }
  });

  it("keeps the stash, reports the conflict, and never discards the edit on a pop conflict", async () => {
    const { root, clean } = makeRepo();
    try {
      writeFileSync(join(root, "config.txt"), "BASE\n");
      git(root, ["add", "config.txt"]);
      git(root, ["commit", "-m", "seed config"]);

      const id = "T-popconflict";
      const branch = `repoos/integrate/${id}`;
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "config.txt"), "FEAT\n");
      git(wt.path, ["add", "config.txt"]);
      git(wt.path, ["commit", "-m", "candidate"]);
      const mainSha = git(root, ["rev-parse", "main"]);
      const candidateSha = git(wt.path, ["rev-parse", "HEAD"]);

      // Same single line edited locally: the fast-forward merge succeeds, then
      // reapplying the local edit conflicts.
      writeFileSync(join(root, "config.txt"), "LOCAL\n");

      const result = await publish(root, { id, branch, baseMainSha: mainSha, candidateSha });

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/publish stash pop conflict/i);
      expect(result.reason).toContain("config.txt");
      // The stash is kept — the local edit is not discarded.
      expect(git(root, ["stash", "list"])).toContain(PUBLISH_STASH_MESSAGE);
      const conflicted = readFileSync(join(root, "config.txt"), "utf8");
      expect(conflicted).toContain("LOCAL");
      expect(conflicted).toContain("FEAT");
    } finally {
      clean();
    }
  });
});
