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
});
