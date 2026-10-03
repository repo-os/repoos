/**
 * Input enrichment (#0628). New inputs get an AI-written title/type/area from
 * the PM agent — but the PM's captured stdout is stream-json (one JSONL event
 * per line), and the old code fed that raw blob to a greedy `/\{[\s\S]*\}/`
 * regex, so JSON.parse always threw and every input kept its raw first-line
 * title. Now the POST returns the raw input immediately, the PM reply is
 * reduced to its final report text before parsing, enrichment runs in the
 * background, and both success (SSE `input.enriched`) and failure (log
 * warning) are visible.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { createRepoOS } from "../../core/repoos";
import { createInput, listInputs, updateInput } from "../../core/input";
import { getInputs, postInput, parseEnrichment, patchInput } from "../../server/routes/inputs";
import { createLogger } from "../../core/logger";
import { extractOneShotReportText } from "../../server/agents";
import type { RepoEvent } from "../../server/live-index";
import type { RouteContext } from "../../server/routes/types";
import { waitFor } from "./helpers";

// postInput resolves the PM through `resolvePmAgent` and runs it through
// `runPrompt`; both are stubbed so the route can be driven synchronously.
// The real `extractOneShotReportText` (also from this module) must survive
// the mock — it is what the regression is about.
vi.mock("../../server/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/agents")>();
  return {
    ...actual,
    resolvePmAgent: vi.fn(),
    runPrompt: vi.fn(),
    recordOneShotSession: vi.fn(),
  };
});

const { resolvePmAgent, runPrompt } = (await import("../../server/agents")) as unknown as {
  resolvePmAgent: Mock;
  runPrompt: Mock;
};

/** A cursor `--output-format stream-json` reply: JSONL events whose final
 *  assistant text carries the enrichment JSON (what composer-2.5 returns). */
const CURSOR_STREAM_JSON = [
  '{"type":"system","model":"composer-2.5","session_id":"ses-1"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Classifying the input."}]}}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"{\\"title\\":\\"Add export button to releases\\",\\"type\\":\\"improvement\\",\\"area\\":\\"web\\"}"}]}}',
  '{"type":"result","is_error":false}',
].join("\n");

function makeReqRes(
  body: unknown,
  method = "POST",
): { req: IncomingMessage; res: ServerResponse; capture: { status: number; body: unknown } } {
  const capture = { status: 0, body: undefined as unknown };
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as unknown as IncomingMessage;
  req.headers = { "content-type": "application/json" };
  req.method = method;

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
  return { req, res, capture };
}

interface Harness {
  root: string;
  ctx: RouteContext;
  events: RepoEvent[];
  systemLog: ReturnType<typeof vi.fn>;
}

function makeHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), "repoos-input-enrich-"));
  const repoos = createRepoOS(root);
  const events: RepoEvent[] = [];
  const ctx = {
    config: repoos.config,
    repoos,
    index: {} as RouteContext["index"],
    indexReady: Promise.resolve(),
    runner: {} as RouteContext["runner"],
    previews: {} as RouteContext["previews"],
    reviews: {} as RouteContext["reviews"],
    cto: {} as RouteContext["cto"],
    freeformRuns: {} as RouteContext["freeformRuns"],
    logger: createLogger(root),
    emitEvent: (e: RepoEvent) => events.push(e),
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
    startUnifiedHandoff: () => ({ started: false, reason: "not wired in this test" }),
  } as RouteContext;
  return { root, ctx, events, systemLog: vi.spyOn(ctx.logger, "system") };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("parseEnrichment", () => {
  it("parses the PM's flat JSON reply", () => {
    expect(parseEnrichment('{"title":"T","type":"bug","area":"web"}')).toEqual({
      title: "T",
      type: "bug",
      area: "web",
    });
  });

  it("parses JSON wrapped in prose", () => {
    expect(parseEnrichment('Here you go:\n{"title":"T","type":"idea","area":""}\nDone.')).toEqual({
      title: "T",
      type: "idea",
      area: "",
    });
  });

  it("recovers an object whose string values contain braces", () => {
    // The flat scan mis-cuts on the inner braces; the greedy fallback saves it.
    expect(parseEnrichment('{"title":"fix {a} bug","type":"bug","area":"core"}')).toEqual({
      title: "fix {a} bug",
      type: "bug",
      area: "core",
    });
  });

  it("returns empty for prose without any JSON", () => {
    expect(parseEnrichment("This input is about exports. No object here.")).toEqual({});
  });

  it("returns empty when the only JSON has none of the fields", () => {
    expect(parseEnrichment('{"unrelated":true}')).toEqual({});
  });
});

