/**
 * Per-task overrides: `/start` and `/message` must not accept-and-ignore them
 * (#0684).
 *
 * The field report (opex, 2026-10-05) captured a driving agent believing for
 * ~2 hours that two tasks ran on Cursor when they ran on DeepSeek, because
 * `cliOverride`/`modelOverride` in the body of `POST /api/tasks/:id/start` and
 * `POST /api/tasks/:id/message` were accepted (HTTP 200) and silently dropped:
 * both handlers resolve the engineer from the task's PERSISTED overrides only.
 * Only `PATCH /api/tasks/:id { cliOverride, modelOverride }` applies.
 *
 * The fix rejects such a body with a 400 naming the endpoint that does apply
 * it, so a caller learns immediately instead of discovering it from the
 * process list two hours later. These tests drive the real `taskAction` route
 * handler with an in-process HTTP-shaped req/res pair and a stubbed runner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { taskAction } from "../../server/routes/tasks.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { Agent, Task } from "../../core/types.js";

/** A real on-disk root: `/start` re-parses its task file before dispatch. */
let ROOT = "";

const ENGINEER: Agent = {
  name: "engineer",
  cli: "opencode",
  model: "deepseek/deepseek-v4.1-flash",
  enabled: true,
};

function makeRes(): ServerResponse & { statusCode: number; body: any } {
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

const makeReq = (body: Record<string, unknown>): IncomingMessage => {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as unknown as IncomingMessage;
  req.headers = { "content-type": "application/json" };
  return req;
};

/**
 * `/start` re-parses its task file from disk before dispatching (a rapid
 * follow-up start must read post-hotfix on-disk state). Give it a real file so
 * the override guard, not a parse failure, is what the test exercises.
 */
function writeTaskFile(id: string, status: string): void {
  mkdirSync(join(ROOT, "work"), { recursive: true });
  writeFileSync(
    join(ROOT, "work", `${id}-test.md`),
    `---\nid: "${id}"\ntitle: Test\ntype: bug\nstatus: ${status}\npriority: p2\narea: server\n---\n## Problem\n\nBody.\n`,
  );
}

const baseTask = (over: Partial<Task> = {}): Task => ({
  id: "0684",
  title: "Test",
  type: "bug",
  status: "active",
  priority: "p2",
  area: "server",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0684-test.md",
  absPath: `${ROOT}/work/0684-test.md`,
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
  opts: { send?: () => { ok: boolean; pid?: number; busy?: boolean; reason?: string } } = {},
): RouteContext {
  return {
    config: {
      root: ROOT,
      agents: [ENGINEER],
      defaultStatus: "inbox",
      defaultAssignee: "ai",
    } as any,
    index: { getTask: () => task, getTasks: () => [task], refreshBranches: () => {} } as any,
    indexReady: Promise.resolve(),
    runner: {
      isRunning: () => false,
      stop: () => {},
      send: opts.send ?? (() => ({ ok: true, pid: 4242 })),
    } as any,
    previews: { stop: async () => {} } as any,
    reviews: { isRunning: () => false, cancel: () => {} } as any,
    cto: {} as any,
    freeformRuns: {} as any,
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
    logger: {
      task: () => {},
      system: () => {},
      agent: () => {},
      getTaskLogs: () => [],
      getAgentLogs: () => [],
      getSystemLogs: () => [],
    } as any,
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
    onServerStatusChange: () => {},
    startUnifiedHandoff: () => ({ started: false, reason: "not wired in this test" }),
  };
}

describe("POST /api/tasks/:id/start rejects ignored overrides (#0684)", () => {
  beforeEach(() => {
    ROOT = mkdtempSync(join(tmpdir(), "repoos-override-route-"));
    writeTaskFile("0684", "ready");
  });
  afterEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
  });

  it("400s a cliOverride in the start body and names PATCH /api/tasks/:id", async () => {
    const res = makeRes();
    await taskAction(
      makeCtx(baseTask({ status: "ready" })),
      makeReq({ cliOverride: "cursor" }),
      res as any,
      { param1: "0684", param2: "start" },
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cliOverride/);
    expect(res.body.error).toMatch(/PATCH \/api\/tasks\/0684/);
  });
  it("400s a modelOverride in the start body", async () => {
    const res = makeRes();
    await taskAction(
      makeCtx(baseTask({ status: "ready" })),
      makeReq({ modelOverride: "composer-2.5" }),
      res as any,
      { param1: "0684", param2: "start" },
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/modelOverride/);
  });

  it("does not reject a start body with only supported fields", async () => {
    // A start with no overrides must not hit the #0684 guard; it fails later
    // (no worktree/deps wiring in this stub) but never with the override 400.
    const res = makeRes();
    try {
      await taskAction(
        makeCtx(baseTask({ status: "ready" })),
        makeReq({ mode: "fresh", instruction: "go" }),
        res as any,
        { param1: "0684", param2: "start" },
      );
    } catch {
      // Progressed past the guard into worktree setup this stub does not model.
    }

    expect(res.statusCode).not.toBe(400);
    expect(res.body?.error ?? "").not.toMatch(/do not apply agent overrides/);
  });
});

describe("POST /api/tasks/:id/message rejects ignored overrides (#0684)", () => {
  beforeEach(() => {
    ROOT = mkdtempSync(join(tmpdir(), "repoos-override-route-"));
    writeTaskFile("0684", "active");
  });
  afterEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
  });

  it("400s a cliOverride in the message body and names PATCH /api/tasks/:id", async () => {
    const res = makeRes();
    const send = vi.fn(() => ({ ok: true, pid: 1 }));
    await taskAction(
      makeCtx(baseTask(), { send }),
      makeReq({ text: "keep going", cliOverride: "cursor" }),
      res as any,
      { param1: "0684", param2: "message" },
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cliOverride/);
    expect(res.body.error).toMatch(/PATCH \/api\/tasks\/0684/);
    // The run never started on a misrepresented agent.
    expect(send).not.toHaveBeenCalled();
  });

  it("lets a message with no override fields through", async () => {
    const res = makeRes();
    const send = vi.fn(() => ({ ok: true, pid: 1 }));
    await taskAction(makeCtx(baseTask(), { send }), makeReq({ text: "keep going" }), res as any, {
      param1: "0684",
      param2: "message",
    });

    expect(send).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });
});
