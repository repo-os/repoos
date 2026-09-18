/**
 * Regression for a real incident confirmed live in this session (2026-09-17,
 * see #0399 and the #0185/#0389 close-out incidents): `repoos mv <id> done`
 * is a bare frontmatter rewrite (`core/repoos.ts` `updateStatus`) with zero
 * git/merge awareness — unlike the server's HTTP PATCH route, which already
 * refuses a bare `status: "done"` and forces callers through the real
 * close-out pipeline (`routes/tasks.ts`). Used carelessly, `repoos mv done`
 * silently marks a task complete while its actual code is still sitting,
 * unmerged, on a feature branch.
 *
 * cmdMv now refuses to move to `done` when the task's recorded `branch`
 * still exists locally and is not an ancestor of main — unless
 * `--force-not-merged` is passed. It fails OPEN (allows the move) whenever
 * it can't tell for sure: no branch recorded, or the branch was already
 * deleted (normal post-merge cleanup) — see cmdMv's own doc comment for why
 * `repoos mv` otherwise stays a generic, no-side-effect tool.
 */
import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { cmdMv } from "../../commands/tasks";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepoWithTask(branch = "feat/test"): {
  root: string;
  taskPath: string;
  clean: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "repoos-mvdone-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  const taskPath = join(root, "work", "0001-test.md");
  writeFileSync(
    taskPath,
    `---\nid: "0001"\ntitle: Test task\ntype: feature\nstatus: review\npriority: p2\narea: web\nassigned_to: ai\nbranch: ${branch}\n---\nBody.\n`,
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

describe("cmdMv refuses to mark done a branch that isn't merged", () => {
  const prevExitCode = process.exitCode;
  afterEach(() => {
    process.exitCode = prevExitCode;
  });

  it("refuses when the branch exists locally and is not merged into main", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    try {
      // Create the feature branch with a commit main does NOT have.
      git(root, ["checkout", "-q", "-b", "feat/test"]);
      writeFileSync(join(root, "feature.txt"), "unmerged work\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "feature work"]);
      git(root, ["checkout", "-q", "main"]);

      await withCwd(root, () => {
        cmdMv("0001", "done");
      });

      expect(process.exitCode).toBe(1);
      const content = readFileSync(taskPath, "utf8");
      expect(content).toMatch(/^status: review$/m);
    } finally {
      clean();
    }
  });

  it("allows the move when --force-not-merged is passed", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    try {
      git(root, ["checkout", "-q", "-b", "feat/test"]);
      writeFileSync(join(root, "feature.txt"), "unmerged work\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "feature work"]);
      git(root, ["checkout", "-q", "main"]);

      await withCwd(root, () => {
        cmdMv("0001", "done", undefined, { force: true });
      });

      const content = readFileSync(taskPath, "utf8");
      expect(content).toMatch(/^status: done$/m);
    } finally {
      clean();
    }
  });

  it("allows the move when the branch is actually merged into main", async () => {
    const { root, taskPath, clean } = makeRepoWithTask();
    try {
      git(root, ["checkout", "-q", "-b", "feat/test"]);
      writeFileSync(join(root, "feature.txt"), "merged work\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "feature work"]);
      git(root, ["checkout", "-q", "main"]);
      git(root, ["merge", "-q", "--no-ff", "-m", "merge it", "feat/test"]);

      await withCwd(root, () => {
        cmdMv("0001", "done");
      });

      const content = readFileSync(taskPath, "utf8");
      expect(content).toMatch(/^status: done$/m);
    } finally {
      clean();
    }
  });

  it("allows the move when the branch has already been deleted (normal post-merge cleanup)", async () => {
    const { root, taskPath, clean } = makeRepoWithTask("feat/already-gone");
    try {
      // No such branch was ever created — matches a task whose branch was
      // already cleaned up after landing.
      await withCwd(root, () => {
        cmdMv("0001", "done");
      });

      const content = readFileSync(taskPath, "utf8");
      expect(content).toMatch(/^status: done$/m);
    } finally {
      clean();
    }
  });

  it("allows the move when the task has no branch recorded at all", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-mvdone-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    mkdirSync(join(root, "work"), { recursive: true });
    const taskPath = join(root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---\nid: "0001"\ntitle: Test task\ntype: feature\nstatus: review\npriority: p2\narea: web\nassigned_to: ai\n---\nBody.\n`,
    );
    writeFileSync(join(root, "repoos.toml"), "");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init"]);
    try {
      await withCwd(root, () => {
        cmdMv("0001", "done");
      });

      const content = readFileSync(taskPath, "utf8");
      expect(content).toMatch(/^status: done$/m);
    } finally {
      rmFixture(root);
    }
  });
});