describe("extractOneShotReportText + parseEnrichment (cursor stream-json)", () => {
  it("reduces the JSONL stream to the final text and yields title/type/area", () => {
    const report = extractOneShotReportText("cursor", CURSOR_STREAM_JSON);
    expect(report).toBe(
      '{"title":"Add export button to releases","type":"improvement","area":"web"}',
    );
    expect(parseEnrichment(report)).toEqual({
      title: "Add export button to releases",
      type: "improvement",
      area: "web",
    });
  });

  it("yields nothing parseable from the raw stream (the old, unextracted path)", () => {
    // Documents the regression: feeding the raw JSONL blob to the parser —
    // what postInput did before #0628 — cannot produce the greedy-span object.
    const raw = CURSOR_STREAM_JSON;
    expect(raw.match(/\{[\s\S]*\}/)).toBeTruthy();
    expect(JSON.parse.bind(null, raw.match(/\{[\s\S]*\}/)![0])).toThrow();
  });
});

describe("postInput background enrichment (#0628)", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
    vi.mocked(resolvePmAgent).mockReturnValue({
      name: "pm",
      cli: "cursor",
      model: "composer-2.5",
      enabled: true,
    });
  });

  afterEach(() => {
    rmSync(h.root, { recursive: true, force: true });
  });

  async function submit(
    text = "Add an export button to the releases tab",
  ): Promise<{ id: string; path: string; title: string; type: string; enriching?: boolean }> {
    const { req, res, capture } = makeReqRes({ text });
    await postInput(h.ctx, req, res, {});
    return capture.body as {
      id: string;
      path: string;
      title: string;
      type: string;
      enriching?: boolean;
    };
  }

  it("lists enriching:true on GET /api/inputs while the PM run is in flight", async () => {
    let resolveRun!: (v: { ok: boolean; output?: string }) => void;
    vi.mocked(runPrompt).mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    const created = await submit();
    const { req, res, capture } = makeReqRes(null, "GET");
    await getInputs(h.ctx, req, res, {});
    expect((capture.body as { enriching?: boolean }[])[0]?.enriching).toBe(true);

    resolveRun({ ok: true, output: CURSOR_STREAM_JSON });
    await waitFor(() => h.events.length === 1, "input.enriched event");

    const after = makeReqRes(null, "GET");
    await getInputs(h.ctx, after.req, after.res, {});
    const row = (after.capture.body as { id: string; title: string; enriching?: boolean }[]).find(
      (i) => i.id === created.id,
    );
    expect(row?.enriching).toBe(false);
    expect(row?.title).toBe("Add export button to releases");
  });

  it("returns the raw input immediately and enriches in the background", async () => {
    let resolveRun!: (v: { ok: boolean; output?: string }) => void;
    vi.mocked(runPrompt).mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    const created = await submit();
    // The POST answered before the PM run resolved: raw first-line title,
    // nothing enriched yet, no event — and `enriching` says the background
    // run actually started (#0631).
    expect(created.title).toBe("Add an export button to the releases tab");
    expect(created.enriching).toBe(true);
    expect(h.events).toEqual([]);

    resolveRun({ ok: true, output: CURSOR_STREAM_JSON });
    await waitFor(() => h.events.length === 1, "input.enriched event");

    const enriched = listInputs(h.ctx.config).find((i) => i.id === created.id)!;
    expect(enriched.title).toBe("Add export button to releases");
    expect(enriched.type).toBe("improvement");
    expect(enriched.area).toBe("web");
    expect(h.events[0].type).toBe("input.enriched");
    expect(h.events[0].type === "input.enriched" && h.events[0].input.title).toBe(
      "Add export button to releases",
    );
    // The enriched file was committed like any other capture.
    expect(readFileSync(join(h.root, enriched.path), "utf8")).toMatch(
      /^title: "Add export button to releases"$/m,
    );
    expect(vi.mocked(runPrompt).mock.calls[0]?.[1]).toContain("Add an export button");
  });

  it("keeps the raw title and logs when the PM output is unparseable", async () => {
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: "This input is about exports. No object here.",
    });

    const created = await submit();
    await waitFor(() => h.systemLog.mock.calls.length > 0, "enrichment warning");

    const input = listInputs(h.ctx.config).find((i) => i.id === created.id)!;
    expect(input.title).toBe("Add an export button to the releases tab");
    // Terminal event even when nothing was applied (#0631): the inputs-list
    // pending indicator must clear on a payload that is the unchanged input.
    expect(h.events).toHaveLength(1);
    expect(h.events[0].type === "input.enriched" && h.events[0].input.title).toBe(
      "Add an export button to the releases tab",
    );
    expect(h.systemLog).toHaveBeenCalledWith(
      "warn",
      "PM enrichment returned nothing parseable; input keeps raw title",
      expect.objectContaining({ input: created.id, cli: "cursor" }),
    );
  });

  it("keeps the raw title and logs the error when the PM run fails", async () => {
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "cursor-agent not found" });

    const created = await submit();
    await waitFor(() => h.systemLog.mock.calls.length > 0, "pm failure warning");

    const input = listInputs(h.ctx.config).find((i) => i.id === created.id)!;
    expect(input.title).toBe("Add an export button to the releases tab");
    expect(input.type).toBe("other");
    // Terminal event even when the PM run failed (#0631).
    expect(h.events).toHaveLength(1);
    expect(h.events[0].type === "input.enriched" && h.events[0].input.type).toBe("other");
    expect(h.systemLog).toHaveBeenCalledWith(
      "warn",
      "PM enrichment returned nothing parseable; input keeps raw title",
      expect.objectContaining({ input: created.id, error: "cursor-agent not found" }),
    );
  });

  it("emits the current on-disk input when enrichment fails after the user edited", async () => {
    let resolveRun!: (v: { ok: boolean; output?: string }) => void;
    vi.mocked(runPrompt).mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    const created = await submit();
    updateInput(h.ctx.config, created.id, { title: "User retitled while enriching" });
    resolveRun({ ok: true, output: "This input is about exports. No object here." });
    await waitFor(() => h.events.length === 1, "input.enriched after unparseable");

    expect(h.events[0].type === "input.enriched" && h.events[0].input.title).toBe(
      "User retitled while enriching",
    );
  });

  it("logs and keeps the raw title when the input is deleted while the PM runs", async () => {
    let resolveRun!: (v: { ok: boolean; output?: string }) => void;
    vi.mocked(runPrompt).mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    const created = await submit();
    rmSync(join(h.root, created.path));
    resolveRun({ ok: true, output: CURSOR_STREAM_JSON });
    await waitFor(() => h.systemLog.mock.calls.length > 0, "not-found warning");

    expect(h.events).toHaveLength(1);
    // The deleted input can't be re-read, so the terminal event carries the
    // originally captured input — enough for clients to clear the indicator.
    expect(h.events[0].type === "input.enriched" && h.events[0].id).toBe(created.id);
    expect(h.systemLog).toHaveBeenCalledWith(
      "warn",
      "input enrichment failed; input keeps raw title",
      expect.objectContaining({ input: created.id, reason: "input not found" }),
    );
  });

  it("does not run the PM when no PM agent is configured", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue(null);
    const created = await submit();
    expect(vi.mocked(runPrompt)).not.toHaveBeenCalled();
    expect(h.events).toEqual([]);
    // No enrichment started, so the response must not tell clients to show
    // an in-progress state (#0631).
    expect(created.enriching).toBe(false);
  });
});

