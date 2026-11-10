/**
 * #1086: a task branch must not fail scope when main legitimately gained another
 * task's post-merge bookkeeping while the branch was open, and sync/handoff must
 * bring main's bytes onto the branch (not only the merge-base copy).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  branchChangedPaths,
  dropForeignBookkeepingPathsMatchingMain,
  ensureWorktree,
  restoreForeignTaskBookkeepingFromMain,
  syncBranchWithMain,
} from "../../core/git.js";
import { evaluateTaskScopeCheck, isForbiddenTaskScopePath } from "../../core/landable.js";
import { rmFixture } from "./helpers";

const TASK_B = "1086";
const TASK_A = "0003";
const OWN_FILE = `work/${TASK_B}-scope-bookkeeping.md`;
const BRANCH = "feat/task-b-1086";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function initTwoTaskRepo(): { root: string; wtB: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-1086-scope-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  mkdirSync(join(root, "work", "reports", TASK_A), { recursive: true });
  writeFileSync(join(root, OWN_FILE), `---\nid: "${TASK_B}"\n---\nown\n`);
  writeFileSync(join(root, "src.ts"), "export const v = 0;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);

  const created = ensureWorktree(root, BRANCH);
  expect(created.ok).toBe(true);
  return { root, wtB: created.path, clean: () => rmFixture(root) };
}

describe("foreign bookkeeping after main lands another task (#1086)", () => {
  it("restoreForeignTaskBookkeepingFromMain checks out main's post-merge reports, not merge-base", async () => {
    const fx = initTwoTaskRepo();
    try {
      // Task B works on its branch while task A's close-out writes to main.
      writeFileSync(join(fx.wtB, "src.ts"), "export const v = 1;\n");
      git(fx.wtB, ["add", "src.ts"]);
      git(fx.wtB, ["commit", "-q", "-m", "feat(1086): own work"]);

      mkdirSync(join(fx.root, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(fx.root, "work", "reports", TASK_A, "summary.md"), "task A landed\n");
      writeFileSync(join(fx.root, "work", "reports", TASK_A, "review-1.md"), "review on main\n");
      git(fx.root, ["add", "-A"]);
      git(fx.root, ["commit", "-q", "-m", "chore: task A post-merge bookkeeping"]);

      // Engineer WIP checkpoint folded wrong copies of the new main files.
      mkdirSync(join(fx.wtB, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(fx.wtB, "work", "reports", TASK_A, "summary.md"), "wrong branch copy\n");
      writeFileSync(join(fx.wtB, "work", "reports", TASK_A, "review-1.md"), "stale\n");
      git(fx.wtB, ["add", "-A"]);
      git(fx.wtB, ["commit", "-q", "-m", "WIP: stray sibling reports"]);

      const mergeBase = git(fx.wtB, ["merge-base", "main", "HEAD"]);
      expect(() =>
        git(fx.wtB, ["cat-file", "-e", `${mergeBase}:work/reports/${TASK_A}/summary.md`]),
      ).toThrow();

      const restored = await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wtB,
        baseBranch: "main",
        taskId: TASK_B,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });
      expect(restored.sort()).toEqual([
        `work/reports/${TASK_A}/review-1.md`,
        `work/reports/${TASK_A}/summary.md`,
      ]);
      // Post-merge siblings were not at the merge-base — they are dropped from the
      // branch, not copied from main into the branch diff.
      expect(readFileSync(join(fx.root, "work", "reports", TASK_A, "summary.md"), "utf8")).toBe(
        "task A landed\n",
      );
      expect(git(fx.wtB, ["status", "--porcelain"])).toBe("");

      const changed = await branchChangedPaths(fx.root, BRANCH, "main");
      expect(changed).not.toContain(`work/reports/${TASK_A}/summary.md`);
      const scope = evaluateTaskScopeCheck({
        changedPaths: changed ?? [],
        ownTaskFile: OWN_FILE,
        taskId: TASK_B,
        bookkeeping: { workDir: "work", inputsDir: "inputs", storiesDir: "stories" },
      });
      expect(scope.status).toBe("pass");
    } finally {
      fx.clean();
    }
  });

  it("dropForeignBookkeepingPathsMatchingMain passes scope when HEAD already matches main", async () => {
    const fx = initTwoTaskRepo();
    try {
      writeFileSync(join(fx.wtB, "src.ts"), "export const v = 2;\n");
      mkdirSync(join(fx.wtB, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(fx.wtB, "work", "reports", TASK_A, "summary.md"), "task A landed\n");
      git(fx.wtB, ["add", "-A"]);
      git(fx.wtB, ["commit", "-q", "-m", "feat + sibling report matching main"]);

      git(fx.root, ["checkout", "-q", "main"]);
      writeFileSync(join(fx.root, "work", "reports", TASK_A, "summary.md"), "task A landed\n");
      git(fx.root, ["add", "work/reports/0003/summary.md"]);
      git(fx.root, ["commit", "-q", "-m", "main post-merge"]);

      const raw = (await branchChangedPaths(fx.root, BRANCH, "main")) ?? [];
      expect(raw).toContain(`work/reports/${TASK_A}/summary.md`);

      const filtered = await dropForeignBookkeepingPathsMatchingMain(
        fx.root,
        BRANCH,
        "main",
        raw,
        (p) =>
          isForbiddenTaskScopePath(p, OWN_FILE, {
            workDir: "work",
            inputsDir: "inputs",
            storiesDir: "stories",
          }, TASK_B),
      );
      expect(filtered).not.toContain(`work/reports/${TASK_A}/summary.md`);
      expect(
        evaluateTaskScopeCheck({
          changedPaths: filtered,
          ownTaskFile: OWN_FILE,
          taskId: TASK_B,
          bookkeeping: { workDir: "work", inputsDir: "inputs", storiesDir: "stories" },
        }).status,
      ).toBe("pass");
    } finally {
      fx.clean();
    }
  });

  it("restore heals sibling bookkeeping even when sync aborts on that path", async () => {
    const fx = initTwoTaskRepo();
    try {
      writeFileSync(join(fx.wtB, "src.ts"), "export const v = 3;\n");
      git(fx.wtB, ["add", "src.ts"]);
      git(fx.wtB, ["commit", "-q", "-m", "feat(1086): branch work"]);

      git(fx.root, ["checkout", "-q", "main"]);
      mkdirSync(join(fx.root, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(fx.root, "work", "reports", TASK_A, "summary.md"), "on main\n");
      git(fx.root, ["add", "-A"]);
      git(fx.root, ["commit", "-q", "-m", "task A lands on main"]);

      mkdirSync(join(fx.wtB, "work", "reports", TASK_A), { recursive: true });
      writeFileSync(join(fx.wtB, "work", "reports", TASK_A, "summary.md"), "branch wrong\n");
      git(fx.wtB, ["add", "work/reports/0003/summary.md"]);
      git(fx.wtB, ["commit", "-q", "-m", "stray sibling"]);

      const sync = await syncBranchWithMain(fx.root, BRANCH);
      expect(sync.ok).toBe(false);
      expect(sync.conflicts).toContain(`work/reports/${TASK_A}/summary.md`);

      await restoreForeignTaskBookkeepingFromMain({
        worktree: fx.wtB,
        baseBranch: "main",
        taskId: TASK_B,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });

      const changed = await branchChangedPaths(fx.root, BRANCH, "main");
      expect(changed).not.toContain(`work/reports/${TASK_A}/summary.md`);
    } finally {
      fx.clean();
    }
  });

  it("restoreForeignTaskBookkeepingFromMain takes main's tip for siblings present at merge-base", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1086-at-base-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    writeFileSync(join(root, ".gitignore"), ".repoos/\n");
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, OWN_FILE), `---\nid: "${TASK_B}"\n---\nown\n`);
    writeFileSync(join(root, "work", "2000-other.md"), '---\nid: "2000"\n---\nMAIN v1\n');
    writeFileSync(join(root, "src.ts"), "export const v = 0;\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init with sibling"]);
    const created = ensureWorktree(root, BRANCH);
    expect(created.ok).toBe(true);
    const wtB = created.path;
    const clean = () => rmFixture(root);
  try {
      writeFileSync(join(wtB, "src.ts"), "export const v = 4;\n");
      writeFileSync(join(wtB, "work", "2000-other.md"), '---\nid: "2000"\n---\nDRIFT\n');
      git(wtB, ["add", "-A"]);
      git(wtB, ["commit", "-q", "-m", "stray sibling drift"]);

      git(root, ["checkout", "-q", "main"]);
      writeFileSync(join(root, "work", "2000-other.md"), '---\nid: "2000"\n---\nMAIN v2\n');
      git(root, ["add", "work/2000-other.md"]);
      git(root, ["commit", "-q", "-m", "main updated sibling"]);

      await restoreForeignTaskBookkeepingFromMain({
        worktree: wtB,
        baseBranch: "main",
        taskId: TASK_B,
        ownTaskFile: OWN_FILE,
        workDir: "work",
      });

      expect(readFileSync(join(wtB, "work", "2000-other.md"), "utf8")).toBe(
        '---\nid: "2000"\n---\nMAIN v2\n',
      );
      expect(() =>
        execFileSync("git", ["diff", "--quiet", "main", BRANCH, "--", "work/2000-other.md"], {
          cwd: wtB,
        }),
      ).not.toThrow();
    } finally {
      clean();
    }
  });
});
