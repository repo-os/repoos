import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import { handoffTask } from "../../server/handoff";

interface Fixture {
  root: string;
  worktree: string;
  bin: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function taskText(status: string): string {
  return `---
id: "0001"
title: Handoff fixture
type: feature
status: ${status}
priority: p2
area: agent
assigned_to: ai
branch: feat/handoff
---
Body
`;
}

function makeFixture(checkExit = 0): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-handoff-"));
  const worktree = `${root}-wt`;
  const bin = join(root, "fake-bin");
  const taskPath = join(root, "work", "0001-handoff.md");
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(taskPath, taskText("active"));
  writeFileSync(join(root, "source.txt"), "base\n");
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "screenshots"), { recursive: true });
  writeFileSync(join(root, "dist", "app.js"), "built from main\n");
  writeFileSync(join(root, "screenshots", "board.png"), "captured on main\n");
  writeFileSync(join(bin, "repoos"), `#!/bin/sh\nexit ${checkExit}\n`, { mode: 0o755 });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  git(root, ["branch", "feat/handoff"]);
  git(root, ["worktree", "add", "-q", worktree, "feat/handoff"]);
  writeFileSync(join(worktree, "source.txt"), "implemented\n");
  return {
    root,
    worktree,
    bin,
    taskPath,
    config: {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
    },
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktree, { recursive: true, force: true });
    },
  };
}

function installLocalCheck(fx: Fixture, checkExit: number): void {
  const cli = join(fx.worktree, "dist", "cli", "index.js");
  mkdirSync(join(fx.worktree, "dist", "cli"), { recursive: true });
  writeFileSync(cli, `process.exit(${checkExit});\n`);
}

function readTask(fx: Fixture): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  });
}

function request(fx: Fixture, overrides: Record<string, string> = {}) {
  return {
    taskId: "0001",
    runId: "runner-issued-capability",
    branch: "feat/handoff",
    workdir: fx.worktree,
    ...overrides,
  };
}

