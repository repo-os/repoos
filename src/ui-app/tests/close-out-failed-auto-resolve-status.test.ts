/**
 * #0838 — a failed close-out (including publish-time auto-resolve failure) must
 * leave the closing task in `review` on main, never demote to `inbox`.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import * as git from "../../core/git.js";
import { parseTask } from "../../core/task.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import { preserveClosingTaskReviewStatusOnMain } from "../../server/close-out-task-status.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { createRepositoryLock, createRootLock } from "../../server/repo-lock.js";

function gitCmd(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-0838-"));
  gitCmd(root, ["init", "-q", "-b", "main"]);
  gitCmd(root, ["config", "user.email", "t@example.com"]);
  gitCmd(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "README.md"), "hi\n");
  gitCmd(root, ["add", "README.md", ".gitignore"]);
  gitCmd(root, ["commit", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

function taskFile(root: string, id: string, status: string): string {
  const path = join(root, "work", `${id}-close-out-status.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `---\nid: "${id}"\ntitle: Close-out status fixture\ntype: bug\nstatus: ${status}\npriority: p2\nassigned_to: ai\n---\n\n## Problem\n\nx\n`,
  );
  gitCmd(root, ["add", path]);
  gitCmd(root, ["commit", "-m", `docs(${id}): add task`]);
  return path;
}

function readStatus(root: string, absPath: string): string {
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  }).status;
}

describe("preserveClosingTaskReviewStatusOnMain (#0838)", () => {
  it("restores inbox on main to review without writing inbox", async () => {
    const { root, clean } = makeRepo();
    try {
      const id = "0838";
      const absPath = taskFile(root, id, "review");
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      writeFileSync(
        absPath,
        readFileSync(absPath, "utf8").replace("status: review", "status: inbox"),
      );
      expect(readStatus(root, absPath)).toBe("inbox");

      await preserveClosingTaskReviewStatusOnMain(config, id);

      expect(readStatus(root, absPath)).toBe("review");
      expect(readFileSync(absPath, "utf8")).not.toMatch(/^status: inbox/m);
    } finally {
      clean();
    }
  });

  it("leaves done tasks unchanged", async () => {
    const { root, clean } = makeRepo();
    try {
      const id = "0838d";
      const absPath = taskFile(root, id, "done");
      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      await preserveClosingTaskReviewStatusOnMain(config, id);
      expect(readStatus(root, absPath)).toBe("done");
    } finally {
      clean();
    }
  });
});

describe("close-out auto-resolve failure keeps review (#0838)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records failed publish and leaves status review so a retry can merge", async () => {
    const { root, clean } = makeRepo();
    try {
      const id = "0838p";
      const absPath = taskFile(root, id, "review");
      const branch = "repoos/integrate/0838p";
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path!, "feature.txt"), "new\n");
      gitCmd(wt.path!, ["add", "feature.txt"]);
      gitCmd(wt.path!, ["commit", "-m", "candidate work"]);
      const mainSha = gitCmd(root, ["rev-parse", "main"]);
      const candidateSha = gitCmd(wt.path!, ["rev-parse", "HEAD"]);

      const coordinator = createJobCoordinator(root);
      const task = { id, branch, absPath, path: relative(root, absPath), status: "review" } as Task;
      coordinator.enqueue(task as any);
      coordinator.updateJob(id, {
        phase: "publishing",
        startedAt: new Date().toISOString(),
        baseMainSha: mainSha,
        branchSha: candidateSha,
        candidateSha,
      });

      // Simulate the #0829 failure shape: auto-resolve of the task file failed
      // on main and left a stale inbox copy dirty on disk.
      writeFileSync(
        absPath,
        readFileSync(absPath, "utf8").replace("status: review", "status: inbox"),
      );

      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      const orchestrator = new CloseOutOrchestrator(
        config,
        coordinator,
        createRepositoryLock(root),
        createRootLock(root),
        (tid) => (tid === id ? task : null),
      );

      const realMerge = git.mergeBranch;
      let failPublishOnce = true;
      vi.spyOn(git, "mergeBranch").mockImplementation(async (mergeRoot, mergeBranchName, opts) => {
        if (failPublishOnce && mergeRoot === root && mergeBranchName === branch && !opts?.dryRun) {
          failPublishOnce = false;
          return {
            merged: false,
            ff: false,
            conflicts: [],
            reason: `auto-resolve failed for work/${id}-close-out-status.md: simulated`,
          };
        }
        return realMerge(mergeRoot, mergeBranchName, opts);
      });

      const first = await orchestrator.processNext();
      expect(first.ok).toBe(false);
      expect(first.reason).toMatch(/auto-resolve failed/);
      expect(coordinator.getJob(id)?.phase).toBe("failed");
      expect(readStatus(root, absPath)).toBe("review");

      // Move to done again — failed jobs re-enqueue without manual status repair.
      coordinator.enqueue({ ...task, status: "review" } as Task);
      expect(coordinator.getJob(id)?.phase).toBe("queued");

      const second = await orchestrator.processNext();
      expect(second.ok).toBe(true);
      expect(gitCmd(root, ["rev-parse", "main"])).not.toBe(mainSha);
      expect(readStatus(root, absPath)).toBe("done");
    } finally {
      clean();
    }
  }, 30_000);
});

describe("close-out failure paths never target inbox (#0838)", () => {
  it("failOrReconcile restores review via preserveClosingTaskReviewStatusOnMain", () => {
    const src = readFileSync(join(process.cwd(), "src/server/integration-orchestrator.ts"), "utf8");
    expect(src).toContain("preserveClosingTaskReviewStatusOnMain");
    const preserveSrc = readFileSync(
      join(process.cwd(), "src/server/close-out-task-status.ts"),
      "utf8",
    );
    expect(preserveSrc).not.toMatch(/status:\s*["']inbox["']/);
    expect(preserveSrc).toMatch(/status:\s*["']review["']/);
  });
});
