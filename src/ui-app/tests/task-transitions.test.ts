/**
 * Lifecycle-audit transition table regression tests.
 *
 * Before this, `patchTaskFile` accepted any (from, to) status pair with no
 * rule about which ones make sense — reachable from the task drawer's
 * dropdown, board drag-drop, and a direct PATCH. These tests pin:
 *   1. `checkGenericStatusPatch`'s pure allow-list logic.
 *   2. The PATCH route actually rejecting the previously-open transitions
 *      (e.g. ready -> active with no agent spawned) and still allowing the
 *      six edges that require no dedicated action.
 *   3. The two new dedicated actions, Abandon work and Reopen.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGenericStatusPatch } from "../../server/task-transitions.js";
import { patchTask, taskAction } from "../../server/routes/tasks.js";
import { parseTask } from "../../core/task.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { RepoOSConfig, Status } from "../../core/types.js";

describe("checkGenericStatusPatch", () => {
  it("allows a no-op (same status)", () => {
    expect(checkGenericStatusPatch("active", "active")).toEqual({ ok: true });
  });

  it("allows the six side-effect-free edges", () => {
    const allowed: [Status, Status][] = [
      ["draft", "inbox"],
      ["inbox", "draft"],
      ["inbox", "ready"],
      ["ready", "inbox"],
      ["active", "review"],
      ["review", "active"],
    ];
    for (const [from, to] of allowed) {
      expect(checkGenericStatusPatch(from, to)).toEqual({ ok: true });
    }
  });

  it("rejects transitions that require a dedicated action", () => {
    const blocked: [Status, Status][] = [
      ["ready", "active"], // needs /start (spawns the agent)
      ["review", "done"], // needs /done (close-out pipeline)
      ["active", "ready"], // needs /abandon (stops the agent)
      ["review", "ready"], // needs /abandon (cancels the review)
      ["done", "ready"], // needs /reopen (clears the stale branch)
    ];
    for (const [from, to] of blocked) {
      const res = checkGenericStatusPatch(from, to);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason.length).toBeGreaterThan(0);
    }
  });

  it("rejects skip-a-step and unreviewed backward jumps with no such transition", () => {
    const nonsense: [Status, Status][] = [
      ["draft", "active"],
      ["ready", "review"],
      ["active", "done"],
      ["review", "draft"],
      ["active", "draft"],
      ["done", "active"],
      ["done", "inbox"],
    ];
    for (const [from, to] of nonsense) {
      const res = checkGenericStatusPatch(from, to);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/no such transition/);
    }
  });
});

// ---- shared fixture (real temp git repo + task file) ----

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
id: "0296"
title: Transition table fixture
type: feature
status: ${status}
priority: p1
area: server
assigned_to: ai
branch: feat/transition-table-fixture
${extra}---
Body
`;
}

interface Fixture {
  root: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

function makeFixture(status: string, extra = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-transitions-"));
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const taskPath = join(workDir, "0296-transition-table-fixture.md");
  writeFileSync(taskPath, taskText(status, extra));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  return {
    root,
    taskPath,
    config: config(root),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeReq(body: unknown = {}): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  } as unknown as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: unknown;
}

function makeRes(): { res: any; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined };
  return {
    res: {
      writeHead(code: number) {
        fake.status = code;
      },
      end(p: string) {
        fake.payload = p ? JSON.parse(p) : undefined;
      },
    },
    fake,
  };
}

function readTaskFile(fx: Fixture) {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  });
}

/** Minimal ctx: `index` re-reads the fixture's task file fresh on every call,
 *  matching how the real LiveIndex reflects a just-written file. */
