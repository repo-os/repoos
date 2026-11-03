/**
 * #1013 — a review report is committed with the task and does not invalidate
 * the review lock / handoff snapshot.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { ensureWorktree } from "../../core/git.js";
import { persistTrackedReviewReport } from "../../server/review-report-store.js";
import { reviewTreeIdentityForTask } from "../../server/review-tree-identity.js";
import {
  readHandoffSnapshot,
  readWorktreeReviewLock,
  recordWorktreeHandoffProtection,
  verifyWorktreeHandoffIntegrity,
} from "../../server/worktree-handoff-guard.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

describe("tracked review reports (#1013)", () => {
  it("commits the pass, keeps the worktree clean, and advances the review lock", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-report-"));
    try {
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      writeFileSync(join(root, ".gitignore"), ".repoos/\n");
      writeFileSync(join(root, "README.md"), "hi\n");
      git(root, ["add", "README.md", ".gitignore"]);
      git(root, ["commit", "-m", "init"]);
      git(root, ["branch", "-M", "main"]);

      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      await recordWorktreeHandoffProtection(config, "1013", "main", root);
      const handoffSha = git(root, ["rev-parse", "HEAD"]);
      expect(readWorktreeReviewLock(root, ".repoos", "1013")?.sha).toBe(handoffSha);

      const result = await persistTrackedReviewReport({
        config,
        worktree: root,
        branch: "main",
        taskId: "1013",
        pass: 1,
        content: '---\ntask: "1013"\npass: 1\nstate: ok\n---\n\n## Verdict\ngood to go\n',
      });

      expect(result).toEqual({ tracked: true, committed: true });
      const reportPath = join(root, "work", "reports", "1013", "review-1.md");
      expect(existsSync(reportPath)).toBe(true);
      expect(readFileSync(reportPath, "utf8")).toContain("good to go");

      const head = git(root, ["rev-parse", "HEAD"]);
      expect(head).not.toBe(handoffSha);
      expect(readWorktreeReviewLock(root, ".repoos", "1013")?.sha).toBe(head);
      expect(readHandoffSnapshot(root, ".repoos", "1013")?.sha).toBe(head);
      expect(git(root, ["status", "--porcelain"])).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the reviewed tree identity stable across the report commit (#1013)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-report-wt-"));
    try {
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      writeFileSync(join(root, ".gitignore"), ".repoos/\n");
      writeFileSync(join(root, "README.md"), "hi\n");
      git(root, ["add", "README.md", ".gitignore"]);
      git(root, ["commit", "-m", "init"]);
      git(root, ["branch", "-M", "main"]);

      const branch = "feat/review-reports";
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      if (!wt.ok) return;
      writeFileSync(join(wt.path, "impl.ts"), "export const x = 1;\n");
      git(wt.path, ["add", "impl.ts"]);
      git(wt.path, ["commit", "-m", "implementation"]);

      const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
      const task = { id: "1013", branch, path: "work/1013-task.md" } as Task;
      await recordWorktreeHandoffProtection(config, "1013", branch, wt.path);
      const before = await reviewTreeIdentityForTask(config, task);

      const result = await persistTrackedReviewReport({
        config,
        worktree: wt.path,
        branch,
        taskId: "1013",
        pass: 1,
        content: '---\ntask: "1013"\npass: 1\nstate: ok\n---\n\n## Verdict\nneeds some work\n',
      });
      expect(result).toEqual({ tracked: true, committed: true });

      const after = await reviewTreeIdentityForTask(config, task);
      expect(after).toBe(before);
      const head = git(wt.path, ["rev-parse", "HEAD"]);
      expect(readWorktreeReviewLock(root, ".repoos", "1013")?.sha).toBe(head);
      expect(readHandoffSnapshot(root, ".repoos", "1013")?.sha).toBe(head);
      const integrity = await verifyWorktreeHandoffIntegrity(config, branch, head, {
        taskId: "1013",
      });
      expect(integrity.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
