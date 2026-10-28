/**
 * #0960 round 3 — start-lifecycle TOCTOU.
 *
 * The `start` route checks the hold BEFORE its awaited bootstrap/context-pack
 * work. A `repoos hold` that lands during that window must NOT result in a
 * spawned engineer: the route re-reads the live task state at the spawn point
 * and refuses if it is now held. This test drives the real `taskAction` start
 * handler with a controllable `bootstrap` so it can write a hold to the task
 * file mid-bootstrap, then asserts the spawn is refused and `runner.start` is
 * never called. Without the re-check, the engineer would spawn despite the hold.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { taskAction } from "../../server/routes/tasks.js";
import { parseTask } from "../../core/task.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { RepoOSConfig } from "../../core/types.js";

// A controllable bootstrap: the handler awaits it, and the test resolves it only
// after writing a hold to the task file — simulating a concurrent `repoos hold`.
const hoisted = vi.hoisted(() => ({ resolve: null as null | ((v: unknown) => void) }));
vi.mock("../../core/bootstrap.js", async (importActual) => ({
  ...(await importActual()),
  bootstrap: vi.fn(
    () =>
      new Promise((resolve) => {
        hoisted.resolve = resolve;
      }),
  ),
}));
vi.mock("../../core/context-pack.js", async (importActual) => ({
  ...(await importActual()),
  generateContextPack: vi.fn(() => ({ content: "", cacheHit: false, generationMs: 1, size: 0 })),
  resumePreamble: vi.fn(() => undefined),
}));
vi.mock("../../core/git.js", async (importActual) => ({
  ...(await importActual()),
  ensureWorktree: vi.fn(() => ({ ok: true as const, path: "/tmp", created: false })),
}));
vi.mock("../agents.js", async (importActual) => ({
  ...(await importActual()),
  resolveAgentForTask: vi.fn(() => ({ id: "eng", kind: "engineer" }) as never),
  pausedAgentFallbackNote: vi.fn(() => undefined),
}));
vi.mock("../model-routing-wiring.js", async (importActual) => ({
  ...(await importActual()),
  resolveRoutedAgent: vi.fn(() => ({ agent: { id: "eng", kind: "engineer" } })),
}));
vi.mock("../task-underspecified-flag.js", async (importActual) => ({
  ...(await importActual()),
  flagTaskSpecFlagsIfNeededAsync: vi.fn(async () => null),
}));

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
title: TOCTOU fixture
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

let fixture: Fixture | null = null;
afterEach(() => {
  if (fixture) fixture.clean();
  fixture = null;
});

function makeFixture(status: string, extra = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-hold-toctou-"));
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const taskPath = join(workDir, "0296-toctou.md");
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

function makeCtx(fx: Fixture): RouteContext {
  const runner = {
    isRunning: () => false,
    stop: vi.fn(() => ({ stopped: true })),
    start: vi.fn(() => ({ ok: true as const, pid: 1, queued: false })),
    markPaused: vi.fn(),
    clearHoldPause: vi.fn(),
  } as never;
  return {
    config: fx.config,
    index: {
      getTask: () => readTaskFile(fx),
      getTasks: () => [readTaskFile(fx)],
      applyFileChange: () => {},
      refreshBranches: () => {},
      refreshBranchesAsync: async () => {},
    } as any,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => false, cancel: vi.fn() } as any,
    runner,
    previews: { stop: vi.fn(async () => {}) } as any,
    cto: {} as any,
    freeformRuns: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: { enqueue: () => ({}), allJobs: () => [] } as any,
    reportedStages: {},
    reportedStageAt: {},
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
    onServerStatusChange: () => {},
    startUnifiedHandoff: () => ({ started: false, reason: "not wired" }),
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("start honors a hold that lands during bootstrap (#0960 round 3 TOCTOU)", () => {
  it("refuses to spawn when a hold is applied mid-bootstrap", async () => {
    const fx = makeFixture("ready");
    fixture = fx;
    const ctx = makeCtx(fx);
    const { res, fake } = makeRes();

    // Kick off the start; it awaits the controllable bootstrap.
    const startPromise = taskAction(ctx, makeReq(), res, { param1: "0296", param2: "start" });

    // Let the handler reach the await on bootstrap.
    await new Promise((r) => setTimeout(r, 20));
    expect(hoisted.resolve).not.toBeNull();

    // A concurrent `repoos hold` lands while the engineer bootstrap is in flight.
    writeFileSync(
      fx.taskPath,
      taskText("ready", "hold: true\nhold_reason: concurrent hold during bootstrap\n"),
    );

    // Now let bootstrap complete.
    hoisted.resolve!({ ok: true, durationMs: 1, steps: [] });
    await startPromise;

    // The pre-bootstrap hold check passed (no hold yet), but the spawn-point
    // re-check must catch the now-held task.
    expect(fake.status).toBe(409);
    const payload = fake.payload as { held: boolean; error: string };
    expect(payload.held).toBe(true);
    expect(payload.error).toMatch(/held/i);
    // The engineer must never have been spawned.
    expect((ctx.runner as any).start).not.toHaveBeenCalled();
  });

  it("control: a hold present at the very start is caught by the early guard (no spawn)", async () => {
    const fx = makeFixture("ready", "hold: true\nhold_reason: already held\n");
    fixture = fx;
    const ctx = makeCtx(fx);
    const { res, fake } = makeRes();
    await taskAction(ctx, makeReq(), res, { param1: "0296", param2: "start" });
    expect(fake.status).toBe(409);
    expect((ctx.runner as any).start).not.toHaveBeenCalled();
  });
});

describe("unhold --start uses normal activation", () => {
  it.each(["ready", "active"])("releases and starts a %s task", async (status) => {
    const fx = makeFixture(status, "hold: true\nhold_reason: maintenance\ntags: [hold]\n");
    fixture = fx;
    const ctx = makeCtx(fx);
    const { res, fake } = makeRes();
    hoisted.resolve = null;
    const pending = taskAction(ctx, makeReq({ start: true }), res, {
      param1: "0296",
      param2: "unhold",
    });
    await vi.waitFor(() => expect(hoisted.resolve).not.toBeNull());
    hoisted.resolve!({ ok: true, durationMs: 1, steps: [] });
    await pending;
    expect(fake.status).toBe(200);
    expect(fake.payload).toMatchObject({ released: true, started: true });
    expect(readTaskFile(fx)).toMatchObject({ status: "active", isHeld: false, tags: [] });
    expect(ctx.runner.clearHoldPause).toHaveBeenCalledWith("0296");
    expect(ctx.runner.start).toHaveBeenCalledOnce();
  });
});
