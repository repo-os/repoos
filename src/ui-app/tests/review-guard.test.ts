/**
 * #0210 regression tests: closing the direct-PATCH bypass around handoff commit
 * validation.
 *
 * Every transition INTO `review` — the trusted handoff, `PATCH /api/tasks/:id`,
 * or a direct task-file edit picked up by the watcher — must either commit the
 * worktree's implementation changes or reject the transition, and must reject
 * a vacuous transition (zero source changes and no `no_source_change`).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import { guardReviewTransition } from "../../server/review-guard";
import { patchTask } from "../../server/routes/tasks";
import { LiveIndex } from "../../server/live-index";
import type { RouteContext } from "../../server/routes/types";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function taskText(status: string, extra = ""): string {
  return `---
id: "0210"
title: Patch bypass fixture
type: feature
status: ${status}
priority: p1
area: server
assigned_to: ai
branch: feat/patch-bypass
${extra}---
Body
`;
}

interface Fixture {
  root: string;
  worktree: string;
  taskPath: string;
  config: RepoOSConfig;
  task: Task;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-guard-"));
  const worktree = `${root}-wt`;
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const taskPath = join(workDir, "0210-patch-bypass.md");
  writeFileSync(taskPath, taskText("active"));
  writeFileSync(join(root, "source.txt"), "base\n");

  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  git(root, ["branch", "feat/patch-bypass"]);
  git(root, ["worktree", "add", "-q", worktree, "feat/patch-bypass"]);

  const cfg = config(root);
  const task = parseTask({
    content: readFileSync(taskPath, "utf8"),
    absPath: taskPath,
    root,
    defaultStatus: cfg.defaultStatus,
    defaultAssignee: cfg.defaultAssignee,
  });
  return {
    root,
    worktree,
    taskPath,
    config: cfg,
    task,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktree, { recursive: true, force: true });
    },
  };
}

/** Write an uncommitted implementation change into the worktree. */
function uncommittedChange(fx: Fixture, content = "implemented\n"): void {
  writeFileSync(join(fx.worktree, "source.txt"), content);
}

function dirtyPaths(fx: Fixture): string[] {
  return git(fx.worktree, ["status", "--porcelain"]).split("\n").filter(Boolean);
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

function makeReq(body: unknown): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  const req = {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  };
  return req as unknown as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: unknown;
}

