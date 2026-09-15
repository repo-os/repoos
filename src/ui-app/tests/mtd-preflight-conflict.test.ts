/**
 * #0358 — the MTD close-out pre-flight conflict check.
 *
 * `processJob`'s validating phase used to create a full candidate worktree and
 * run the merge before discovering a conflict that was already knowable from
 * cheap git plumbing. The pre-flight now runs `mergeBranch`'s own conflict
 * classification (dry-run) against current main BEFORE any candidate worktree
 * exists, and routes a real conflict straight to the same repair handoff —
 * while failing open into the existing sync/validate flow for everything else.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree, mergeBranch, worktreePathForBranch } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig, Task } from "../../core/types";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commitFile(dir: string, name: string, content: string, msg: string): void {
  const full = join(dir, name);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-preflight-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

interface SyncResult {
  ok: boolean;
  reason?: string;
  conflict?: boolean;
  candidateSha?: string;
}

function makeOrchestrator(
  root: string,
  getTask?: (id: string) => Task | null,
  onMergeConflict?: (taskId: string, reason: string) => void,
) {
  const config = {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  } as RepoOSConfig;
  const coordinator = createJobCoordinator(root);
  const orch = new CloseOutOrchestrator(
    config,
    coordinator,
    undefined,
    undefined,
    getTask,
    undefined,
    undefined,
    onMergeConflict,
  );
  const syncCandidate = (job: unknown): Promise<SyncResult> =>
    (orch as never as { syncCandidate: (j: unknown) => Promise<SyncResult> }).syncCandidate(job);
  return { orch, coordinator, syncCandidate };
}

describe("mergeBranch dry-run pre-flight (#0358)", () => {
  it("reports a real conflict and leaves the checkout untouched", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "src/a.ts", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t1").path!;
      commitFile(wt, "src/a.ts", "branch\n", "branch");
      commitFile(root, "src/a.ts", "main\n", "main");
      const headBefore = git(wt, ["rev-parse", "HEAD"]);

      const res = await mergeBranch(wt, "main", { dryRun: true });

      expect(res.merged).toBe(false);
      expect(res.conflicts).toEqual(["src/a.ts"]);
      // The dry-run never moved the branch, dirtied the tree, or left MERGE_HEAD.
      expect(git(wt, ["rev-parse", "HEAD"])).toBe(headBefore);
      expect(git(wt, ["status", "--porcelain"])).toBe("");
      expect(() => git(wt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])).toThrow();
    } finally {
      clean();
    }
  });

  it("reports a clean merge as merged without touching the checkout", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "src/base.ts", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t2").path!;
      commitFile(wt, "src/new.ts", "export const n = 1;\n", "new file");
      const headBefore = git(wt, ["rev-parse", "HEAD"]);

      const res = await mergeBranch(wt, "main", { dryRun: true });

      expect(res.merged).toBe(true);
      expect(res.conflicts).toEqual([]);
      expect(git(wt, ["rev-parse", "HEAD"])).toBe(headBefore);
      expect(git(wt, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });

  it("treats an auto-resolvable-only conflict as clean", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "work/0001-task.md", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t3").path!;
      commitFile(wt, "work/0001-task.md", "branch\n", "branch bookkeeping");
      commitFile(root, "work/0001-task.md", "main\n", "main bookkeeping");

      const res = await mergeBranch(wt, "main", {
        autoResolve: ["work/0001-task.md"],
        dryRun: true,
      });

      expect(res.merged).toBe(true);
      expect(res.conflicts).toEqual([]);
      expect(git(wt, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });

  it("refuses to run — and never aborts — when the checkout is already mid-merge", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "src/a.ts", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t4").path!;
      commitFile(wt, "src/a.ts", "branch\n", "branch");
      commitFile(root, "src/a.ts", "main\n", "main");
      // An operation the user left in progress in the task worktree.
      expect(() => git(wt, ["merge", "--no-commit", "main"])).toThrow();

      const res = await mergeBranch(wt, "main", { dryRun: true });

      expect(res.merged).toBe(false);
      expect(res.conflicts).toEqual([]);
      expect(res.reason).toContain("already in progress");
      // The pre-existing merge state is preserved, not aborted.
      expect(git(wt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])).toBeTruthy();
    } finally {
      clean();
    }
  });
});

describe("syncCandidate pre-flight conflict check (#0358)", () => {
  it("skips candidate creation and returns the conflict before any worktree exists", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "src/a.ts", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t10").path!;
      commitFile(wt, "src/a.ts", "branch\n", "branch");
      commitFile(root, "src/a.ts", "main\n", "main");

      const { coordinator, syncCandidate } = makeOrchestrator(root);
      coordinator.enqueue({ id: "0010", branch: "feat/t10" } as never);

      const res = await syncCandidate(coordinator.getJob("0010"));

      expect(res.ok).toBe(false);
      expect(res.conflict).toBe(true);
      expect(res.reason).toContain("merge conflict in src/a.ts");
      expect(res.reason).toContain("feature branch's own worktree");
      // The pre-flight returned before `ensureWorktree` — no candidate at all.
      expect(worktreePathForBranch(root, "repoos/integrate/0010")).toBeNull();
    } finally {
      clean();
    }
  });

  it("proceeds into the normal flow for a clean branch", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/t11").path!;
      commitFile(wt, "src/new.ts", "export const n = 1;\n", "new file");

      const { coordinator, syncCandidate } = makeOrchestrator(root);
      coordinator.enqueue({ id: "0011", branch: "feat/t11" } as never);

      const res = await syncCandidate(coordinator.getJob("0011"));

      expect(res.ok).toBe(true);
      expect(res.conflict).toBeFalsy();
      expect(worktreePathForBranch(root, "repoos/integrate/0011")).not.toBeNull();
    } finally {
      clean();
    }
  });

  it("proceeds into the normal flow when only auto-resolvable paths conflict", async () => {
    const { root, clean } = makeRepo();
    try {
      const taskPath = join(root, "work", "0012-task.md");
      commitFile(root, "work/0012-task.md", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t12").path!;
      commitFile(wt, "work/0012-task.md", "branch\n", "branch bookkeeping");
      commitFile(root, "work/0012-task.md", "main\n", "main bookkeeping");

      const getTask = (id: string): Task | null =>
        id === "0012" ? ({ id, absPath: taskPath } as Task) : null;
      const { coordinator, syncCandidate } = makeOrchestrator(root, getTask);
      coordinator.enqueue({ id: "0012", branch: "feat/t12" } as never);

      const res = await syncCandidate(coordinator.getJob("0012"));

      expect(res.ok).toBe(true);
      expect(res.conflict).toBeFalsy();
      expect(worktreePathForBranch(root, "repoos/integrate/0012")).not.toBeNull();
    } finally {
      clean();
    }
  });

  it("falls open when the feature branch has no worktree", async () => {
    const { root, clean } = makeRepo();
    try {
      // A branch ref with no linked worktree: the pre-flight cannot run, so the
      // existing flow must report the real failure instead.
      git(root, ["branch", "feat/t13", "main"]);

      const { coordinator, syncCandidate } = makeOrchestrator(root);
      coordinator.enqueue({ id: "0013", branch: "feat/t13" } as never);

      const res = await syncCandidate(coordinator.getJob("0013"));

      expect(res.ok).toBe(false);
      expect(res.conflict).toBeFalsy();
      expect(res.reason).toContain("worktree not found");
      // The normal flow ran and created the candidate before failing.
      expect(worktreePathForBranch(root, "repoos/integrate/0013")).not.toBeNull();
    } finally {
      clean();
    }
  });
});

describe("processJob routes a pre-flight conflict to repair (#0358)", () => {
  it("hands off to onMergeConflict with the validating phase and same reason format", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "src/a.ts", "base\n", "base");
      const wt = ensureWorktree(root, "feat/t20").path!;
      commitFile(wt, "src/a.ts", "branch\n", "branch");
      commitFile(root, "src/a.ts", "main\n", "main");

      const conflicts: { taskId: string; reason: string }[] = [];
      const { orch, coordinator } = makeOrchestrator(root, undefined, (taskId, reason) =>
        conflicts.push({ taskId, reason }),
      );
      coordinator.enqueue({ id: "0020", branch: "feat/t20" } as never);

      const res = await orch.processNext();

      expect(res.ok).toBe(false);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].taskId).toBe("0020");
      expect(conflicts[0].reason).toContain("merge conflict in src/a.ts");

      const job = coordinator.getJob("0020");
      expect(job?.phase).toBe("failed");
      expect(job?.failedPhase).toBe("validating");
      expect(job?.reason).toContain("merge conflict in src/a.ts");
    } finally {
      clean();
    }
  });
});