function makeCtx(fx: Fixture, opts: { runnerRunning?: boolean; reviewRunning?: boolean; stop?: ReturnType<typeof vi.fn>; cancel?: ReturnType<typeof vi.fn> } = {}): RouteContext {
  return {
    config: fx.config,
    index: {
      getTask: () => readTaskFile(fx),
      applyFileChange: () => {},
    } as any,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => opts.reviewRunning ?? false, cancel: opts.cancel ?? vi.fn() } as any,
    runner: { isRunning: () => opts.runnerRunning ?? false, stop: opts.stop ?? vi.fn(() => ({ stopped: true })) } as any,
    previews: { stop: vi.fn(async () => {}) } as any,
    cto: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: { enqueue: () => ({}), allJobs: () => [] } as any,
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: { task: () => {}, system: () => {}, agent: () => {}, getTaskLogs: () => [], getAgentLogs: () => [], getSystemLogs: () => [] } as any,
    onServerStatusChange: () => {},
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("PATCH /api/tasks/:id — generic status writes now gated", () => {
  it("rejects ready -> active (must use /start, which spawns the agent)", async () => {
    const fx = makeFixture("ready");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "active" }), res, { param1: "0296" });
      expect(fake.status).toBe(400);
      expect((fake.payload as { error: string }).error).toMatch(/requires POST \/api\/tasks\/:id\/start/);
      expect(readTaskFile(fx).status).toBe("ready");
    } finally {
      fx.clean();
    }
  });

  it("rejects active -> draft (no such transition, not even via an action)", async () => {
    const fx = makeFixture("active");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "draft" }), res, { param1: "0296" });
      expect(fake.status).toBe(400);
      expect((fake.payload as { error: string }).error).toMatch(/no such transition/);
      expect(readTaskFile(fx).status).toBe("active");
    } finally {
      fx.clean();
    }
  });

  it("still allows draft -> inbox (no side effect, generic-patch edge)", async () => {
    const fx = makeFixture("draft");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "inbox" }), res, { param1: "0296" });
      expect(fake.status).toBe(200);
      expect(readTaskFile(fx).status).toBe("inbox");
    } finally {
      fx.clean();
    }
  });

  it("still allows review -> active (the Send-to-engineer bare flip)", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "active" }), res, { param1: "0296" });
      expect(fake.status).toBe(200);
      expect(readTaskFile(fx).status).toBe("active");
    } finally {
      fx.clean();
    }
  });
});

describe("POST /api/tasks/:id/abandon", () => {
  it("active -> ready, stops the running agent", async () => {
    const fx = makeFixture("active");
    try {
      const stop = vi.fn(() => ({ stopped: true }));
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { runnerRunning: true, stop }), makeReq(), res, {
        param1: "0296",
        param2: "abandon",
      });
      expect(fake.status).toBe(200);
      expect(stop).toHaveBeenCalledWith("0296");
      expect(readTaskFile(fx).status).toBe("ready");
    } finally {
      fx.clean();
    }
  });

  it("review -> ready, cancels the running review", async () => {
    const fx = makeFixture("review");
    try {
      const cancel = vi.fn();
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx, { reviewRunning: true, cancel }), makeReq(), res, {
        param1: "0296",
        param2: "abandon",
      });
      expect(fake.status).toBe(200);
      expect(cancel).toHaveBeenCalledWith("0296");
      expect(readTaskFile(fx).status).toBe("ready");
    } finally {
      fx.clean();
    }
  });

  it("rejects abandon from ready (nothing to abandon)", async () => {
    const fx = makeFixture("ready");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq(), res, { param1: "0296", param2: "abandon" });
      expect(fake.status).toBe(400);
      expect(readTaskFile(fx).status).toBe("ready");
    } finally {
      fx.clean();
    }
  });
});

describe("POST /api/tasks/:id/reopen", () => {
  it("done -> ready, clears the stale branch reference", async () => {
    const fx = makeFixture("done");
    try {
      expect(readTaskFile(fx).branch).toBe("feat/transition-table-fixture");
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq(), res, { param1: "0296", param2: "reopen" });
      expect(fake.status).toBe(200);
      const after = readTaskFile(fx);
      expect(after.status).toBe("ready");
      expect(after.branch).toBe("");
    } finally {
      fx.clean();
    }
  });

  it("rejects reopen from a non-done status", async () => {
    const fx = makeFixture("review");
    try {
      const { res, fake } = makeRes();
      await taskAction(makeCtx(fx), makeReq(), res, { param1: "0296", param2: "reopen" });
      expect(fake.status).toBe(400);
      expect(readTaskFile(fx).status).toBe("review");
    } finally {
      fx.clean();
    }
  });
});
