/**
 * POST /api/stories/freeform (#0486): create-only story definitions gated on
 * `[stories] enabled`.
 */
import { describe, expect, it } from "vitest";
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { createFreeformStory } from "../../server/routes/stories";
import { listStoryDefinitions } from "../../core/story-definition-files";

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
    stories: { enabled: true },
  };
}

function makeReqRes(body: Record<string, unknown>): {
  req: IncomingMessage;
  res: ServerResponse;
  capture: { status: number; body: unknown };
} {
  const capture = { status: 0, body: undefined as unknown };
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    },
  }) as unknown as IncomingMessage;
  req.headers = { "content-type": "application/json" };
  req.method = "POST";
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  }) as unknown as ServerResponse;
  (res as { writeHead: (s: number) => void }).writeHead = (status: number) => {
    capture.status = status;
    return res;
  };
  (res as { end: (c?: string | Buffer) => void }).end = (chunk?: string | Buffer) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    capture.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return res;
  };
  return { req, res, capture };
}

describe("POST /api/stories/freeform", () => {
  it("rejects when stories are disabled", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-api-off-"));
    try {
      const cfg = { ...config(root), stories: { enabled: false } };
      const { req, res, capture } = makeReqRes({ description: "x" });
      await createFreeformStory({ config: cfg, emitEvent: () => {} } as never, req, res, {});
      expect(capture.status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates a definition without PM when none is configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-api-"));
    try {
      const cfg = config(root);
      const { req, res, capture } = makeReqRes({
        description: "Launch checklist.",
        name: "Launch checklist",
      });
      await createFreeformStory({ config: cfg, emitEvent: () => {} } as never, req, res, {});
      expect(capture.status).toBe(201);
      expect(listStoryDefinitions(cfg)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
