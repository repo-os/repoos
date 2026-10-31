/**
 * POST /api/stories/:key/attachments — create-time screenshot uploads must
 * merge into the on-disk story body, not a stale in-memory snapshot (PM flesh-out
 * can land between the lookup and the write).
 */
import { describe, expect, it } from "vitest";
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { writeStoryDefinition } from "../../core/story-definition-files";
import { uploadStoryScreenshot } from "../../server/routes/stories";
import { commitTaskFile } from "../../core/git.js";
import { execSync } from "node:child_process";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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

function initGit(root: string): void {
  execSync("git init -b main", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "t@example.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "t"', { cwd: root, stdio: "ignore" });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "work", ".gitkeep"), "");
  execSync("git add work && git commit -m init", { cwd: root, stdio: "ignore" });
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

describe("POST /api/stories/:key/attachments", () => {
  it("merges into the latest on-disk body after PM flesh-out", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-shot-upload-"));
    try {
      initGit(root);
      const cfg = config(root);
      const placeholder = writeStoryDefinition(cfg, {
        name: "Mobile slice",
        body: "Placeholder only.",
        createdBy: "hello@repoos.org",
      });
      commitTaskFile(
        root,
        join(root, placeholder.path),
        `docs(stories): add "${placeholder.name}"`,
      );
      // Simulate fleshOutStory landing while an upload is in flight.
      writeFileSync(
        join(root, placeholder.path),
        `---
name: Mobile slice
---
## Problem

Ship native.`,
      );
      const { req, res, capture } = makeReqRes({
        name: "ui.png",
        mime: "image/png",
        data: PNG_1PX,
      });
      await uploadStoryScreenshot({ config: cfg, emitEvent: () => {} } as never, req, res, {
        param1: placeholder.key,
      });
      expect(capture.status).toBe(201);
      const onDisk = readFileSync(join(root, placeholder.path), "utf8");
      expect(onDisk).toContain("Ship native.");
      expect(onDisk).not.toContain("Placeholder only.");
      expect(onDisk).toContain("## Screenshots");
      expect(onDisk).toContain("/attachments/att_");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("New Story panel exposes the same screenshot picker affordances as New Task", () => {
    const src = readFileSync(resolve("src/ui-app/src/components/NewStoryPanel.vue"), "utf8");
    expect(src).toContain("shot-label-row");
    expect(src).toContain('class="field-info"');
    expect(src).toContain('@open-shot="openPendingViewer"');
    expect(src).toContain("ScreenshotViewer");
  });
});
