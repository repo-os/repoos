/**
 * Bug-report composer tests (#0463).
 *
 * Covers the `POST /api/support/bug-report` route handler: generation
 * request/error states, the no-PM-agent fallback, and redaction-aware
 * prompt construction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { RouteContext } from "../../server/routes/types";
import { generateBugReport } from "../../server/routes/support";
import { createRepoOS } from "../../core/repoos";
import { LiveIndex } from "../../server/live-index";
import { createLogger } from "../../core/logger";

vi.mock("../../server/agents.js", async (actual) => ({
  ...actual,
  resolvePmAgent: vi.fn(),
  runPrompt: vi.fn(),
  recordOneShotSession: vi.fn(),
}));

import { resolvePmAgent, runPrompt, recordOneShotSession } from "../../server/agents.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function fixtureRepo(): string {
  const root = tmp("repoos-bug-report-");
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(root, "repoos.toml"),
    [
      'workDir = "work"',
      'cacheDir = ".repoos"',
      "",
      "[check]",
      "version = 1",
      "",
      "[[check.steps]]",
      'name = "build"',
      'command = "true"',
      "",
    ].join("\n"),
  );
  return root;
}

function makeCtx(root: string): RouteContext {
  const repoos = createRepoOS(root);
  return {
    config: repoos.config,
    repoos,
    index: new LiveIndex(repoos.config),
    indexReady: Promise.resolve(),
    runner: {} as RouteContext["runner"],
    previews: {} as RouteContext["previews"],
    reviews: {} as RouteContext["reviews"],
    cto: {} as RouteContext["cto"],
    freeformRuns: {} as unknown as RouteContext["freeformRuns"],
    logger: createLogger(root),
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

interface CapturedResponse {
  status: number;
  body: unknown;
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
  }) as unknown as IncomingMessage;
  (req as any).headers = { "content-type": "application/json", "content-length": payload.length };

  const res = {
    writeHead(status: number, _headers?: Record<string, string>) {
      capture.status = status;
    },
    end(data: unknown) {
      try {
        capture.body = JSON.parse(String(data));
      } catch {
        capture.body = data;
      }
    },
  } as unknown as ServerResponse;

  return { req, res, capture };
}

describe("bug-report composer (#0463)", () => {
  let root: string;
  let ctx: RouteContext;

  beforeEach(() => {
    root = fixtureRepo();
    ctx = makeCtx(root);
    vi.clearAllMocks();
  });

  it("returns 400 when text is empty", async () => {
    const { req, res, capture } = makeReqRes({ text: "" });
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(400);
    expect(capture.body).toEqual({ error: "text is required" });
  });

  it("returns 400 when text is missing", async () => {
    const { req, res, capture } = makeReqRes({});
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(400);
  });

  it("returns no-pm-agent when no PM agent is configured", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue(null);
    const { req, res, capture } = makeReqRes({ text: "The build fails" });
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(200);
    expect(capture.body).toMatchObject({ ok: false, error: "no-pm-agent" });
    expect(typeof (capture.body as any).hint).toBe("string");
    expect((capture.body as any).hint).toContain("Settings");
  });

  it("returns generation-failed when runPrompt throws", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockRejectedValue(new Error("CLI not found"));
    const { req, res, capture } = makeReqRes({ text: "App crashes on start" });
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(200);
    expect(capture.body).toMatchObject({ ok: false, error: "generation-failed" });
    expect((capture.body as any).hint).toContain("CLI not found");
  });

  it("returns generation-failed when result.ok is false", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "timeout" });
    const { req, res, capture } = makeReqRes({ text: "Slow response" });
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(200);
    expect(capture.body).toMatchObject({ ok: false, error: "generation-failed" });
  });

  it("returns generation-failed when output is empty", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "" });
    const { req, res, capture } = makeReqRes({ text: "Empty response" });
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(200);
    expect(capture.body).toMatchObject({ ok: false, error: "generation-failed" });
  });

  it("returns title and body on success", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: [
        "## Title",
        "Build fails on clean checkout",
        "",
        "## Expected Behavior",
        "Should build successfully.",
        "",
        "## Actual Behavior",
        "Fails with missing module.",
        "",
        "## Steps to Reproduce",
        "1. Clone repo",
        "2. Run `bun run build`",
        "",
        "## Environment",
        "- RepoOS: 0.1.0",
        "- macOS",
        "",
        "## Additional Context",
        "None.",
      ].join("\n"),
    });
    const { req, res, capture } = makeReqRes({ text: "Build fails on clean checkout" });
    await generateBugReport(ctx, req, res, {});
    expect(capture.status).toBe(200);
    expect(capture.body).toMatchObject({ ok: true });
    const body = capture.body as { ok: boolean; title: string; body: string };
    expect(body.title).toBe("Build fails on clean checkout");
    expect(body.body).toContain("## Expected Behavior");
    expect(body.body).toContain("## Steps to Reproduce");
  });

  it("records a one-shot session on success", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: "## Title\nTest\n\n## Body\nDetail.",
    });
    const { req, res } = makeReqRes({ text: "Test issue" });
    await generateBugReport(ctx, req, res, {});
    expect(recordOneShotSession).toHaveBeenCalledOnce();
    expect(vi.mocked(recordOneShotSession)).toHaveBeenCalledWith(
      root,
      expect.anything(),
      expect.objectContaining({ ok: true }),
      { sessionType: "support", taskId: null },
    );
  });

  it("records a one-shot session even when generation fails", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "boom" });
    const { req, res } = makeReqRes({ text: "Error case" });
    await generateBugReport(ctx, req, res, {});
    expect(recordOneShotSession).toHaveBeenCalledOnce();
  });

  it("redacts user text before sending to PM agent", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "## Title\nX\n\nBody." });
    const { req, res } = makeReqRes({
      text: "My key is sk-proj-abcdefghijklmnopqrstuvwxyz0123456789",
    });
    await generateBugReport(ctx, req, res, {});
    const prompt = vi.mocked(runPrompt).mock.calls[0][1] as string;
    expect(prompt).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789");
    expect(prompt).toContain("[redacted]");
  });

  it("uses the feature-request structure when requested", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "## Title\nCompare task runs" });
    const { req, res } = makeReqRes({
      text: "I need to compare two task runs.",
      type: "feature",
    });
    await generateBugReport(ctx, req, res, {});
    const prompt = vi.mocked(runPrompt).mock.calls[0][1] as string;
    expect(prompt).toContain("feature request");
    expect(prompt).toContain("## Problem to Solve");
    expect(prompt).not.toContain("## Steps to Reproduce");
  });

  it("uses first line as fallback title when no title heading found", async () => {
    vi.mocked(resolvePmAgent).mockReturnValue({ id: "pm", name: "PM", enabled: true } as any);
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: "Build is broken\n\nNo heading here.",
    });
    const { req, res, capture } = makeReqRes({ text: "Build is broken" });
    await generateBugReport(ctx, req, res, {});
    const body = capture.body as { ok: boolean; title: string; body: string };
    expect(body.title).toBe("Build is broken");
  });
});
