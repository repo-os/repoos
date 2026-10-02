/**
 * Task-drawer shot management routes (#0627), exercised directly against a
 * minimal fake RouteContext (no full server boot):
 *
 *   - POST /api/tasks/:id/shots dispatches on the body shape: captured bytes
 *     (`data`) keep the CLI's upload path; a declared entry without bytes is
 *     validated (shared `parseShotEntry` rules), captured server-side and
 *     appended to `## Shots` with an activity note,
 *   - a structured capture error becomes a 409/400 WITHOUT writing the task
 *     file — no declared-but-never-captured entry,
 *   - DELETE removes the PNG, its manifest entry, and the matching `## Shots`
 *     declaration; legacy untagged shots delete the same way,
 *   - a delete with no matching declaration leaves the section untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRepoOS } from "../../core/repoos";
import { loadConfig } from "../../core/config.js";
import { declaredShotsSectionContent } from "../../core/shot-plan.js";
import { localShotStore } from "../../server/shots.js";
import { patchTaskFile } from "../../server/write.js";
import type { Task } from "../../core/types.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const roots: string[] = [];
let root: string;
let repoos: ReturnType<typeof createRepoOS>;
let task: Task;

vi.mock("../../server/shot-capture.js", () => ({
  // Only what routes/tasks.ts imports from this module.
  captureDeclaredShot: vi.fn(),
}));

import { captureDeclaredShot } from "../../server/shot-capture.js";
import { deleteTaskShot, uploadTaskShot } from "../../server/routes/tasks.js";

const mockedCapture = vi.mocked(captureDeclaredShot);

const SHOT_RESULT = {
  shot: {
    name: "default-1.png",
    target: "default",
    route: "/",
    label: "Task drawer open",
    provenance: "declared: Task drawer open",
    path: "work/.attachments/0001/shots/default-1.png",
    url: "/api/tasks/0001/shots/default-1.png",
    size: 3,
    mime: "image/png",
    capturedAt: new Date().toISOString(),
  },
  warnings: [],
};

function resCapture() {
  const capture = { statusCode: 0, body: undefined as unknown };
  const res = {
    writeHead: (status: number) => {
      capture.statusCode = status;
    },
    end: (data?: unknown) => {
      if (data) capture.body = JSON.parse(String(data));
    },
  };
  return { capture, res: res as unknown as ServerResponse };
}

const emptyReq = { [Symbol.asyncIterator]: async function* () {} } as unknown as IncomingMessage;

/** A request whose body is the JSON `entry` (the modal's POST shape). */
function bodyReq(entry: unknown): IncomingMessage {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify(entry), "utf8");
    },
  } as unknown as IncomingMessage;
}

function makeCtx() {
  const capturedTask = task;
  return {
    config: repoos.config,
    index: {
      getTask: (id: string) => (id === capturedTask.id ? capturedTask : null),
      applyFileChange: vi.fn(),
    },
    previews: {},
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repoos-shots-api-"));
  roots.push(root);
  // A default preview command, so a declared shot's target resolves — the
  // same bare `[preview] command` every simple repo carries.
  writeFileSync(join(root, "repoos.toml"), '[preview]\ncommand = "echo preview"\n');
  repoos = createRepoOS(root);
  task = repoos.createTask({ title: "Drawer shots" });
  // Active with a branch and one declared shot — the state the drawer offers
  // add/delete in.
  const updated = repoos.updateTask(task.id, { status: "active", branch: "feat/x" });
  task = updated;
});

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  mockedCapture.mockReset();
});

