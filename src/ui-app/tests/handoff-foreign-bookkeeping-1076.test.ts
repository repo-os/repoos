/**
 * A task branch must never carry another task's `work/` bookkeeping (#1076).
 *
 * A self-check WIP checkpoint, a concurrent board write, or a partial merge of
 * main can leave a sibling task's `work/<other-id>-*.md` (or its report) on the
 * branch. `restoreForeignTaskBookkeepingFromMain` heals that at handoff — before
 * the review lock — by restoring main's copy as one bookkeeping commit, so the
 * landing preflight's "Task scope" check passes instead of failing with "the
 * diff changes another task's bookkeeping".
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorktree, restoreForeignTaskBookkeepingFromMain } from "../../core/git.js";
import { evaluateTaskScopeCheck } from "../../core/landable.js";
import { rmFixture } from "./helpers";

const BRANCH = "feat/handoff-foreign-1076";
const TASK_ID = "1076";
const OWN_FILE = `work/${TASK_ID}-handoff-foreign.md`;

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function repoWithTaskBranch(): { root: string; wt: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-handoff-foreign-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  mkdirSync(join(root, "work", "reports", "2000"), { recursive: true });
  mkdirSync(join(root, "work", "reports", TASK_ID), { recursive: true });
  writeFileSync(join(root, OWN_FILE), '---\nid: "1076"\n---\nown\n');
  writeFileSync(join(root, "work", "2000-other.md"), '---\nid: "2000"\n---\nMAIN copy\n');
  writeFileSync(join(root, "work", "reports", "2000", "review-1.md"), "main report\n");
  writeFileSync(join(root, "src.ts"), "export const v = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const created = ensureWorktree(root, BRANCH);
  expect(created.ok).toBe(true);
  return { root, wt: created.path, clean: () => rmFixture(root) };
}

describe("restoreForeignTaskBookkeepingFromMain (#1076)", () => {
  it("restores main's copy of a sibling's bookkeeping as one bookkeeping commit", async () => {
    const fx = repoWithTaskBranch();
    try {
      // The branch committed its own source work, its own report, AND a
      // sibling task's file + report (the stray-bookkeeping shape).
      writeFileSync(join(fx.wt, "src.ts"), "export const v = 2;\n");
      writeFileSync(join(fx.wt, "work", "2000-other.md"), '---\nid: "2000"\n---\nSTALE DRIFT\n');
      writeFileSync(join(fx.wt, "work", "reports", "2000", "review-1.md"), "stale report\n");
      mkdirSync(join(fx.wt, "work", "reports", TASK_ID), { recursive: true });
      writeFileSync(join(fx.wt, "work", "reports", TASK_ID, "round-1.json"), '{"ok":true}\n');
      git(fx.wt, ["add", "-A"]);
      git(fx.wt, ["commit", "-q", "-m", "feat(1076): work + stray bookkeeping"]);

      const restored = await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wt,
        baseBranch: "main",
        taskId: TASK_ID,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });

      expect(restored.sort()).toEqual(["work/2000-other.md", "work/reports/2000/review-1.md"]);
      // Main's copy is back, byte for byte.
      expect(readFileSync(join(fx.wt, "work", "2000-other.md"), "utf8")).toBe(
        '---\nid: "2000"\n---\nMAIN copy\n',
      );
      expect(readFileSync(join(fx.wt, "work", "reports", "2000", "review-1.md"), "utf8")).toBe(
        "main report\n",
      );
      // The branch's own work and its own report survive; nothing is left dirty.
      expect(readFileSync(join(fx.wt, "src.ts"), "utf8")).toBe("export const v = 2;\n");
      expect(git(fx.wt, ["status", "--porcelain"])).toBe("");

      // The branch's diff against main no longer names the sibling's files, so
      // the landing preflight's Task scope check passes.
      const changed = git(fx.wt, ["diff", "--name-only", "main...HEAD"])
        .split("\n")
        .filter(Boolean);
      expect(changed).not.toContain("work/2000-other.md");
      expect(changed).not.toContain("work/reports/2000/review-1.md");
      const scope = evaluateTaskScopeCheck({
        changedPaths: changed,
        ownTaskFile: OWN_FILE,
        taskId: TASK_ID,
        bookkeeping: { workDir: "work", inputsDir: "inputs", storiesDir: "stories" },
      });
      expect(scope.status).toBe("pass");
    } finally {
      fx.clean();
    }
  });

  it("removes a sibling file the branch newly added, and reports a failing preflight before the restore", async () => {
    const fx = repoWithTaskBranch();
    try {
      writeFileSync(join(fx.wt, "src.ts"), "export const v = 3;\n");
      writeFileSync(join(fx.wt, "work", "2001-stray.md"), '---\nid: "2001"\n---\nnew\n');
      git(fx.wt, ["add", "-A"]);
      git(fx.wt, ["commit", "-q", "-m", "feat(1076): work + stray add"]);

      const before = git(fx.wt, ["diff", "--name-only", "main...HEAD"]).split("\n").filter(Boolean);
      const preflight = evaluateTaskScopeCheck({
        changedPaths: before,
        ownTaskFile: OWN_FILE,
        taskId: TASK_ID,
        bookkeeping: { workDir: "work", inputsDir: "inputs", storiesDir: "stories" },
      });
      expect(preflight.status).toBe("fail");
      expect(preflight.detail).toContain("another task's bookkeeping");
      expect(preflight.detail).toContain("work/2001-stray.md");

      const restored = await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wt,
        baseBranch: "main",
        taskId: TASK_ID,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });
      expect(restored).toEqual(["work/2001-stray.md"]);
      const after = git(fx.wt, ["diff", "--name-only", "main...HEAD"]).split("\n").filter(Boolean);
      expect(after).not.toContain("work/2001-stray.md");
      expect(
        evaluateTaskScopeCheck({
          changedPaths: after,
          ownTaskFile: OWN_FILE,
          taskId: TASK_ID,
          bookkeeping: { workDir: "work", inputsDir: "inputs", storiesDir: "stories" },
        }).status,
      ).toBe("pass");
    } finally {
      fx.clean();
    }
  });

  it("removes a dirty branch-added sibling without throwing (#1076 round 2)", async () => {
    const fx = repoWithTaskBranch();
    try {
      // The branch ADDED a sibling file (so it is not at the base) and the
      // server then wrote it again, leaving a dirty working-tree copy. Plain
      // `git rm` refuses on a dirty copy; the restore must force it.
      writeFileSync(join(fx.wt, "src.ts"), "export const v = 5;\n");
      writeFileSync(join(fx.wt, "work", "2002-stray.md"), '---\nid: "2002"\n---\nbranch copy\n');
      git(fx.wt, ["add", "work/2002-stray.md", "src.ts"]);
      git(fx.wt, ["commit", "-q", "-m", "feat(1076): add stray sibling"]);
      writeFileSync(join(fx.wt, "work", "2002-stray.md"), '---\nid: "2002"\n---\nboard write\n');

      const restored = await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wt,
        baseBranch: "main",
        taskId: TASK_ID,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });

      expect(restored).toEqual(["work/2002-stray.md"]);
      expect(existsSync(join(fx.wt, "work", "2002-stray.md"))).toBe(false);
      expect(git(fx.wt, ["status", "--porcelain"])).toBe("");
      const changed = git(fx.wt, ["diff", "--name-only", "main...HEAD"]).split("\n").filter(Boolean);
      expect(changed).not.toContain("work/2002-stray.md");
    } finally {
      fx.clean();
    }
  });

  it("leaves the task's own staged work untouched while restoring committed drift (#1076 round 2)", async () => {
    const fx = repoWithTaskBranch();
    try {
      // The branch committed a sibling's bookkeeping (the drift the restore
      // heals) AND the task's own source change is left staged-but-uncommitted
      // — the pathspec-scoped restore commit must not sweep it in.
      writeFileSync(join(fx.wt, "src.ts"), "export const v = 6;\n");
      git(fx.wt, ["add", "src.ts"]);
      git(fx.wt, ["commit", "-q", "-m", "feat(1076): own work in progress"]);
      writeFileSync(join(fx.wt, "work", "2000-other.md"), '---\nid: "2000"\n---\nDRIFT\n');
      git(fx.wt, ["add", "work/2000-other.md"]);
      git(fx.wt, ["commit", "-q", "-m", "feat(1076): stray sibling committed"]);
      // A further own-work edit stays staged while the restore runs.
      writeFileSync(join(fx.wt, "src.ts"), "export const v = 7;\n");
      git(fx.wt, ["add", "src.ts"]);

      const restored = await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wt,
        baseBranch: "main",
        taskId: TASK_ID,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });

      expect(restored).toEqual(["work/2000-other.md"]);
      // The restore commit carries only the foreign path; the task's own staged
      // source edit is still staged, not committed by the restore.
      const committed = git(fx.wt, ["show", "--name-only", "--format=", "HEAD"])
        .split("\n")
        .filter(Boolean);
      expect(committed).toEqual(["work/2000-other.md"]);
      const stillStaged = git(fx.wt, ["diff", "--cached", "--name-only"])
        .split("\n")
        .filter(Boolean);
      expect(stillStaged).toContain("src.ts");
    } finally {
      fx.clean();
    }
  });

  it("is a no-op when the branch carries only its own files", async () => {
    const fx = repoWithTaskBranch();
    try {
      writeFileSync(join(fx.wt, "src.ts"), "export const v = 4;\n");
      git(fx.wt, ["add", "-A"]);
      git(fx.wt, ["commit", "-q", "-m", "feat(1076): clean work"]);
      const headBefore = git(fx.wt, ["rev-parse", "HEAD"]);
      const restored = await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wt,
        baseBranch: "main",
        taskId: TASK_ID,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });
      expect(restored).toEqual([]);
      expect(git(fx.wt, ["rev-parse", "HEAD"])).toBe(headBefore);
    } finally {
      fx.clean();
    }
  });
});
