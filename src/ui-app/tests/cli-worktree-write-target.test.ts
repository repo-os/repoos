/**
 * Regression for a real incident (#0202): `repoos mv`/`update`/`new` used
 * plain createRepoOS(), which resolves via findRepoRoot() — nearest-root,
 * cwd-relative. Run from inside a task's linked worktree (which has its own
 * `.git`), that landed the write on the WORKTREE's own copy of the task
 * file, invisible to the live board, which only ever reads the main
 * checkout's copy. The agent reported success ("task is now in review")
 * while the real board silently stayed on the old status.
 *
 * Fix: cmdMv/cmdUpdate/cmdNew now resolve through boardRepoOS(), same as
 * every read command already did — always the main checkout, even when cwd
 * is inside a worktree.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git";
import { cmdMv, cmdUpdate, cmdNew } from "../../commands/tasks";
import { parseShotPlan } from "../../core/shot-plan";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const rp = (p: string): string => realpathSync(p);

function makeRepoWithTask(): { root: string; taskPath: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-cliwt-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  const taskPath = join(root, "work", "0001-test.md");
  writeFileSync(
    taskPath,
    `---\nid: "0001"\ntitle: Test task\ntype: feature\nstatus: active\npriority: p2\narea: web\nassigned_to: ai\nbranch: feat/test\n---\nBody.\n`,
  );
  writeFileSync(join(root, "repoos.toml"), "");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return { root, taskPath, clean: () => rmFixture(root) };
}

async function withCwd<T>(dir: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

describe("board-write commands resolve to the main checkout, not cwd (#0202)", () => {
  it("cmdMv run from inside a task worktree updates the MAIN checkout's task file", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    try {
      const wtRes = ensureWorktree(root, "feat/test", "work/0001-test.md");
      expect(wtRes.ok).toBe(true);
      const wt = wtRes.path;
      expect(rp(wt)).not.toBe(rp(root));

      await withCwd(wt, () => {
        cmdMv("0001", "review");
      });

      const mainContent = readFileSync(taskPath, "utf8");
      expect(mainContent).toMatch(/^status: review$/m);

      const wtTaskPath = join(wt, "work", "0001-test.md");
      // The worktree's own copy is untouched by this write (git worktree
      // add makes a fresh checkout of the committed content at branch time).
      const wtContent = readFileSync(wtTaskPath, "utf8");
      expect(wtContent).toMatch(/^status: active$/m);
    } finally {
      clean();
    }
  });

  it("cmdUpdate run from inside a task worktree updates the MAIN checkout's task file", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    try {
      const wtRes = ensureWorktree(root, "feat/test", "work/0001-test.md");
      const wt = wtRes.path;

      await withCwd(wt, () => {
        cmdUpdate(["0001", "--title", "Updated from worktree"]);
      });

      const mainContent = readFileSync(taskPath, "utf8");
      expect(mainContent).toMatch(/^title: Updated from worktree$/m);
    } finally {
      clean();
    }
  });

  it("cmdUpdate refuses --section-body without --section instead of dropping it (#0613)", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    const prevExit = process.exitCode;
    try {
      await withCwd(root, () => {
        cmdUpdate(["0001", "--title", "Should not apply", "--section-body", "orphaned content"]);
      });
      expect(process.exitCode).toBe(1);
      expect(readFileSync(taskPath, "utf8")).not.toMatch(/Should not apply/);
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("cmdUpdate --shots validates JSON and writes a fenced declaration", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    try {
      await withCwd(root, () => {
        cmdUpdate([
          "0001",
          "--shots",
          '[{"target":"default","route":"/agents?tab=providers","label":"Providers"}]',
        ]);
      });
      const body = readFileSync(taskPath, "utf8");
      expect(body).toContain("## Shots\n```json\n[");
      expect(parseShotPlan(body)).toEqual({
        shots: [{ target: "default", route: "/agents?tab=providers", label: "Providers" }],
        errors: [],
      });
    } finally {
      clean();
    }
  });

  it("cmdUpdate rejects an unfenced Shots section before writing", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    const prevExit = process.exitCode;
    try {
      const before = readFileSync(taskPath, "utf8");
      await withCwd(root, () => {
        cmdUpdate(["0001", "--section", "Shots", "--section-body", '[{"route":"/agents"}]']);
      });
      expect(process.exitCode).toBe(1);
      expect(readFileSync(taskPath, "utf8")).toBe(before);
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("cmdNew --shots formats the section and rejects malformed input", async () => {
    const { root, clean } = makeRepoWithTask();
    const prevExit = process.exitCode;
    try {
      await withCwd(root, () => {
        cmdNew(["Bad shots", "--shots", "not-json"]);
      });
      expect(process.exitCode).toBe(1);
      expect(readdirSync(join(root, "work"))).toEqual(["0001-test.md"]);
      process.exitCode = prevExit;
      await withCwd(root, () => {
        cmdNew(["Good shots", "--shots", '[{"route":"/agents","label":"Agents"}]']);
      });
      const created = readdirSync(join(root, "work")).find((name) => name !== "0001-test.md");
      expect(created).toBeDefined();
      expect(parseShotPlan(readFileSync(join(root, "work", created!), "utf8"))).toEqual({
        shots: [{ route: "/agents", label: "Agents" }],
        errors: [],
      });
    } finally {
      process.exitCode = prevExit;
      clean();
    }
  });

  it("cmdNew run from inside a task worktree creates the task in the MAIN checkout's work/", async () => {
    const { root, clean } = makeRepoWithTask();
    try {
      const wtRes = ensureWorktree(root, "feat/test", "work/0001-test.md");
      const wt = wtRes.path;

      await withCwd(wt, () => {
        cmdNew(["A new task from inside a worktree"]);
      });

      const mainWorkDir = join(root, "work");
      const files = execFileSync("ls", [mainWorkDir], { encoding: "utf8" });
      expect(files).toMatch(/a-new-task-from-inside-a-worktree/);

      const wtWorkDir = join(wt, "work");
      const wtFiles = execFileSync("ls", [wtWorkDir], { encoding: "utf8" });
      expect(wtFiles).not.toMatch(/a-new-task-from-inside-a-worktree/);
    } finally {
      clean();
    }
  });
});
