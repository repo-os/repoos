/**
 * Durable freeform-PM runs (#0403).
 *
 * `createFreeformTask` used to kick off the PM agent through a fire-and-forget
 * `runPrompt` closure: in-memory buffers, pipes owned by the serving process,
 * no durable record. A server reload mid-run silently killed it. These tests
 * cover the replacement machinery: a detached spawn writing durable per-run
 * logs + a registry record, boot-time adoption that finalizes a run whose
 * process already exited, and the durable failure trace left on the draft.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { createRepoOS } from "../../core/repoos";
import type { Agent, Task } from "../../core/types";
import { LiveIndex } from "../../server/live-index";
import { createLogger } from "../../core/logger";
import type { RouteContext } from "../../server/routes/types";
import {
  FreeformRunManager,
  freeformFailureForRun,
  freeformLogPaths,
  readFreeformRuns,
  readFreeformStore,
  type FreeformRunRecord,
  type StartFreeformRunInput,
} from "../../server/freeform-runs";
import {
  createFreeformTask,
  finalizeFreeformRun,
  type FreeformFinalizeDeps,
} from "../../server/routes/tasks";
import type { PromptResult } from "../../server/agents";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-freeform-run-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  roots.length = 0;
});

const PM: Agent = { name: "pm", cli: "opencode", model: "default", enabled: true };

/** Poll until `predicate` is true or the timeout elapses. */
async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Write a tiny CLI that prints `text` to stdout and exits. */
function writeEmitter(root: string, text: string): { cmd: string; args: string[] } {
  const script = join(root, "emit.js");
  writeFileSync(script, `process.stdout.write(${JSON.stringify(text)});\n`, "utf8");
  return { cmd: process.execPath, args: [script] };
}

/** Plain-line text from an emitted agent.output entry. */
function entryText(entry: unknown): string {
  return typeof (entry as { d?: unknown })?.d === "string" ? (entry as { d: string }).d : "";
}

describe("FreeformRunManager — durable freeform PM runs (#0403)", () => {
  it("writes a durable log + registry record and finalizes a live run", async () => {
    const root = tempRoot();
    const config = createRepoOS(root).config;
    const finalized: { record: FreeformRunRecord; result: PromptResult }[] = [];
    const emitted: string[] = [];
    const manager = new FreeformRunManager(
      config,
      (e) => {
        if (e.type === "agent.output") emitted.push(entryText(e.entry));
      },
      (record, result) => finalized.push({ record, result }),
    );

    const taskFile = "---\ntitle: Added\n---\n\n## Problem\nx\n";
    const res = manager.start({
      runId: "run-live",
      taskId: "0400",
      cwd: root,
      explanation: "make it so",
      agent: PM,
      command: writeEmitter(root, taskFile),
    });
    expect(res.ok).toBe(true);

    // The registry records the run while it is in flight.
    expect(readFreeformRuns(config).map((r) => r.runId)).toContain("run-live");

    await waitFor(() => finalized.length === 1);
    expect(finalized[0]!.result.ok).toBe(true);
    expect(finalized[0]!.result.output).toContain("title: Added");

    // Durable log survives the run, and the run record is cleared.
    const logs = freeformLogPaths(config, "run-live");
    expect(existsSync(logs.out)).toBe(true);
    expect(readFileSync(logs.out, "utf8")).toContain("title: Added");
    expect(readFreeformRuns(config).length).toBe(0);
    // Live output was streamed while running.
    expect(emitted.join("\n")).toContain("title: Added");
  });

  it("adopts and finalizes a run whose process already exited", () => {
    const root = tempRoot();
    const config = createRepoOS(root).config;
    const record: FreeformRunRecord = {
      runId: "run-dead",
      taskId: "0401",
      // A PID that cannot be alive.
      pid: 2_147_483_646,
      cwd: root,
      explanation: "orphaned run",
      agent: PM,
      startedAt: new Date(Date.now() - 5000).toISOString(),
    };
    const logs = freeformLogPaths(config, "run-dead");
    mkdirSync(join(root, config.cacheDir, "agent-logs"), { recursive: true });
    writeFileSync(logs.out, "---\ntitle: Orphaned\n---\n\n## Problem\ny\n", "utf8");
    writeFileSync(
      join(root, config.cacheDir, "freeform-runs.json"),
      JSON.stringify({ runs: [record], failures: [] }),
      "utf8",
    );

    const finalized: { result: PromptResult }[] = [];
    const manager = new FreeformRunManager(
      config,
      () => {},
      (_r, result) => finalized.push({ result }),
    );
    manager.adopt();

    expect(finalized.length).toBe(1);
    expect(finalized[0]!.result.ok).toBe(true);
    expect(finalized[0]!.result.output).toContain("title: Orphaned");
    expect(readFreeformRuns(config).length).toBe(0);
  });
});

