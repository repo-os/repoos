/**
 * Dirty-main guard regression tests (#0211).
 *
 * #0211: the move-to-done guard (`dirtyFiles` before enqueue) failed open — a
 * git error or timeout returned `[]`, which is indistinguishable from a clean
 * tree, so a close-out was enqueued against a dirty main and only failed at
 * publish time with git's raw "your local changes would be overwritten". These
 * tests pin the fail-closed behavior end to end through the `done` route:
 *
 *   1. a dirty main returns 409 + needsCommit and is never enqueued,
 *   2. a dirty check that itself errors (not a git repo) fails closed with 409
 *      and is never enqueued.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const reviewTask = (root: string, over: Partial<Task> = {}): Task => ({
  id: "0211",
  title: "Test",
  type: "bug",
  status: "review",
  priority: "p1",
  area: "core",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/0211",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0211-test.md",
  absPath: join(root, "work/0211-test.md"),
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
  const root = mkdtempSync(join(tmpdir(), "repoos-done-guard-"));
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
  opts: { onEnqueue?: () => void } = {},
): RouteContext {
  return {
    config: { root } as any,
    index: { getTask: () => task } as any,
    indexReady: Promise.resolve(),
    runner: { isRunning: () => false, stop: () => {} } as any,
    previews: { stop: async () => {} } as any,
    reviews: { isRunning: () => false, cancel: () => {} } as any,
    cto: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: {
      enqueue: opts.onEnqueue ?? (() => ({})),
      allJobs: () => [],
    } as any,
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: { task: () => {}, system: () => {}, agent: () => {}, getTaskLogs: () => [], getAgentLogs: () => [], getSystemLogs: () => [] } as any,
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
    onServerStatusChange: () => {},
  };
}

describe("move-to-done dirty-main guard (#0211)", () => {
  it("returns 409 + needsCommit against a dirty main and never enqueues", async () => {
    const { root, clean } = makeRepo();
    try {
      // Dirty main: an uncommitted file exists in the working tree.
      writeFileSync(join(root, "dirty.txt"), "uncommitted\n");
      const task = reviewTask(root);
      const enqueue = vi.fn();
      const res = makeRes();

      await taskAction(
        makeCtx(root, task, { onEnqueue: enqueue }),
        makeReq(),
        res as any,
        { param1: "0211", param2: "done" },
      );

      expect(res.statusCode).toBe(409);
      expect(res.body.needsCommit).toBe(true);
      expect(res.body.dirtyFiles).toContain("dirty.txt");
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      clean();
    }
  });

  it("fails closed when the dirty check errors and never enqueues", async () => {
    // A directory that is NOT a git repo makes `dirtyFiles` throw
    // GitDirtyCheckError; the route must surface a 409 and not enqueue.
    const notARepo = mkdtempSync(join(tmpdir(), "repoos-not-repo-"));
    try {
      const task = reviewTask(notARepo);
      const enqueue = vi.fn();
      const res = makeRes();

      await taskAction(
        makeCtx(notARepo, task, { onEnqueue: enqueue }),
        makeReq(),
        res as any,
        { param1: "0211", param2: "done" },
      );

      expect(res.statusCode).toBe(409);
      expect(res.body.needsCommit).toBe(true);
      expect(res.body.dirtyCheckFailed).toBe(true);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
