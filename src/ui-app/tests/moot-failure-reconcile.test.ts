/**
 * Reconciliation of a moot close-out failure (#0289).
 *
 * When a duplicate/stale close-out job fails against a task that is already
 * `done` (finished through an earlier job), the failure is not a real gate
 * failure — it is the earlier close-out's cleanup having deleted the worktree/
 * branch, so a later redundant enqueue fails with "worktree not found". Such a
 * failure must not be recorded as a permanent `failed` job (or surfaced as an
 * actionable error); the job record is dropped instead.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-moot-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  writeFileSync(join(root, "README.md"), "hi\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

describe("moot close-out failure reconciliation (#0289)", () => {
  it("drops a failed close-out job whose task is already done instead of leaving a failed record", async () => {
    const { root, clean } = makeRepo();
    try {
      // A task that already finished: its file is `done` on disk, and its
      // feature branch/worktree has been cleaned up (deleted) as part of that
      // earlier successful close-out.
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(
        join(root, "work", "0289-already-done.md"),
        "---\nid: 0289\ntitle: already done\nstatus: done\n---\n",
      );

      const coordinator = createJobCoordinator(root);
      // Duplicate/stale close-out enqueued against the already-done task, with
      // its feature branch long gone.
      coordinator.enqueue({ id: "0289", branch: "feat/0289-already-done" } as any);

      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", defaultStatus: "inbox", defaultAssignee: "unassigned" } as RepoOSConfig,
        coordinator,
      );

      const result = await orchestrator.processNext();

      // Moot: no real failure to surface.
      expect(result.ok).toBe(true);
      // The failed job record is dropped, not left as an indefinite `failed`.
      expect(coordinator.getJob("0289")).toBeNull();
      expect(coordinator.allJobs()).toHaveLength(0);
    } finally {
      clean();
    }
  });

  it("still records a genuine failure for a task that is not done", async () => {
    const { root, clean } = makeRepo();
    try {
      // A task still in review whose feature branch is missing is a REAL
      // failure needing human attention — it must remain `failed`.
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(
        join(root, "work", "0290-in-review.md"),
        "---\nid: 0290\ntitle: in review\nstatus: review\n---\n",
      );

      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "0290", branch: "feat/0290-in-review" } as any);

      const orchestrator = new CloseOutOrchestrator(
        { root, workDir: "work", defaultStatus: "inbox", defaultAssignee: "unassigned" } as RepoOSConfig,
        coordinator,
      );

      const result = await orchestrator.processNext();

      expect(result.ok).toBe(false);
      const job = coordinator.getJob("0290");
      expect(job?.phase).toBe("failed");
      expect(job?.failedPhase).toBe("syncing");
      expect(job?.reason).toMatch(/worktree not found/i);
    } finally {
      clean();
    }
  });
});