describe("finalizeFreeformRun — durable failure trace (#0403)", () => {
  function finalizeDepsFor(root: string): FreeformFinalizeDeps {
    const repoos = createRepoOS(root);
    const index = new LiveIndex(repoos.config);
    index.refreshAll();
    return {
      config: repoos.config,
      index,
      logger: createLogger(root),
      emitEvent: () => {},
    };
  }

  it("keeps the draft, appends a durable note, and records the failure", () => {
    const root = tempRoot();
    const repoos = createRepoOS(root);
    const created = repoos.createTask({
      title: "Rough idea",
      body: "rough idea",
      originalPrompt: "rough idea",
      status: "draft",
    });
    const deps = finalizeDepsFor(root);
    const emitted: string[] = [];
    deps.emitEvent = (e) => emitted.push(e.type);
    const record: FreeformRunRecord = {
      runId: "run-fail",
      taskId: created.id,
      pid: 1,
      cwd: root,
      explanation: "rough idea",
      agent: PM,
      startedAt: new Date().toISOString(),
    };

    finalizeFreeformRun(deps, record, {
      ok: false,
      error: "You've hit your usage limit",
      elapsedMs: 100,
    });

    // Durable, revisit-later trace lives on the draft task itself.
    const onDisk = readFileSync(created.absPath, "utf8");
    expect(onDisk).toContain("Freeform PM run failed: You've hit your usage limit");
    expect(onDisk).toContain("status: draft");
    // And is queryable against the run id.
    expect(freeformFailureForRun(repoos.config, "run-fail")?.reason).toBe(
      "You've hit your usage limit",
    );
    expect(readFreeformStore(repoos.config).failures.length).toBe(1);
    // The live failure event still fires for connected clients.
    expect(emitted).toContain("task.aiCreateFailed");
  });

  it("does not overwrite a draft that was already promoted by a racing finalize", () => {
    const root = tempRoot();
    const repoos = createRepoOS(root);
    const created = repoos.createTask({
      title: "Rough idea",
      body: "rough idea",
      originalPrompt: "rough idea",
      status: "draft",
    });
    // Simulate a racing finalize promoting the draft first.
    repoos.updateTask(created.id, { status: "inbox", body: "promoted body" });
    const deps = finalizeDepsFor(root);

    const record: FreeformRunRecord = {
      runId: "run-race",
      taskId: created.id,
      pid: 1,
      cwd: root,
      explanation: "rough idea",
      agent: PM,
      startedAt: new Date().toISOString(),
    };
    finalizeFreeformRun(deps, record, {
      ok: true,
      output: "---\ntitle: New title\n---\n\n## Problem\nnew\n",
      elapsedMs: 10,
    });

    const onDisk = readFileSync(created.absPath, "utf8");
    expect(onDisk).toContain("promoted body");
    expect(onDisk).not.toContain("New title");
    const task: Task | null = deps.index.getTask(created.id);
    expect(task?.status).toBe("inbox");
  });
});

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Minimal HTTP-shaped req/res pair so the route handler can be driven directly. */
function makeReqRes(body: unknown): {
  req: IncomingMessage;
  res: ServerResponse;
  capture: CapturedResponse;
} {
  const capture: CapturedResponse = { status: 0, body: {} };
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as unknown as IncomingMessage;
  req.headers = { "content-type": "application/json" };
  req.url = "/api/tasks/freeform";
  req.method = "POST";

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
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      capture.body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      capture.body = { raw: text };
    }
    return res;
  };
  return { req, res, capture };
}

describe("createFreeformTask — durable run integration (#0403)", () => {
  function makeCtx(root: string): { ctx: RouteContext; starts: StartFreeformRunInput[] } {
    const repoos = createRepoOS(root);
    const index = new LiveIndex(repoos.config);
    index.refreshAll();
    const starts: StartFreeformRunInput[] = [];
    const freeformRuns = {
      start: (input: StartFreeformRunInput) => {
        starts.push(input);
        return { ok: true, pid: 999_999 };
      },
    } as unknown as RouteContext["freeformRuns"];
    const ctx = {
      config: repoos.config,
      repoos,
      index,
      logger: createLogger(root),
      emitEvent: () => {},
      freeformRuns,
      onServerStatusChange: () => {},
    } as unknown as RouteContext;
    return { ctx, starts };
  }

  it("routes a PM-configured freeform create through the durable manager", async () => {
    const root = tempRoot();
    const { ctx, starts } = makeCtx(root);
    const { req, res, capture } = makeReqRes({
      explanation: "make it durable",
      runId: "run-route",
    });

    await createFreeformTask(ctx, req, res, {});

    expect(capture.status).toBe(201);
    expect(capture.body.fallback).toBe(false);
    expect(starts.length).toBe(1);
    expect(starts[0]!.runId).toBe("run-route");
    expect(starts[0]!.explanation).toBe("make it durable");
    expect(starts[0]!.agent.name).toBe("pm");
  });

  it("records a durable failure when the run cannot be launched", async () => {
    const root = tempRoot();
    const { ctx } = makeCtx(root);
    (
      ctx.freeformRuns as unknown as {
        start: (i: StartFreeformRunInput) => { ok: boolean; reason: string };
      }
    ).start = () => ({ ok: false, reason: "spawn ENOENT" });
    const { req, res, capture } = makeReqRes({ explanation: "no cli", runId: "run-nospawn" });

    await createFreeformTask(ctx, req, res, {});

    expect(capture.status).toBe(201);
    expect(capture.body.fallback).toBe(true);
    expect(capture.body.fallbackReason).toBe("agent-failed");
    expect(freeformFailureForRun(ctx.config, "run-nospawn")?.reason).toBe("spawn ENOENT");
  });
});
