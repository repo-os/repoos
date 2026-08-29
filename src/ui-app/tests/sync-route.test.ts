/**
 * Per-task "sync with main" route contract (#0318).
 *
 * #0318 relaxed the `POST /api/tasks/:id/sync` guard so the action is available
 * for any task with a branch — not only `review` tasks (the prior large-
 * divergence auto-sync path). These tests pin the new contract through the
 * `taskAction` route handler directly:
 *
 *   1. a non-review task with a branch reaches `syncTaskBranch` (200),
 *   2. a `review` task with a branch still reaches `syncTaskBranch` (200),
 *   3. a task with no branch is rejected (400),
 *   4. a task with a running agent turn is rejected (409),
 *   5. a task with a running review is rejected (409),
 *   6. a sync that reports conflicts is surfaced as a 409 with the conflict list.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { taskAction } from "../../server/routes/tasks.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { Task } from "../../core/types.js";

function makeRes(): any {
  const capture: any = {
    statusCode: 0,
    body: undefined,
    end: (data?: string) => {
      if (data) capture.body = JSON.parse(data);
    },
    writeHead: (status: number) => {
      capture.statusCode = status;
    },
  };
  return capture;
}

const makeReq = (): IncomingMessage =>
  ({
    [Symbol.asyncIterator]: async function* () {
      /* empty body */
    },
  }) as unknown as IncomingMessage;

const ROOT = "/tmp/repoos-sync-route-fake-root";

const baseTask = (over: Partial<Task> = {}): Task => ({
  id: "0318",
  title: "Test",
  type: "feature",
  status: "active",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/0318",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0318-test.md",
  absPath: join(ROOT, "work/0318-test.md"),
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  ...over,
});

function makeCtx(
  task: Task,
  opts: {
    running?: boolean;
    reviewing?: boolean;
    sync?: () => Promise<{ ok: boolean; conflicts: string[]; reason?: string }>;
  } = {},
): RouteContext {
  return {
    config: { root: ROOT } as any,
    index: { getTask: () => task, refreshBranches: () => {} } as any,
    indexReady: Promise.resolve(),
    runner: { isRunning: () => opts.running ?? false, stop: () => {} } as any,
    previews: { stop: async () => {} } as any,
    reviews: { isRunning: () => opts.reviewing ?? false, cancel: () => {} } as any,
    cto: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: { enqueue: () => ({}), allJobs: () => [] } as any,
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: { task: () => {}, system: () => {}, agent: () => {}, getTaskLogs: () => [], getAgentLogs: () => [], getSystemLogs: () => [] } as any,
    syncTaskBranch: opts.sync ?? (async () => ({ ok: true, conflicts: [] })),
    onServerStatusChange: () => {},
  };
}

describe("POST /api/tasks/:id/sync contract (#0318)", () => {
  it("allows a non-review task with a branch to sync (no longer review-only)", async () => {
    const task = baseTask({ status: "active", branch: "feat/0318" });
    const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
    const res = makeRes();

    await taskAction(
      makeCtx(task, { sync }),
      makeReq(),
      res as any,
      { param1: "0318", param2: "sync" },
    );

    expect(sync).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("still allows a review task with a branch to sync", async () => {
    const task = baseTask({ status: "review", branch: "feat/0318" });
    const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
    const res = makeRes();

    await taskAction(
      makeCtx(task, { sync }),
      makeReq(),
      res as any,
      { param1: "0318", param2: "sync" },
    );

    expect(sync).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("still rejects a task with no branch", async () => {
    const task = baseTask({ status: "active", branch: "" });
    const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
    const res = makeRes();

    await taskAction(
      makeCtx(task, { sync }),
      makeReq(),
      res as any,
      { param1: "0318", param2: "sync" },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no branch to sync/i);
  });

  it("still rejects a task with a running agent turn", async () => {
    const task = baseTask({ status: "active", branch: "feat/0318" });
    const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
    const res = makeRes();

    await taskAction(
      makeCtx(task, { sync, running: true }),
      makeReq(),
      res as any,
      { param1: "0318", param2: "sync" },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/agent turn in progress/i);
  });

  it("rejects a task with a running review", async () => {
    const task = baseTask({ status: "review", branch: "feat/0318" });
    const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
    const res = makeRes();

    await taskAction(
      makeCtx(task, { sync, reviewing: true }),
      makeReq(),
      res as any,
      { param1: "0318", param2: "sync" },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/review in progress/i);
  });

  it("surfaces a conflicting sync as a 409 with the conflict list", async () => {
    const task = baseTask({ status: "active", branch: "feat/0318" });
    const sync = vi.fn(async () => ({
      ok: false,
      conflicts: ["src/core/git.ts"],
      reason: "merge conflict",
    }));
    const res = makeRes();

    await taskAction(
      makeCtx(task, { sync }),
      makeReq(),
      res as any,
      { param1: "0318", param2: "sync" },
    );

    expect(sync).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.conflicts).toEqual(["src/core/git.ts"]);
    expect(res.body.error).toMatch(/merge conflict/i);
  });
});
