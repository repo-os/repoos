/**
 * Integration test for the real `POST /api/tasks/freeform` route carrying input
 * attachments onto the created task (#0382, audit round 2).
 *
 * The existing `input-attachments.test.ts` re-implements the carry loop in
 * user-space, which leaves the actual server path (the route handler in
 * `src/server/routes/tasks.ts`) untested. This file drives the handler with
 * a real `RouteContext`, an in-process HTTP-shaped req/res pair, and the same
 * RepoOS + LiveIndex the production server builds.
 *
 * PM agent is intentionally left unconfigured — the handler's no-PM
 * fallback branch returns synchronously after the carry, so the test
 * exercises the full server-side path (create draft → carry → applyFileChange
 * → write body) without spawning an external CLI.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import type { RouteContext } from "../../server/routes/types";
import { createFreeformTask } from "../../server/routes/tasks";
import { createRepoOS } from "../../core/repoos";
import { agentsForConfig } from "../../core/config";
import { createInput, saveInputAttachment } from "../../core/input";
import { LiveIndex } from "../../server/live-index";
import { createLogger } from "../../core/logger";

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface CapturedResponse {
  status: number;
  body: unknown;
}

/**
 * Build a minimal RouteContext enough to drive `createFreeformTask`. Other
 * handlers (start, message, preview, …) are not used in these tests — only
 * the fields `createFreeformTask` reads are non-stub.
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
    // The unused-by-createFreeformTask managers are stubbed to satisfy the
    // type. They are never invoked by the freeform route when no PM agent
    // is configured (the path this test exercises).
    runner: {} as RouteContext["runner"],
    previews: {} as RouteContext["previews"],
    reviews: {} as RouteContext["reviews"],
    cto: {} as RouteContext["cto"],
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
  } as RouteContext;
}

/**
 * Build an HTTP-shaped (req, res) pair from a JSON request body, capturing
 * the route's response into a plain object so assertions can read it.
 */
function makeReqRes(body: unknown): {
  req: IncomingMessage;
  res: ServerResponse;
  capture: CapturedResponse;
} {
  const capture: CapturedResponse = { status: 0, body: undefined };
  const payload = Buffer.from(JSON.stringify(body), "utf8");

  // `readBody` iterates the IncomingMessage as an async iterable of Buffer
  // chunks. A minimal Readable stub is enough — no real socket needed.
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

describe("createFreeformTask route — input attachment carry-over (#0382)", () => {
  let root: string;
  let repoos: ReturnType<typeof createRepoOS>;
  let index: LiveIndex;
  let ctx: RouteContext;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-freeform-carry-"));
    repoos = createRepoOS(root);
    // Disable the built-in PM agent so the route takes the synchronous
    // no-PM fallback branch (which still runs the carry loop and writes
    // the body to disk). With the default enabled PM the route fires off
    // a fire-and-forget async IIFE that would touch an external CLI.
    // `agentsForConfig` seeds the defaults when the stored list is empty,
    // so we have to materialize the seeded list and flip the PM entry.
    const seeded = agentsForConfig(repoos.config);
    repoos.config.agents = seeded.map((a) => (a.name === "pm" ? { ...a, enabled: false } : a));
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

  it("carries a single input attachment into the new task's ## Screenshots and disk", async () => {
    const input = createInput(repoos.config, "Add dark mode", "idea", "human");
    saveInputAttachment(repoos.config, input.id, "dark.png", PNG_1PX);

    const { req, res, capture } = makeReqRes({
      explanation: "Add dark mode",
      inputId: input.id,
    });

    await createFreeformTask(ctx, req, res, {});

    expect(capture.status).toBe(201);
    const body = (capture.body as { task?: { id?: string; body?: string; pmWorking?: boolean } })
      .task;
    expect(body?.id).toBeTruthy();
    expect(body?.pmWorking).toBe(false); // no-pm-agent fallback returns synchronously
    expect(body?.body).toContain("## Screenshots");
    expect(body?.body).toContain(`![dark](/api/tasks/${body!.id}/attachments/screenshot-1.png)`);
    // Activity log remains the last section.
    expect(body!.body!.indexOf("## Screenshots")).toBeLessThan(body!.body!.indexOf("## Activity"));

    // Image bytes are on disk under the task's own attachments dir, not the
    // input's — so deleting the input later does not break the task.
    const onDisk = join(root, repoos.config.workDir, ".attachments", body!.id!, "screenshot-1.png");
    expect(existsSync(onDisk)).toBe(true);
    expect(readFileSync(onDisk, "utf8")).toBe(Buffer.from(PNG_1PX, "base64").toString());
  });

  it("carries multiple input attachments, each ending up as a numbered task screenshot", async () => {
    const input = createInput(repoos.config, "Bug repro", "bug", "human");
    saveInputAttachment(repoos.config, input.id, "first.png", PNG_1PX);
    saveInputAttachment(repoos.config, input.id, "second.png", PNG_1PX);
    saveInputAttachment(repoos.config, input.id, "third.png", PNG_1PX);

    const { req, res, capture } = makeReqRes({
      explanation: "Bug repro",
      inputId: input.id,
    });
    await createFreeformTask(ctx, req, res, {});

    const body = (capture.body as { task?: { id?: string; body?: string } }).task!;
    expect(capture.status).toBe(201);
    // Filesystem readdir is order-dependent, so the carry order isn't pinned
    // down here. What IS pinned is that every input attachment ends up in
    // ## Screenshots (by its base name) and on disk as a numbered
    // screenshot-N.png under the task's own folder.
    const inputNames = ["first.png", "second.png", "third.png"];
    for (const n of inputNames) {
      expect(body.body).toContain(`![${n.replace(/\.png$/, "")}]`);
    }
    expect(body.body!.split("## Screenshots").length - 1).toBe(1);

    const taskDir = join(root, repoos.config.workDir, ".attachments", body.id!);
    expect(readdirSync(taskDir).sort()).toEqual([
      "screenshot-1.png",
      "screenshot-2.png",
      "screenshot-3.png",
    ]);
  });

  it("silently ignores an inputId that doesn't match a known input", async () => {
    const { req, res, capture } = makeReqRes({
      explanation: "lonely task",
      inputId: "ghost-input-id",
    });
    await createFreeformTask(ctx, req, res, {});
    expect(capture.status).toBe(201);
    const body = (capture.body as { task?: { body?: string } }).task!;
    // No ## Screenshots section yet — carry was a no-op and the PM path
    // would still see no images (correct behavior).
    expect(body.body).not.toContain("## Screenshots");
    // The original prompt is preserved as ## Original prompt.
    expect(body.body).toContain("## Original prompt");
    expect(body.body).toContain("lonely task");
  });
});
