/**
 * #0210 regression tests: the commit/vacuity gate itself.
 *
 * #0507 builds on this: the gate is no longer what a route into `review` runs —
 * it is the middle step of one shared finalization (`handoffTask` /
 * `finalizeReviewHandoff`), which every route now goes through. So the gate's
 * own guarantees (commit the work, reject a vacuous transition, never fold a
 * sibling task file in) are still asserted here directly, and the routing
 * tests below assert that no route reaches `review` without it.
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

function makeCtx(
  fx: Fixture,
  index: LiveIndex,
  startUnifiedHandoff: RouteContext["startUnifiedHandoff"] = () => ({
    started: true,
  }),
): RouteContext {
  return {
    config: fx.config,
    index,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => false } as unknown as RouteContext["reviews"],
    runner: { isRunning: () => false } as unknown as RouteContext["runner"],
    previews: null as unknown as RouteContext["previews"],
    cto: null as unknown as RouteContext["cto"],
    freeformRuns: null as unknown as RouteContext["freeformRuns"],
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
    logger: {
      task: () => {},
      system: () => {},
      agent: () => {},
      getTaskLogs: () => [],
      getAgentLogs: () => [],
      getSystemLogs: () => [],
    } as unknown as RouteContext["logger"],
    onServerStatusChange: () => {},
    startUnifiedHandoff,
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
      expect(git(fx.worktree, ["log", "-1", "--format=%s"])).toBe(
        "feat(0210): implement Patch bypass fixture",
      );
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

  it("never folds another task's work/*.md into this task's implement commit", async () => {
    const fx = makeFixture();
    try {
      // Real implementation change for this task…
      uncommittedChange(fx);
      // …plus an unrelated task file left dirty in the worktree (a concurrent
      // board write, a `repoos` CLI call, a stale merge). `git add -A` would
      // otherwise sweep it into the commit and publish it to main on close-out.
      writeFileSync(join(fx.worktree, "work", "0299-sibling.md"), '---\nid: "0299"\n---\nstale\n');

      const res = await guardReviewTransition(fx.config, fx.task);

      expect(res.ok).toBe(true);
      const committed = git(fx.worktree, ["show", "--name-only", "--format=", "HEAD"])
        .split("\n")
        .filter(Boolean);
      expect(committed).toContain("source.txt");
      expect(committed).not.toContain("work/0299-sibling.md");
      // The unrelated file is left in the worktree untouched, not deleted.
      expect(readFileSync(join(fx.worktree, "work", "0299-sibling.md"), "utf8")).toContain("stale");
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

describe("PATCH /api/tasks/:id → review (0507: one finalization path)", () => {
  it("hands off to the unified finalization instead of writing status: review", async () => {
    const fx = makeFixture();
    try {
      uncommittedChange(fx);
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();
      const calls: { origin?: string; skipChecks?: boolean; actor?: string }[] = [];
      const ctx = makeCtx(fx, index, (task, opts) => {
        calls.push({ origin: opts?.origin, skipChecks: opts?.skipChecks, actor: opts?.actor });
        return { started: task.id === "0210" };
      });

      await patchTask(ctx, makeReq({ status: "review" }), res, { param1: "0210" });

      // The route accepted the REQUEST (202), not a write: the task is still
      // active on disk and in the index, and the finalization owns the move.
      expect(fake.status).toBe(202);
      expect((fake.payload as { status: string }).status).toBe("active");
      expect((fake.payload as { pendingHandoff: boolean }).pendingHandoff).toBe(true);
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: active");
      expect(index.getTask("0210")?.status).toBe("active");
      // Crucially: the route did NOT run the commit gate itself. That is the
      // finalization's job now, and running it here would be the "route that
      // checks a different amount" this task closed.
      expect(dirtyPaths(fx)).not.toEqual([]);
      expect(calls).toEqual([{ origin: "ui-review", skipChecks: false, actor: "human" }]);
    } finally {
      fx.clean();
    }
  });

  it("forwards the human's explicit Skip checks choice", async () => {
    const fx = makeFixture();
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();
      const calls: { origin?: string; skipChecks?: boolean }[] = [];
      const ctx = makeCtx(fx, index, (_task, opts) => {
        calls.push({ origin: opts?.origin, skipChecks: opts?.skipChecks });
        return { started: true };
      });

      await patchTask(
        ctx,
        makeReq({ status: "review", skipChecks: true, origin: "board-drag" }),
        res,
        { param1: "0210" },
      );

      expect(fake.status).toBe(202);
      expect(calls).toEqual([{ origin: "board-drag", skipChecks: true }]);
    } finally {
      fx.clean();
    }
  });

  it("still applies the rest of the body while the finalization owns the status", async () => {
    const fx = makeFixture();
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();
      const ctx = makeCtx(fx, index, () => ({ started: true }));

      await patchTask(
        ctx,
        makeReq({ status: "review", priority: "p0" }),
        res,
        { param1: "0210" },
      );

      expect(fake.status).toBe(202);
      const raw = readFileSync(fx.taskPath, "utf8");
      expect(raw).toContain("priority: p0");
      expect(raw).toContain("status: active");
    } finally {
      fx.clean();
    }
  });

  it("409s when a handoff is already running for the task", async () => {
    const fx = makeFixture();
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();
      const ctx = makeCtx(fx, index, () => ({
        started: false,
        reason: "a handoff is already running for this task",
      }));

      await patchTask(ctx, makeReq({ status: "review" }), res, { param1: "0210" });

      expect(fake.status).toBe(409);
      expect((fake.payload as { error: string }).error).toMatch(/already running/);
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: active");
    } finally {
      fx.clean();
    }
  });

  it("rejects a no-op review PATCH from a task that is already in review", async () => {
    const fx = makeFixture();
    try {
      writeFileSync(fx.taskPath, taskText("review"));
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const { res, fake } = makeRes();
      let called = 0;
      const ctx = makeCtx(fx, index, () => {
        called += 1;
        return { started: true };
      });

      await patchTask(ctx, makeReq({ status: "review" }), res, { param1: "0210" });

      // prevStatus === "review", so this falls through to the ordinary write
      // path and no second finalization is started.
      expect(fake.status).toBe(200);
      expect(called).toBe(0);
    } finally {
      fx.clean();
    }
  });
});

describe("file-watch direct edit into review (0507: routed to the finalization)", () => {
  it("reverts a direct edit to review and asks the finalization instead", async () => {
    const fx = makeFixture();
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      const asked: string[] = [];
      // Mirrors server.ts: the guard starts the unified handoff and ALWAYS
      // returns false, so the index keeps its previous state.
      index.setReviewGuard(async (task: Task) => {
        asked.push(task.id);
        return false;
      });

      // Simulate an agent editing its task file's frontmatter directly to review.
      writeFileSync(fx.taskPath, taskText("review"));
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: review");

      await index.applyFileChange(fx.taskPath);

      expect(asked).toEqual(["0210"]);
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: active");
      expect(index.getTask("0210")?.status).toBe("active");
    } finally {
      fx.clean();
    }
  });

  it("commits the worker's work and moves to review, running the full check", async () => {
    const fx = makeFixture();
    try {
      uncommittedChange(fx);
      const index = new LiveIndex(fx.config);
      index.refreshAll();

      // The real server wiring: the guard hands the PRE-EDIT task to the same
      // finalization every other route uses. `skipChecks` is used here only so
      // the test does not have to spawn a real `repoos check` — what is under
      // test is the ROUTING (a file edit ends up going through the
      // finalization, which commits and then moves the task), not the check.
      // Passing `prev` matters: the index reverts the file to `prev.status`, so
      // handing over the post-edit `review` task would make the finalization
      // think it need not write the canonical copy at all.
      const { finalizeReviewHandoff } = await import("../../server/handoff");
      let handoff: Promise<{ ok: boolean; step: string; detail?: string }> | null = null;
      index.setReviewGuard(async (_edited: Task, prev: Task) => {
        handoff = finalizeReviewHandoff(fx.config, prev, {
          origin: "task-file",
          skipChecks: true,
        });
        return false;
      });

      writeFileSync(fx.taskPath, taskText("review"));
      await index.applyFileChange(fx.taskPath);
      const result = await handoff!;

      expect(result.detail ?? "").toBe("");
      expect(result.ok).toBe(true);
      expect(readFileSync(fx.taskPath, "utf8")).toContain("status: review");
      // The finalization committed the previously-dirty work; worktree clean.
      expect(dirtyPaths(fx)).toEqual([]);
    } finally {
      fx.clean();
    }
  });
});
