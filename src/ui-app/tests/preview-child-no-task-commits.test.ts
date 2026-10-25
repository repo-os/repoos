/**
 * #0954: a preview child is rooted in a task worktree but must never commit
 * task-file bookkeeping there — activity, crash recovery, and patchTaskFile all
 * no-op while REPOOS_PREVIEW_CHILD is set.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server.js";
import type { RepoOSConfig } from "../../core/types.js";
import { commitTaskFile } from "../../core/git.js";
import { patchTaskFile, WriteError } from "../../server/write.js";

const roots: string[] = [];
let priorPreview: string | undefined;

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function taskMd(id: string, branch: string): string {
  return `---
id: "${id}"
title: "Preview fixture ${id}"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
branch: ${branch}
---
## Problem

Fixture.

## Activity

- 2026-01-01T00:00:00Z · status inbox→active
`;
}

function twoTaskWorktreeFixture(): {
  main: string;
  worktreeB: string;
  taskAPath: string;
  clean: () => void;
} {
  const main = mkdtempSync(join(tmpdir(), "repoos-preview-no-commit-"));
  roots.push(main);
  const worktreeB = `${main}-task-b`;
  git(main, ["init", "-q", "-b", "main"]);
  git(main, ["config", "user.email", "t@example.com"]);
  git(main, ["config", "user.name", "Test"]);
  writeFileSync(join(main, "repoos.toml"), "servePort = 0\n");
  mkdirSync(join(main, "work"), { recursive: true });
  const taskAPath = join(main, "work", "0950-task-a.md");
  writeFileSync(taskAPath, taskMd("0950", "feat/task-a"));
  writeFileSync(join(main, "work", "0951-task-b.md"), taskMd("0951", "feat/task-b"));
  git(main, ["add", "-A"]);
  git(main, ["commit", "-qm", "tasks on main"]);
  git(main, ["branch", "feat/task-b"]);
  git(main, ["worktree", "add", "-q", worktreeB, "feat/task-b"]);
  writeFileSync(join(worktreeB, "impl.txt"), "task b work\n");
  git(worktreeB, ["add", "impl.txt"]);
  git(worktreeB, ["commit", "-qm", "task b impl"]);

  return {
    main,
    worktreeB,
    taskAPath,
    clean: () => {
      try {
        git(main, ["worktree", "remove", "--force", worktreeB]);
      } catch {
        rmSync(worktreeB, { recursive: true, force: true });
      }
    },
  };
}

async function waitForHealth(port: number): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("preview server did not become healthy");
}

beforeEach(() => {
  priorPreview = process.env.REPOOS_PREVIEW_CHILD;
});

afterEach(() => {
  if (priorPreview === undefined) delete process.env.REPOOS_PREVIEW_CHILD;
  else process.env.REPOOS_PREVIEW_CHILD = priorPreview;
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("preview child over a task worktree (#0954)", () => {
  it("does not commit when bookkeeping helpers run during a live preview server", async () => {
    const fx = twoTaskWorktreeFixture();
    const worktreeHeadBefore = git(fx.worktreeB, ["rev-parse", "HEAD"]);
    const mainHeadBefore = git(fx.main, ["rev-parse", "HEAD"]);

    process.env.REPOOS_PREVIEW_CHILD = "1";
    const port = await reservePort();
    let server: ServerHandle | undefined;
    try {
      server = await startServer({
        root: fx.worktreeB,
        host: "127.0.0.1",
        port,
        disableAuth: true,
        previewOverrides: true,
      });
      await waitForHealth(port);

      const config: RepoOSConfig = {
        root: fx.worktreeB,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
      };

      const taskAInWorktree = join(fx.worktreeB, "work", "0950-task-a.md");
      writeFileSync(
        taskAInWorktree,
        readFileSync(taskAInWorktree, "utf8") + "\n- stray activity line\n",
      );
      expect(commitTaskFile(fx.worktreeB, taskAInWorktree, "docs(0950): record activity")).toBe(
        false,
      );

      const taskBPath = join(fx.worktreeB, "work", "0951-task-b.md");
      expect(() =>
        patchTaskFile(config, taskBPath, { body: readFileSync(taskBPath, "utf8") + "\n" }),
      ).toThrow(WriteError);

      expect(git(fx.worktreeB, ["rev-parse", "HEAD"])).toBe(worktreeHeadBefore);
      expect(git(fx.main, ["rev-parse", "HEAD"])).toBe(mainHeadBefore);
      expect(git(fx.worktreeB, ["status", "--porcelain"])).not.toBe("");
    } finally {
      await server?.close();
      fx.clean();
    }
  });

  it("commits task A bookkeeping on main without moving task B's branch tip", () => {
    const fx = twoTaskWorktreeFixture();
    const worktreeHeadBefore = git(fx.worktreeB, ["rev-parse", "HEAD"]);
    const mainHeadBefore = git(fx.main, ["rev-parse", "HEAD"]);

    writeFileSync(fx.taskAPath, readFileSync(fx.taskAPath, "utf8") + "\n- activity on main only\n");
    expect(commitTaskFile(fx.main, fx.taskAPath, "docs(0950): record activity")).toBe(true);

    expect(git(fx.main, ["rev-parse", "HEAD"])).not.toBe(mainHeadBefore);
    expect(git(fx.worktreeB, ["rev-parse", "HEAD"])).toBe(worktreeHeadBefore);
    expect(git(fx.worktreeB, ["diff", "--name-only"])).toBe("");
    fx.clean();
  });
});
