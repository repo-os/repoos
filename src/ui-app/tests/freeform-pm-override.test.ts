/**
 * `POST /api/tasks/freeform` persists the freeform pane's PM picker selection
 * onto the created task's frontmatter (#0461).
 *
 * Before this, the picker override only drove the one-off flesh-out run; the
 * task's `pm_*_override` frontmatter stayed empty, so every later PM action
 * (reply-from-context, re-flesh-out, restart) silently fell back to the
 * configured default PM agent/model. These tests drive the real route handler
 * with an in-process HTTP-shaped req/res pair and a real RepoOS + LiveIndex,
 * stubbing only the detached run manager so no external CLI is spawned.
 *
 * The stub always fails the run on purpose: a failed flesh-out must keep the
 * saved pin (the user's intent is independent of run success — the #0461 task
 * itself was filed after its own PM run timed out).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import type { RouteContext } from "../../server/routes/types";
import { createFreeformTask } from "../../server/routes/tasks";
import { createRepoOS } from "../../core/repoos";
import { LiveIndex } from "../../server/live-index";
import { createLogger } from "../../core/logger";

interface CapturedResponse {
  status: number;
  body: unknown;
}

/**
 * Minimal RouteContext for `createFreeformTask`. `freeformRuns.start` is
 * stubbed to fail immediately so the route takes its synchronous
 * `agent-failed` finalize path — no CLI process is launched, but the full
 * create → persist → finalize sequence runs for real.
 */
function makeCtx(opts: {
  root: string;
  repoos: ReturnType<typeof createRepoOS>;
  index: LiveIndex;
}): RouteContext {
  return {
    config: opts.repoos.config,
    repoos: opts.repoos,
    index: opts.index,
    indexReady: Promise.resolve(),
    runner: {} as RouteContext["runner"],
    previews: {} as RouteContext["previews"],
    reviews: {} as RouteContext["reviews"],
    cto: {} as RouteContext["cto"],
    freeformRuns: {
      start: () => ({ ok: false, reason: "stubbed: no CLI in this test" }),
    } as unknown as RouteContext["freeformRuns"],
    logger: createLogger(opts.root),
    emitEvent: () => {},
    closeOutLock: {} as RouteContext["closeOutLock"],
    rootLock: {} as RouteContext["rootLock"],
    jobCoordinator: {} as RouteContext["jobCoordinator"],
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    syncTaskBranch: () => Promise.resolve({ ok: true, conflicts: [] }),
    onServerStatusChange: () => {},
    // #0507: review transitions are requests, not writes -- these contexts
    // never move a task to review, so the handoff finalization is a no-op stub.
    startUnifiedHandoff: () => ({ started: false, reason: "not wired in this test" }),
  } as RouteContext;
}

function makeReqRes(body: unknown): {
  req: IncomingMessage;
  res: ServerResponse;
  capture: CapturedResponse;
} {
  const capture: CapturedResponse = { status: 0, body: undefined };
  const payload = Buffer.from(JSON.stringify(body), "utf8");

  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  });
  const reqAsIncoming = req as unknown as IncomingMessage;
  reqAsIncoming.headers = { "content-type": "application/json" };
  reqAsIncoming.url = "/api/tasks/freeform";
  reqAsIncoming.method = "POST";

  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  }) as unknown as ServerResponse;
  const resAsServer = res as unknown as {
    writeHead: (status: number) => ServerResponse;
    end: (chunk?: string | Buffer) => ServerResponse;
  };
  resAsServer.writeHead = (status: number) => {
    capture.status = status;
    return res;
  };
  resAsServer.end = (chunk?: string | Buffer) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    try {
      capture.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      capture.body = Buffer.concat(chunks).toString("utf8");
    }
    return res;
  };

  return { req: reqAsIncoming, res, capture };
}

describe("createFreeformTask route — PM picker override persistence (#0461)", () => {
  let root: string;
  let repoos: ReturnType<typeof createRepoOS>;
  let index: LiveIndex;
  let ctx: RouteContext;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-freeform-pm-override-"));
    repoos = createRepoOS(root);
    index = new LiveIndex(repoos.config);
    index.refreshAll();
    ctx = makeCtx({ root, repoos, index });
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  });

  async function post(body: Record<string, unknown>) {
    const { req, res, capture } = makeReqRes(body);
    await createFreeformTask(ctx, req, res, {});
    const task = (
      capture.body as {
        task?: {
          id?: string;
          absPath?: string;
          pmAgentOverride?: string | null;
          pmCliOverride?: string | null;
          pmModelOverride?: string | null;
        };
      }
    ).task;
    return { capture, task };
  }

  it("persists a pinned model and leaves the unchanged agent/cli null", async () => {
    const { capture, task } = await post({
      explanation: "a pinned model idea",
      agentOverride: "pm",
      cliOverride: "opencode",
      modelOverride: "sonnet",
    });

    expect(capture.status).toBe(201);
    expect(task).toBeTruthy();
    // Every test here runs through the stub's failed flesh-out, so these
    // assertions double as proof that a failed run does NOT clear the pin.
    expect(task!.pmModelOverride).toBe("sonnet");
    expect(task!.pmAgentOverride).toBeNull();
    expect(task!.pmCliOverride).toBeNull();

    // Persisted to disk, not just the in-memory response.
    const onDisk = readFileSync(task!.absPath!, "utf8");
    expect(onDisk).toContain("pm_model_override: sonnet");
    expect(onDisk).not.toContain("pm_agent_override:");
    expect(onDisk).not.toContain("pm_cli_override:");
  });

  it("leaves all three null when no override is sent", async () => {
    const { capture, task } = await post({ explanation: "no override here" });
    expect(capture.status).toBe(201);
    expect(task!.pmAgentOverride).toBeNull();
    expect(task!.pmCliOverride).toBeNull();
    expect(task!.pmModelOverride).toBeNull();
    const onDisk = readFileSync(task!.absPath!, "utf8");
    expect(onDisk).not.toContain("pm_agent_override:");
    expect(onDisk).not.toContain("pm_cli_override:");
    expect(onDisk).not.toContain("pm_model_override:");
  });

  it("treats the 'default' model sentinel as no pin", async () => {
    const { task } = await post({
      explanation: "default model pick",
      agentOverride: "pm",
      cliOverride: "opencode",
      modelOverride: "default",
    });
    expect(task!.pmAgentOverride).toBeNull();
    expect(task!.pmCliOverride).toBeNull();
    expect(task!.pmModelOverride).toBeNull();
  });

  it("persists a different agent and leaves cli/model unchanged null", async () => {
    const { task } = await post({
      explanation: "different agent",
      agentOverride: "engineer",
      cliOverride: "opencode",
      modelOverride: "big pickle",
    });
    expect(task!.pmAgentOverride).toBe("engineer");
    expect(task!.pmCliOverride).toBeNull();
    expect(task!.pmModelOverride).toBeNull();
  });

  it("persists a different CLI and never stores the 'default' model as a pin", async () => {
    const { task } = await post({
      explanation: "different cli",
      agentOverride: "pm",
      cliOverride: "claude code",
      modelOverride: "default",
    });
    expect(task!.pmAgentOverride).toBeNull();
    expect(task!.pmCliOverride).toBe("claude code");
    expect(task!.pmModelOverride).toBeNull();
  });
});
