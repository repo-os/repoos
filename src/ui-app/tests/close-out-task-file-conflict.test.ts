/**
 * #0754 — a close-out conflict whose ONLY path is the closing task's own
 * `work/<id>-*.md` must auto-resolve (take main's copy) and continue; a code
 * conflict anywhere in the set still refuses and reports the file list.
 *
 * These exercise the real merge (`mergeBranch`, the same call the close-out
 * orchestrator makes) and the narrow-resolution `applyUnionResolution` step
 * against real git repos, so the guarantee is tested at the level the pipeline
 * actually runs it, not only in the pure classifier.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree, mergeBranch } from "../../core/git.js";
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
  const root = mkdtempSync(join(tmpdir(), "repoos-taskfile-conflict-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

/** The close-out merge's options: the task file takes the branch side at
 *  validate, other bookkeeping keeps main. Same shape as the orchestrator. */
const closeOutMergeOpts = (ownFile: string) => ({
  autoResolve: [ownFile],
  autoResolveOurs: ["work/", "inputs/", "stories/"],
});

function makeOrchestrator(root: string, getTask?: (id: string) => Task | null) {
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
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  const applyUnionResolution = (
    taskId: string,
    wtPath: string,
    branch: string,
    paths: string[],
  ): Promise<{ ok: boolean; strategy?: string }> =>
    (
      orch as never as {
        applyUnionResolution: (
          t: string,
          w: string,
          b: string,
          p: string[],
        ) => Promise<{ ok: boolean; strategy?: string }>;
      }
    ).applyUnionResolution(taskId, wtPath, branch, paths);
  return { applyUnionResolution };
}

describe("close-out merge auto-resolves a task-file-only conflict (#0754)", () => {
  it("merges when the ONLY conflict is the closing task's own file", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "work/0023-task.md", "status: review\n", "add task");
      const wt = ensureWorktree(root, "feat/t1").path!;
      commitFile(wt, "work/0023-task.md", "status: active\n\nbranch log\n", "branch task edit");
      commitFile(root, "work/0023-task.md", "status: review\n\nmain log\n", "main task edit");

      const merge = await mergeBranch(root, "feat/t1", closeOutMergeOpts("work/0023-task.md"));

      expect(merge.merged).toBe(true);
      expect(merge.conflicts).toEqual([]);
      // The task file's conflict is not left behind: the merge committed cleanly.
      expect(git(root, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });

  it("refuses and reports the code file when a code conflict joins the task file", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "work/0023-task.md", "status: review\n", "add task");
      commitFile(root, "src/a.ts", "base\n", "add src");
      const wt = ensureWorktree(root, "feat/t2").path!;
      commitFile(wt, "work/0023-task.md", "status: active\n", "branch task edit");
      commitFile(wt, "src/a.ts", "branch\n", "branch src edit");
      commitFile(root, "work/0023-task.md", "status: review\n\nmain log\n", "main task edit");
      commitFile(root, "src/a.ts", "main\n", "main src edit");

      const merge = await mergeBranch(root, "feat/t2", closeOutMergeOpts("work/0023-task.md"));

      expect(merge.merged).toBe(false);
      // The refusal names the REAL culprit — never the task-file bookkeeping the
      // close-out auto-resolves anyway.
      expect(merge.conflicts).toEqual(["src/a.ts"]);
      // Nothing half-applied: the merge was aborted.
      expect(git(root, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });
});

describe("narrow resolution of a task-file-only conflict (#0754)", () => {
  it("takes main's copy of the task file and completes the resolution", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "work/0023-task.md", "status: review\n", "add task");
      const wt = ensureWorktree(root, "feat/t3").path!;
      commitFile(wt, "work/0023-task.md", "status: active\n\nbranch log\n", "branch task edit");
      commitFile(root, "work/0023-task.md", "status: review\n\nmain log\n", "main task edit");
      // The narrow path runs in the isolated candidate, exactly as the
      // orchestrator does — never against the main checkout itself.
      const candidate = ensureWorktree(root, "candidate-0023").path!;

      const task = {
        id: "0023",
        absPath: join(root, "work", "0023-task.md"),
      } as Task;
      const { applyUnionResolution } = makeOrchestrator(root, () => task);

      const result = await applyUnionResolution("0023", candidate, "feat/t3", [
        "work/0023-task.md",
      ]);

      expect(result.ok).toBe(true);
      expect(result.strategy).toBe("task-file-main");
      // main's bookkeeping copy is what landed, not the branch's.
      expect(git(candidate, ["show", "HEAD:work/0023-task.md"])).toBe("status: review\n\nmain log");
      expect(git(candidate, ["status", "--porcelain"])).toBe("");
    } finally {
      clean();
    }
  });
});