function makeRes(): { res: ServerResponse; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined };
  const res = {
    writeHead(code: number) {
      fake.status = code;
    },
    end(p: string) {
      fake.payload = JSON.parse(p);
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function makeCtx(fx: Fixture, index: LiveIndex): RouteContext {
  return {
    config: fx.config,
    index,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => false } as unknown as RouteContext["reviews"],
    runner: { isRunning: () => false } as unknown as RouteContext["runner"],
    previews: null as unknown as RouteContext["previews"],
    cto: null as unknown as RouteContext["cto"],
    repoos: null as unknown as RouteContext["repoos"],
    emitEvent: () => {},
    closeOutLock: null as unknown as RouteContext["closeOutLock"],
    rootLock: null as unknown as RouteContext["rootLock"],
    jobCoordinator: null as unknown as RouteContext["jobCoordinator"],
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set<string>(),
    uiDir: null,
    reload: null,
    logger: { task: () => {}, system: () => {}, agent: () => {}, getTaskLogs: () => [], getAgentLogs: () => [], getSystemLogs: () => [] } as unknown as RouteContext["logger"],
    onServerStatusChange: () => {},
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("guardReviewTransition (0210)", () => {
  it("commits uncommitted implementation and returns ok", async () => {
    const fx = makeFixture();
    try {
      uncommittedChange(fx);
      const before = git(fx.worktree, ["rev-parse", "--short", "HEAD"]);

      const res = await guardReviewTransition(fx.config, fx.task);

      expect(res.ok).toBe(true);
      expect(git(fx.worktree, ["rev-parse", "--short", "HEAD"])).not.toBe(before);
      expect(dirtyPaths(fx)).toEqual([]);
      expect(git(fx.worktree, ["log", "-1", "--format=%s"])).toBe("feat(0210): implement Patch bypass fixture");
    } finally {
      fx.clean();
    }
  });

  it("rejects a vacuous transition with zero source changes", async () => {
    const fx = makeFixture();
    try {
      const before = git(fx.worktree, ["rev-parse", "--short", "HEAD"]);

      const res = await guardReviewTransition(fx.config, fx.task);

      expect(res.ok).toBe(false);
      expect(res.detail).toMatch(/no implementation found/);
      // Nothing committed; the worktree is left clean (never left dirty).
      expect(git(fx.worktree, ["rev-parse", "--short", "HEAD"])).toBe(before);
      expect(dirtyPaths(fx)).toEqual([]);
    } finally {
      fx.clean();
    }
  });

  it("honors the no_source_change escape hatch", async () => {
    const fx = makeFixture();
    try {
      writeFileSync(fx.taskPath, taskText("active", "no_source_change: true\n"));
      const task = readTask(fx);

      const res = await guardReviewTransition(fx.config, task);

      expect(res.ok).toBe(true);
      expect(dirtyPaths(fx)).toEqual([]);
    } finally {
      fx.clean();
    }
  });

  it("does not count dist-only or task-file changes as implementation", async () => {
    const fx = makeFixture();
    try {
      mkdirSync(join(fx.worktree, "dist"), { recursive: true });
      writeFileSync(join(fx.worktree, "dist", "app.js"), "built\n");
      writeFileSync(join(fx.worktree, "work", "0210-patch-bypass.md"), taskText("active"));
      git(fx.worktree, ["add", "dist", "work"]);
      git(fx.worktree, ["commit", "-m", "only generated + task churn"]);

      const res = await guardReviewTransition(fx.config, fx.task);

      expect(res.ok).toBe(false);
      expect(res.detail).toMatch(/no implementation found/);
    } finally {
      fx.clean();
    }
  });

  it("is idempotent: passes again after a successful commit (no double-commit)", async () => {
    const fx = makeFixture();
    try {
      uncommittedChange(fx);
      const first = await guardReviewTransition(fx.config, fx.task);
      expect(first.ok).toBe(true);
      const head = git(fx.worktree, ["rev-parse", "--short", "HEAD"]);

      const second = await guardReviewTransition(fx.config, fx.task);

      expect(second.ok).toBe(true);
      expect(git(fx.worktree, ["rev-parse", "--short", "HEAD"])).toBe(head);
    } finally {
      fx.clean();
    }
  });
});

describe("PATCH /api/tasks/:id → review (0210)", () => {
  it("commits an uncommitted worktree and moves the task to review (never left dirty)", async () => {
    const fx = makeFixture();
    try {
      uncommittedChange(fx);
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();

      await patchTask(makeCtx(fx, index), makeReq({ status: "review" }), res, {
        param1: "0210",
      });

      expect(fake.status).toBe(200);
      expect((fake.payload as { status: string }).status).toBe("review");
      expect(dirtyPaths(fx)).toEqual([]);
      expect(git(fx.worktree, ["log", "-1", "--format=%s"])).toBe("feat(0210): implement Patch bypass fixture");
    } finally {
      fx.clean();
    }
  });

  it("rejects PATCHing an empty worktree to review when no_source_change is unset", async () => {
    const fx = makeFixture();
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();

      await patchTask(makeCtx(fx, index), makeReq({ status: "review" }), res, {
        param1: "0210",
      });

      expect(fake.status).toBe(400);
      expect((fake.payload as { error: string }).error).toMatch(/no implementation found/);
      // The task stays active and was never moved to review.
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: active");
    } finally {
      fx.clean();
    }
  });
});

describe("file-watch direct edit into review (0210)", () => {
  it("reverts a direct edit to review on an empty worktree back to its prior status", async () => {
    const fx = makeFixture();
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      index.setReviewGuard(async (task: Task) => {
        const gate = await guardReviewTransition(fx.config, task);
        return gate.ok;
      });

      // Simulate an agent editing its task file's frontmatter directly to review.
      writeFileSync(fx.taskPath, taskText("review"));
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: review");

      // Await the deferred guard: on rejection it rewrites the file back to its
      // prior status, so by the time this returns the bypass is already closed.
      await index.applyFileChange(fx.taskPath);

      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: active");
      expect(index.getTask("0210")?.status).toBe("active");
    } finally {
      fx.clean();
    }
  });

  it("keeps a direct edit to review when the guard commits real work", async () => {
    const fx = makeFixture();
    try {
      uncommittedChange(fx);
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      index.setReviewGuard(async (task: Task) => {
        const gate = await guardReviewTransition(fx.config, task);
        return gate.ok;
      });

      writeFileSync(fx.taskPath, taskText("review"));
      await index.applyFileChange(fx.taskPath);

      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: review");
      expect(index.getTask("0210")?.status).toBe("review");
      // The guard committed the previously-dirty work; the worktree is clean.
      expect(dirtyPaths(fx)).toEqual([]);
    } finally {
      fx.clean();
    }
  });
});