describe("POST /api/tasks/:id/shots — declare and capture (#0627)", () => {
  it("captures the entry, appends it to ## Shots and notes the activity", async () => {
    mockedCapture.mockResolvedValue(SHOT_RESULT as never);
    const ctx = makeCtx();
    const { capture, res } = resCapture();
    await uploadTaskShot(
      ctx as never,
      bodyReq({ target: "default", label: "Task drawer open" }),
      res,
      { param1: task.id },
    );
    expect(capture.statusCode).toBe(201);
    expect((capture.body as { shot: unknown }).shot).toEqual(SHOT_RESULT.shot);
    // The entry is declared for the next handoff capture...
    const onDisk = readFileSync(task.absPath, "utf8");
    expect(onDisk).toContain('"label": "Task drawer open"');
    expect(onDisk).toContain("## Shots");
    // ...and the activity log says what happened.
    expect(onDisk).toContain("shot added: default – Task drawer open");
    // Capture received the resolved entry.
    expect(mockedCapture.mock.calls[0]?.[3]).toMatchObject({
      target: "default",
      route: "/",
      label: "Task drawer open",
    });
  });

  it("rejects an invalid entry with the shared validator's message, before any capture", async () => {
    const ctx = makeCtx();
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({ target: "default", steps: [{ click: 5 }] }), "utf8");
      },
    } as unknown as IncomingMessage;
    const { capture, res } = resCapture();
    await uploadTaskShot(ctx as never, req, res, { param1: task.id });
    expect(capture.statusCode).toBe(400);
    expect((capture.body as { error: string }).error).toContain('"click" expects a CSS selector');
    // Nothing captured, nothing written.
    expect(mockedCapture).not.toHaveBeenCalled();
    expect(readFileSync(task.absPath, "utf8")).not.toContain("## Shots");
  });

  it("answers a busy preview slot with 409 + busy, and does NOT write the declaration", async () => {
    mockedCapture.mockResolvedValue({
      error: "the one preview slot is busy: task #0999 has a preview running",
      busy: true,
    } as never);
    const ctx = makeCtx();
    const { capture, res } = resCapture();
    await uploadTaskShot(ctx as never, bodyReq({ target: "default" }), res, { param1: task.id });
    expect(capture.statusCode).toBe(409);
    expect(capture.body).toMatchObject({ error: expect.stringContaining("busy"), busy: true });
    expect(readFileSync(task.absPath, "utf8")).not.toContain("## Shots");
  });

  it("keeps a CLI byte-upload on the legacy path untouched", async () => {
    const ctx = makeCtx();
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(
          JSON.stringify({ target: "default", label: "CLI shot", data: PNG_1PX }),
          "utf8",
        );
      },
    } as unknown as IncomingMessage;
    const { capture, res } = resCapture();
    await uploadTaskShot(ctx as never, req, res, { param1: task.id });
    expect(capture.statusCode).toBe(201);
    expect(mockedCapture).not.toHaveBeenCalled();
    const stored = localShotStore(repoos.config, task.id).list();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.label).toBe("CLI shot");
  });
});

describe("DELETE /api/tasks/:id/shots/:name — delete + declaration sync (#0627)", () => {
  function seedShot(label: string | undefined, withOrigin = false) {
    return localShotStore(repoos.config, task.id).save({
      target: "default",
      route: "/",
      ...(label ? { label } : {}),
      ...(withOrigin ? { origin: "auto" as const, provenance: "auto: matched src/**" } : {}),
      data: PNG_1PX,
    });
  }

  it("removes the file, manifest entry and the matching declaration, with a note", async () => {
    const saved = seedShot("Task drawer open");
    if ("error" in saved) throw new Error("seed failed");
    const updated = repoos.updateTask(task.id, {});
    task = updated;
    // Declare the shot so the delete has a matching entry to sync.
    const withSection = patchSection(
      declaredShotsSectionContent([{ target: "default", route: "/", label: "Task drawer open" }]),
    );
    task = withSection;
    const dir = join(root, repoos.config.workDir, ".attachments", task.id, "shots");
    expect(existsSync(join(dir, saved.name))).toBe(true);

    const ctx = makeCtx();
    const { capture, res } = resCapture();
    await deleteTaskShot(ctx as never, emptyReq, res, { param1: task.id, param2: saved.name });

    expect(capture.statusCode).toBe(200);
    expect(capture.body).toMatchObject({ ok: true, declarationsRemoved: 1 });
    expect(existsSync(join(dir, saved.name))).toBe(false);
    expect(localShotStore(repoos.config, task.id).list()).toEqual([]);
    const onDisk = readFileSync(task.absPath, "utf8");
    // The declaration is gone from ## Shots (the note mentioning the label is
    // exactly where the label SHOULD still appear).
    expect(onDisk).toContain("```json\n[]");
    expect(onDisk).not.toContain('"label"');
    expect(onDisk).toContain("shot removed: Task drawer open");
  });

  it("deletes a legacy untagged shot and removes nothing from ## Shots when nothing matches", async () => {
    const saved = seedShot(undefined);
    if ("error" in saved) throw new Error("seed failed");
    task = patchSection(declaredShotsSectionContent([{ target: "web", route: "/x" }]));

    const ctx = makeCtx();
    const { capture, res } = resCapture();
    await deleteTaskShot(ctx as never, emptyReq, res, { param1: task.id, param2: saved.name });

    expect(capture.statusCode).toBe(200);
    expect(capture.body).toMatchObject({ ok: true, declarationsRemoved: 0 });
    // The unrelated declaration survives.
    expect(readFileSync(task.absPath, "utf8")).toContain('"target": "web"');
  });

  it("404s for an unknown shot name", async () => {
    const { capture, res } = resCapture();
    await deleteTaskShot(makeCtx() as never, emptyReq, res, {
      param1: task.id,
      param2: "missing.png",
    });
    expect(capture.statusCode).toBe(404);
  });
});

/** Write a `## Shots` section onto the task (same path the route uses). */
function patchSection(content: string): Task {
  return patchTaskFile(repoos.config, task.absPath, {
    section: { heading: "Shots", content },
  });
}
