/**
 * Per-task "sync with main" route contract (#0318).
 *
 * #0318 relaxed the `POST /api/tasks/:id/sync` guard so the action is available
 * for any task with a branch — not only `review` tasks (the prior large-
 * divergence auto-sync path). These tests pin the new contract through the
 * `taskAction` route handler directly:
 *
 *   1. a non-review task with a branch now reaches `syncTaskBranch` (200),
 *   2. a task with no branch is still rejected (400),
 *   3. a task with a running agent turn is still rejected (409).
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
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

const baseTask = (root: string, over: Partial<Task> = {}): Task => ({
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
  absPath: join(root, "work/0318-test.md"),
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

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-sync-route-"));
  const git = (args: string[]) =>
    execSync(`git ${args.join(" ")}`, { cwd: root, stdio: "ignore" });
  git(["-C", root, "init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "README.md"), "hi\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "init"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function makeCtx(
  root: string,
  task: Task,
  opts: { running?: boolean; sync?: () => Promise<{ ok: boolean; conflicts: string[] }> } = {},
): RouteContext {
  return {
    config: { root } as any,
    index: { getTask: () => task, refreshBranches: () => {} } as any,
    indexReady: Promise.resolve(),
    runner: { isRunning: () => opts.running ?? false, stop: () => {} } as any,
    previews: { stop: async () => {} } as any,
    reviews: { isRunning: () => false, cancel: () => {} } as any,
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
    const { root, clean } = makeRepo();
    try {
      const task = baseTask(root, { status: "active", branch: "feat/0318" });
      const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
      const res = makeRes();

      await taskAction(
        makeCtx(root, task, { sync }),
        makeReq(),
        res as any,
        { param1: "0318", param2: "sync" },
      );

      expect(sync).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
    } finally {
      clean();
    }
  });

  it("still rejects a task with no branch", async () => {
    const { root, clean } = makeRepo();
    try {
      const task = baseTask(root, { status: "active", branch: "" });
      const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
      const res = makeRes();

      await taskAction(
        makeCtx(root, task, { sync }),
        makeReq(),
        res as any,
        { param1: "0318", param2: "sync" },
      );

      expect(sync).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/no branch to sync/i);
    } finally {
      clean();
    }
  });

  it("still rejects a task with a running agent turn", async () => {
    const { root, clean } = makeRepo();
    try {
      const task = baseTask(root, { status: "active", branch: "feat/0318" });
      const sync = vi.fn(async () => ({ ok: true, conflicts: [] }));
      const res = makeRes();

      await taskAction(
        makeCtx(root, task, { sync, running: true }),
        makeReq(),
        res as any,
        { param1: "0318", param2: "sync" },
      );

      expect(sync).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/agent turn in progress/i);
    } finally {
      clean();
    }
  });
});