describe("trusted server-side handoff", () => {
  it("checks, commits, moves both task copies to review, and is idempotent", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const steps: string[] = [];
      const first = await handoffTask(fx.config, readTask(fx), request(fx), (step) => steps.push(step));
      expect(first).toMatchObject({ ok: true, step: "done" });
      expect(steps).toEqual(["validate", "check", "commit", "review", "main", "done"]);
      expect(readTask(fx).status).toBe("review");
      expect(readFileSync(join(fx.worktree, "work", "0001-handoff.md"), "utf8")).toContain("status: review");
      expect(git(fx.worktree, ["status", "--porcelain"])).toBe("");
      const count = Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]));

      const repeated = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(repeated).toMatchObject({ ok: true, detail: "handoff was already finalized" });
      expect(Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]))).toBe(count);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("keeps locally rebuilt dist and screenshots out of feature commits and merge conflicts", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const base = git(fx.worktree, ["rev-parse", "HEAD"]);
      writeFileSync(join(fx.worktree, "dist", "app.js"), "built in feature worktree\n");
      writeFileSync(join(fx.worktree, "screenshots", "board.png"), "captured in feature worktree\n");
      git(fx.worktree, ["add", "dist", "screenshots"]); // Even pre-staged artifacts are excluded.

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: true, step: "done" });
      const committed = git(fx.worktree, ["diff", "--name-only", `${base}..HEAD`]).split("\n");
      expect(committed).toContain("source.txt");
      expect(committed.some((path) => path.startsWith("dist/") || path.startsWith("screenshots/"))).toBe(false);
      expect(git(fx.worktree, ["status", "--porcelain", "--", "dist", "screenshots"])).toContain("dist/app.js");

      // Main can regenerate the same tracked artifacts without creating an
      // artifact conflict when the feature branch is merged.
      writeFileSync(join(fx.root, "dist", "app.js"), "rebuilt on main\n");
      writeFileSync(join(fx.root, "screenshots", "board.png"), "recaptured on main\n");
      git(fx.root, ["add", "dist", "screenshots"]);
      git(fx.root, ["commit", "-m", "chore: regenerate artifacts on main"]);
      try {
        git(fx.root, ["merge", "--no-commit", "--no-ff", "feat/handoff"]);
      } catch {
        // The task file is intentionally edited on both sides and may need the
        // done flow's existing auto-resolution. Generated artifacts must not.
      }
      const conflicts = git(fx.root, ["diff", "--name-only", "--diff-filter=U"])
        .split("\n")
        .filter(Boolean);
      expect(conflicts.some((path) => path.startsWith("dist/") || path.startsWith("screenshots/"))).toBe(false);
      git(fx.root, ["merge", "--abort"]);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("refuses review when repoos check fails", async () => {
    const fx = makeFixture(1);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const result = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(result).toMatchObject({ ok: false, step: "check" });
      expect(readTask(fx).status).toBe("active");
      expect(git(fx.worktree, ["status", "--porcelain"])).toContain("source.txt");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("uses the assigned worktree's CLI instead of an unrelated global repoos", async () => {
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      installLocalCheck(fx, 0);
      writeFileSync(join(fx.bin, "repoos"), "#!/bin/sh\nexit 23\n", { mode: 0o755 });
      const result = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(result).toMatchObject({ ok: true, step: "done" });
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects a vacuous handoff with no source changes (#0170)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      // The fixture's one working change is reverted: the only thing modified
      // in the worktree is a locally regenerated dist artifact. Nothing to
      // implement — the handoff must not be blessed.
      writeFileSync(join(fx.worktree, "source.txt"), "base\n");
      writeFileSync(join(fx.worktree, "dist", "app.js"), "rebuilt by repoos check\n");

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: false, step: "commit" });
      expect(result.detail).toMatch(/no implementation found/);
      expect(result.detail).toContain("since");
      // Task stays active; nothing committed, nothing moved to review.
      expect(readTask(fx).status).toBe("active");
      expect(Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]))).toBe(1);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("does not count dist-only or task-file changes as implementation (#0170)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(join(fx.worktree, "source.txt"), "base\n");
      // Both pre-staged and just-dirty generated artifacts stay excluded.
      writeFileSync(join(fx.worktree, "dist", "app.js"), "built in feature worktree\n");
      writeFileSync(join(fx.worktree, "screenshots", "board.png"), "recaptured in feature worktree\n");
      git(fx.worktree, ["add", "dist", "screenshots"]);
      // Task-file churn alone is not implementation either.
      writeFileSync(
        join(fx.worktree, "work", "0001-handoff.md"),
        taskText("active").replace("priority: p2", "priority: p3"),
      );

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: false, step: "commit" });
      expect(result.detail).toMatch(/no implementation found/);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("honors the no_source_change escape hatch for a legitimate no-op task (#0170)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(join(fx.worktree, "source.txt"), "base\n");
      const taskWithFlag = taskText("active").replace("branch: feat/handoff", "branch: feat/handoff\nno_source_change: true");
      writeFileSync(fx.taskPath, taskWithFlag);
      writeFileSync(join(fx.worktree, "work", "0001-handoff.md"), taskWithFlag);

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: true, step: "done" });
      expect(readTask(fx).status).toBe("review");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects an invalid session capability before changing Git or files", async () => {
    const fx = makeFixture();
    const oldHead = git(fx.worktree, ["rev-parse", "HEAD"]);
    try {
      const result = await handoffTask(fx.config, readTask(fx), request(fx, { runId: "" }));
      expect(result).toMatchObject({ ok: false, step: "validate" });
      expect(git(fx.worktree, ["rev-parse", "HEAD"])).toBe(oldHead);
      expect(readTask(fx).status).toBe("active");
    } finally {
      fx.clean();
    }
  });

  it("rejects a mismatched worktree or branch before changing Git", async () => {
    const fx = makeFixture();
    const oldHead = git(fx.worktree, ["rev-parse", "HEAD"]);
    try {
      const result = await handoffTask(fx.config, readTask(fx), request(fx, { branch: "feat/other" }));
      expect(result).toMatchObject({ ok: false, step: "validate" });
      expect(git(fx.worktree, ["rev-parse", "HEAD"])).toBe(oldHead);
    } finally {
      fx.clean();
    }
  });

  it("records the check failure in transcript and leaves task active for retry", async () => {
    const fx = makeFixture(1);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      // With a failing repoos check, the handoff should fail at the check step
      // and leave the task in active status (not moved to review)
      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({
        ok: false,
        step: "check",
        detail: expect.stringContaining("repoos check failed"),
      });
      expect(readTask(fx).status).toBe("active");
      expect(git(fx.worktree, ["status", "--porcelain"])).toContain("source.txt");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });
});
