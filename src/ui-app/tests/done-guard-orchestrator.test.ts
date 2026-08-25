/**
 * Publish-time dirty-main guard regression test (#0211).
 *
 * Even with the enqueue-time guard fixed, main can be dirtied between enqueue
 * and publish (validation runs minutes-long builds). The publish step must
 * re-check main and surface an actionable failure instead of merging into a
 * dirty tree (or failing later with git's raw "would be overwritten" message).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureWorktree } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-pub-guard-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  // .repoos/ is gitignored in the real repo (job/lock files live there and
  // must never show up as "dirty main") — match that here so this fixture's
  // dirty-file checks reflect production, not an artifact of a bare `git
  // init` with no .gitignore.
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "README.md", ".gitignore"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("publish-time dirty-main guard (#0211)", () => {
  it("refuses publication while a hotfix owns the main checkout", async () => {
    const { root, clean } = makeRepo();
    try {
      const branch = "repoos/integrate/T2";
      expect(ensureWorktree(root, branch).ok).toBe(true);
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "T2", branch } as any);
      coordinator.updateJob("T2", { phase: "publishing" });
      const rootLock = createRootLock(root);
      expect(rootLock.acquire("H1", "hotfix")).toBe(true);

      const orchestrator = new CloseOutOrchestrator(
        { root } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
        rootLock,
      );
      const result = await orchestrator.processNext();

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/held by hotfix.*#H1/i);
      expect(rootLock.getHolder()).toEqual({ taskId: "H1", kind: "hotfix" });
    } finally {
      clean();
    }
  });

  it("refuses to publish into a dirty main with an actionable reason and does not merge", async () => {
    const { root, clean } = makeRepo();
    try {
      // Build a validated candidate: a worktree+branch ahead of main.
      const branch = "repoos/integrate/T1";
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "feature.txt"), "new\n");
      git(wt.path, ["add", "feature.txt"]);
      git(wt.path, ["commit", "-m", "candidate work"]);
      const mainSha = git(root, ["rev-parse", "main"]);
      const candidateSha = git(wt.path, ["rev-parse", "HEAD"]);

      // Restore main to the candidate base so the merge would otherwise apply.
      // Simpler: candidate is ahead of main; capture main as the base.
      const coordinator = createJobCoordinator(root);
      const task = {
        id: "T1",
        branch,
      } as any;
      coordinator.enqueue(task);
      coordinator.updateJob("T1", {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha: mainSha,
        branchSha: candidateSha,
        candidateSha,
      });

      // Dirty main at publish time.
      writeFileSync(join(root, "dirty.txt"), "uncommitted\n");

      const orchestrator = new CloseOutOrchestrator(
        { root } as RepoOSConfig,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
      );

      const front = coordinator.peekNext();
      expect(front?.phase).toBe("publishing");
      const result = await orchestrator.processNext();

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/uncommitted file/i);
      expect(result.reason).not.toMatch(/overwritten by merge/i);
      // The candidate was NOT merged into main.
      expect(git(root, ["rev-parse", "main"])).toBe(mainSha);
    } finally {
      clean();
    }
  });

  it(
    "auto-checkpoints and publishes when the only dirty files are task bookkeeping under work/ (#0271 follow-up)",
    async () => {
      // Confirmed live: #0293's close-out was refused at publish time because
      // an UNRELATED task's work/*.md file — a routine activity-log stamp —
      // was dirty on main. That's the same class of write commitTaskFile
      // makes constantly elsewhere in the system; blocking a merge on it
      // just to require a human retry is unnecessary friction, unlike a
      // dirty file OUTSIDE work/ (still refused above), which is genuinely
      // ambiguous.
      const { root, clean } = makeRepo();
      try {
        mkdirSync(join(root, "work"), { recursive: true });
        const branch = "repoos/integrate/T3";
        const wt = ensureWorktree(root, branch);
        expect(wt.ok).toBe(true);
        writeFileSync(join(wt.path, "feature.txt"), "new\n");
        git(wt.path, ["add", "feature.txt"]);
        git(wt.path, ["commit", "-m", "candidate work"]);
        const mainSha = git(root, ["rev-parse", "main"]);
        const candidateSha = git(wt.path, ["rev-parse", "HEAD"]);

        const coordinator = createJobCoordinator(root);
        coordinator.enqueue({ id: "T3", branch } as any);
        coordinator.updateJob("T3", {
          phase: "publishing",
          startedAt: new Date().toISOString(),
          baseMainSha: mainSha,
          branchSha: candidateSha,
          candidateSha,
        });

        // An UNRELATED task file dirty on main at publish time — the exact
        // #0293 shape.
        writeFileSync(join(root, "work", "0099-other-task.md"), "---\nid: 0099\n---\nstamp\n");

        const orchestrator = new CloseOutOrchestrator(
          { root, workDir: "work" } as RepoOSConfig,
          coordinator,
          createRepositoryLock(root),
          createRootLock(root),
        );

        const result = await orchestrator.processNext();

        expect(result.ok).toBe(true);
        // The checkpoint commit landed on main, and the candidate merged on
        // top of it — main advanced past its pre-publish SHA either way.
        expect(git(root, ["rev-parse", "main"])).not.toBe(mainSha);
        expect(git(root, ["status", "--porcelain"])).toBe("");
        expect(git(root, ["log", "--oneline", "-5"])).toMatch(/checkpoint task bookkeeping/);
      } finally {
        clean();
      }
    },
  );
});