describe("patchInput title/type/area patch (#0628 one-off retitle path)", () => {
  let root: string;
  let repoos: ReturnType<typeof createRepoOS>;
  let ctx: RouteContext;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-input-patch-"));
    repoos = createRepoOS(root);
    ctx = {
      config: repoos.config,
      logger: createLogger(root),
      emitEvent: () => {},
    } as unknown as RouteContext;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function patch(id: string, body: unknown) {
    const { req, res, capture } = makeReqRes(body, "PATCH");
    await patchInput(ctx, req, res, { param1: id });
    return capture;
  }

  it("sets an explicit title, type and area without touching the body", async () => {
    const created = createInput(
      repoos.config,
      "Long raw first line that got truncated a while ago\n\nMore detail.",
    );
    const capture = await patch(created.id, {
      title: "Short useful title",
      type: "improvement",
      area: "web",
    });
    expect(capture.status).toBe(200);
    const updated = listInputs(repoos.config).find((i) => i.id === created.id)!;
    expect(updated.title).toBe("Short useful title");
    expect(updated.type).toBe("improvement");
    expect(updated.area).toBe("web");
    // The body is untouched.
    expect(updated.body).toContain("More detail.");
    expect(readFileSync(join(root, updated.path), "utf8")).toMatch(/^title: Short useful title$/m);
  });

  it("rejects an empty title and a patch with no recognized fields", async () => {
    const created = createInput(repoos.config, "An idea");
    expect((await patch(created.id, { title: "   " })).body).toEqual({
      error: "title is required",
    });
    expect((await patch(created.id, {})).body).toEqual({
      error: "status, text, title, type or area is required",
    });
  });

  it("404s for an unknown input", async () => {
    expect((await patch("nope", { title: "x" })).status).toBe(404);
  });

  it("lets an explicit title override the body-derived one when both are sent", async () => {
    const created = createInput(repoos.config, "Derived title line\n\nBody.");
    await patch(created.id, { text: "New body first line\n\nBody.", title: "Curated title" });
    const updated = listInputs(repoos.config).find((i) => i.id === created.id)!;
    expect(updated.title).toBe("Curated title");
    expect(updated.body).toContain("New body first line");
  });
});

describe("postInput creates the input like before (#0628 regression guard)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-input-create-"));
    vi.mocked(resolvePmAgent).mockReturnValue(null);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("rejects empty text", async () => {
    const repoos = createRepoOS(root);
    const ctx = {
      config: repoos.config,
      logger: createLogger(root),
      emitEvent: () => {},
    } as unknown as RouteContext;
    const { req, res, capture } = makeReqRes({ text: "   " });
    await postInput(ctx, req, res, {});
    expect(capture.status).toBe(400);
    expect(capture.body).toEqual({ error: "text is required" });
  });

  it("writes the input file with the raw first-line title", async () => {
    const repoos = createRepoOS(root);
    const ctx = {
      config: repoos.config,
      logger: createLogger(root),
      emitEvent: () => {},
    } as unknown as RouteContext;
    const { req, res, capture } = makeReqRes({ text: "Saw a bug on the board" });
    await postInput(ctx, req, res, {});
    expect(capture.status).toBe(201);
    const input = listInputs(repoos.config).find(
      (i) => i.id === (capture.body as { id: string }).id,
    );
    expect(input?.title).toBe("Saw a bug on the board");
  });
});
