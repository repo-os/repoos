/**
 * End-to-end fact gathering for `repoos landable` (#0867): a real branch and
 * worktree, so merge-tree conflicts, review-lock drift and task-scope drift are
 * classified from actual git state rather than hand-built facts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorktree } from "../../core/git.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { gatherLandable } from "../../server/landable.js";
import type { ReviewReport } from "../../server/review.js";
import { writeWorktreeReviewLock } from "../../server/worktree-handoff-guard.js";
import { rmFixture } from "./helpers";

const BRANCH = "feat/landable";
const TASK_ID = "0867";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; wt: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-landable-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "init.defaultBranch", "main"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "work", "0867-landable.md"), "---\nid: 0867\n---\n");
  writeFileSync(join(root, "src", "core.ts"), 'export const value = "main";\n');
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "-M", "main"]);

  const created = ensureWorktree(root, BRANCH);
  expect(created.ok).toBe(true);
  return { root, wt: created.path, clean: () => rmFixture(root) };
}

function configFor(root: string): RepoOSConfig {
  return {
    root,
    cacheDir: ".repoos",
    workDir: "work",
    inputsDir: "inputs",
    storiesDir: "stories",
    remindersDir: "reminders",
    schedulesDir: "schedules",
  } as RepoOSConfig;
}

function taskFor(root: string): Task {
  return {
    id: TASK_ID,
    title: "Landable",
    type: "feature",
    status: "review",
    path: `work/${TASK_ID}-landable.md`,
    absPath: join(root, "work", `${TASK_ID}-landable.md`),
    branch: BRANCH,
    body: "## Activity\n\n- 2026-10-20T10:00:00Z · status active→review\n",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p1",
    area: "core",
    areas: ["core"],
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    tags: [],
    created_at: null,
    updated_at: null,
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    hotfix: false,
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  } as Task;
}

function reportFor(markdown = "## Verdict\ngood to go — ship it.\n"): ReviewReport {
  return {
    id: TASK_ID,
    at: "2026-10-20T11:00:00Z",
    agent: "reviewer",
    cli: "opencode",
    model: "test",
    branch: BRANCH,
    state: "ok",
    markdown,
  };
}

// #0894 — the landable check must reach the same verdict as the parser.
const EMPTY_BUGS_PHRASINGS = [
  "",
  "None",
  "None found",
  "None found.",
  "No bugs",
  "No bugs found",
  "No issues found",
  "N/A",
  "Nothing found",
  "-",
];
const FINDING_BUGS_PHRASINGS = [
  "- Off-by-one in parser",
  "1. Crash on empty input",
  "**Bug:** crash on empty input",
  "None found.\n\n- Off-by-one in parser",
];

function lockAt(root: string, wt: string): void {
  writeWorktreeReviewLock(root, ".repoos", TASK_ID, {
    status: "review",
    sha: git(wt, ["rev-parse", "HEAD"]),
    at: "2026-10-20T10:00:00Z",
  });
}

function commitAll(wt: string, message: string): void {
  git(wt, ["add", "-A"]);
  git(wt, ["commit", "-m", message]);
}

describe("gatherLandable", () => {
  it("passes on a clean branch whose lock matches HEAD", async () => {
    const { root, wt, clean } = makeRepo();
    try {
      writeFileSync(join(wt, "src", "feature.ts"), "export const feature = true;\n");
      commitAll(wt, "feature");
      lockAt(root, wt);

      const result = await gatherLandable(configFor(root), taskFor(root), reportFor());
      expect(result.landable).toBe(true);
      expect(result.summary.fail).toBe(0);
      expect(result.checks.find((c) => c.id === "merge-conflicts")?.status).toBe("pass");
      expect(result.checks.find((c) => c.id === "task-scope")?.status).toBe("pass");
    } finally {
      clean();
    }
  });

  it.each(EMPTY_BUGS_PHRASINGS)(
    "does not report blocking bugs for a none-ish Bugs section %j (#0894)",
    async (phrasing) => {
      const { root, wt, clean } = makeRepo();
      try {
        writeFileSync(join(wt, "src", "feature.ts"), "export const feature = true;\n");
        commitAll(wt, "feature");
        lockAt(root, wt);

        const result = await gatherLandable(
          configFor(root),
          taskFor(root),
          reportFor(`## Verdict\ngood to go — ship it.\n\n## Bugs\n${phrasing}\n`),
        );
        expect(result.checks.find((c) => c.id === "review-verdict")?.status).toBe("pass");
        expect(result.landable).toBe(true);
      } finally {
        clean();
      }
    },
  );

  it.each(FINDING_BUGS_PHRASINGS)(
    "reports blocking bugs for a real Bugs finding %j (#0894)",
    async (phrasing) => {
      const { root, wt, clean } = makeRepo();
      try {
        writeFileSync(join(wt, "src", "feature.ts"), "export const feature = true;\n");
        commitAll(wt, "feature");
        lockAt(root, wt);

        const result = await gatherLandable(
          configFor(root),
          taskFor(root),
          reportFor(`## Verdict\ngood to go — ship it.\n\n## Bugs\n${phrasing}\n`),
        );
        const review = result.checks.find((c) => c.id === "review-verdict");
        expect(review?.status).toBe("fail");
        expect(review?.detail).toBe("the review still lists blocking bugs");
        expect(result.landable).toBe(false);
      } finally {
        clean();
      }
    },
  );

  it("names a real source conflict with main", async () => {
    const { root, wt, clean } = makeRepo();
    try {
      writeFileSync(join(wt, "src", "core.ts"), 'export const value = "branch";\n');
      commitAll(wt, "branch change");
      lockAt(root, wt);
      // main moves on the same line after the branch committed.
      writeFileSync(join(root, "src", "core.ts"), 'export const value = "main moved";\n');
      git(root, ["add", "src/core.ts"]);
      git(root, ["commit", "-m", "main change"]);

      const result = await gatherLandable(configFor(root), taskFor(root), reportFor());
      expect(result.landable).toBe(false);
      const merge = result.checks.find((c) => c.id === "merge-conflicts");
      expect(merge?.status).toBe("fail");
      expect(merge?.detail).toBe(
        "src/core.ts conflicts with main: merge main into the branch, keep both sides",
      );
    } finally {
      clean();
    }
  });

  it("fails when the review lock is not the worktree HEAD", async () => {
    const { root, wt, clean } = makeRepo();
    try {
      writeFileSync(join(wt, "src", "feature.ts"), "export const feature = true;\n");
      commitAll(wt, "feature");
      writeWorktreeReviewLock(root, ".repoos", TASK_ID, {
        status: "review",
        sha: "0".repeat(40),
        at: "2026-10-20T10:00:00Z",
      });

      const result = await gatherLandable(configFor(root), taskFor(root), reportFor());
      const lock = result.checks.find((c) => c.id === "review-lock");
      expect(lock?.status).toBe("fail");
      expect(lock?.detail).toMatch(/the review lock is at 0000000 but the worktree is at/);
    } finally {
      clean();
    }
  });

  it("fails when the diff drifts into another task's file", async () => {
    const { root, wt, clean } = makeRepo();
    try {
      writeFileSync(join(wt, "src", "feature.ts"), "export const feature = true;\n");
      mkdirSync(join(wt, "work"), { recursive: true });
      writeFileSync(join(wt, "work", "0123-other.md"), "---\nid: 0123\n---\n");
      commitAll(wt, "feature plus foreign task file");
      lockAt(root, wt);

      const result = await gatherLandable(configFor(root), taskFor(root), reportFor());
      const scope = result.checks.find((c) => c.id === "task-scope");
      expect(scope?.status).toBe("fail");
      expect(scope?.detail).toBe("the diff changes another task's bookkeeping: work/0123-other.md");
    } finally {
      clean();
    }
  });
});
