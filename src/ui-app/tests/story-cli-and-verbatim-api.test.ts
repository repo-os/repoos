/**
 * #0696 — stories without the PM.
 *
 * Two surfaces, one goal: an agent or script can write a story definition
 * exactly as given, with no PM rewriting the body and no task tagging.
 *   - `POST /api/stories` (and `POST /api/stories/freeform` with `pm: false`)
 *   - `PATCH /api/stories/:key` — rename/rewrite, keeping the stable number
 *   - the `repoos story new|list|show|update` CLI
 *
 * The PM flesh-out is mocked everywhere so "no PM run was started" is a hard
 * assertion, not an inference from timing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import type { RepoOSConfig } from "../../core/types";

const { fleshOutStory } = vi.hoisted(() => ({
  fleshOutStory: vi.fn(async (_deps: unknown, _run: unknown) => {}),
}));
vi.mock("../../server/story-pm.js", () => ({
  fleshOutStory: (deps: unknown, run: unknown) => fleshOutStory(deps, run),
}));

// A PM agent IS configured: if any create path let the PM run, it would.
vi.mock("../../server/agents.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/agents.js")>()),
  resolvePmAgent: vi.fn(() => ({
    name: "pm",
    cli: "opencode",
    enabled: true,
  })),
}));

import {
  createStoryDefinition,
  createFreeformStory,
  updateStoryDefinition,
} from "../../server/routes/stories";
import { listStoryDefinitions } from "../../core/story-definition-files";
import { cmdStoryNew, cmdStoryList, cmdStoryShow, cmdStoryUpdate } from "../../commands/stories";

// ---- shared fixtures ----

function apiConfig(root: string): RepoOSConfig {
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

function makeReqRes(
  body: Record<string, unknown>,
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
  (res as { writeHead: (s: number) => void }).writeHead = (status: number) => {
    capture.status = status;
    return res;
  };
  (res as { end: (c?: string | Buffer) => void }).end = (chunk?: string | Buffer) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    capture.body = text ? JSON.parse(text) : undefined;
    return res;
  };
  return { req, res, capture };
}

/** A temp git repo with a `stories/` dir and a task file, board-rooted for CLI. */
function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-story-cli-"));
  const git = (args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "Test"]);
  mkdirSync(join(root, "stories"), { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "repoos.toml"), "[stories]\nenabled = true\n");
  writeFileSync(
    join(root, "work", "0001-member.md"),
    `---\nid: "0001"\ntitle: A member task\ntype: feature\nstatus: ready\nstory: Launch checklist\n---\n`,
  );
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

async function withCwd<T>(dir: string, fn: () => T): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

// ---- API: verbatim create ----

describe("POST /api/stories — verbatim create, no PM (#0696)", () => {
  it("writes and commits the definition and starts no PM run", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-post-"));
    try {
      fleshOutStory.mockClear();
      const cfg = apiConfig(root);
      const { req, res, capture } = makeReqRes({
        name: "Launch checklist",
        body: "Exactly this text.\n",
      });
      await createStoryDefinition({ config: cfg, emitEvent: () => {} } as never, req, res, {});

      expect(capture.status).toBe(201);
      const body = capture.body as { ok: boolean; definition: { number: string; path: string } };
      expect(body.ok).toBe(true);
      expect(body.definition.number).toBe("0001");
      expect(existsSync(join(root, body.definition.path))).toBe(true);
      expect(readFileSync(join(root, body.definition.path), "utf8")).toContain(
        "Exactly this text.",
      );
      // The hard assertion: no flesh-out run.
      expect(fleshOutStory).not.toHaveBeenCalled();
      // Never a `pending` field on the verbatim path.
      expect((capture.body as { pending?: boolean }).pending).toBeUndefined();
    } finally {
      rmFixture(root);
    }
  });

  it("returns 409 on a name collision", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-dup-"));
    try {
      const cfg = apiConfig(root);
      const first = makeReqRes({ name: "Dupe", body: "one" });
      await createStoryDefinition(
        { config: cfg, emitEvent: () => {} } as never,
        first.req,
        first.res,
        {},
      );
      const second = makeReqRes({ name: "Dupe", body: "two" });
      await createStoryDefinition(
        { config: cfg, emitEvent: () => {} } as never,
        second.req,
        second.res,
        {},
      );
      expect(second.capture.status).toBe(409);
      expect(listStoryDefinitions(cfg)).toHaveLength(1);
    } finally {
      rmFixture(root);
    }
  });

  it("freeform with pm:false is verbatim too", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-pmoff-"));
    try {
      fleshOutStory.mockClear();
      const cfg = apiConfig(root);
      const { req, res, capture } = makeReqRes({
        name: "No PM slice",
        description: "as written",
        pm: false,
      });
      await createFreeformStory({ config: cfg, emitEvent: () => {} } as never, req, res, {});
      expect(capture.status).toBe(201);
      expect((capture.body as { pending: boolean }).pending).toBe(false);
      expect(fleshOutStory).not.toHaveBeenCalled();
    } finally {
      rmFixture(root);
    }
  });
});

// ---- API: update keeps the number ----

describe("PATCH /api/stories/:key — update without the PM (#0696)", () => {
  it("rewrites name and body, keeping the stable number", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-patch-"));
    try {
      const cfg = apiConfig(root);
      const created = makeReqRes({ name: "Old name", body: "old body" });
      await createStoryDefinition(
        { config: cfg, emitEvent: () => {} } as never,
        created.req,
        created.res,
        {},
      );
      const number = (created.capture.body as { definition: { number: string } }).definition.number;

      const patched = makeReqRes({ name: "New name", body: "new body" }, "PATCH");
      await updateStoryDefinition(
        { config: cfg, emitEvent: () => {} } as never,
        patched.req,
        patched.res,
        { param1: "old name" },
      );
      expect(patched.capture.status).toBe(200);
      const def = (
        patched.capture.body as { definition: { number: string; name: string; path: string } }
      ).definition;
      expect(def.name).toBe("New name");
      expect(def.number).toBe(number);
      expect(readFileSync(join(root, def.path), "utf8")).toContain("new body");
    } finally {
      rmFixture(root);
    }
  });

  it("404s an unknown story", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-patch404-"));
    try {
      const cfg = apiConfig(root);
      const { req, res, capture } = makeReqRes({ body: "x" }, "PATCH");
      await updateStoryDefinition({ config: cfg, emitEvent: () => {} } as never, req, res, {
        param1: "nope",
      });
      expect(capture.status).toBe(404);
    } finally {
      rmFixture(root);
    }
  });
});

// ---- CLI round-trip ----

describe("repoos story CLI round-trip (#0696)", () => {
  // `process.exitCode` is process-global and leaks across tests (and across
  // test files sharing a worker). The CLI's success paths leave it alone, so a
  // leftover `1` from another test would fail the "still 0" assertions below
  // only on a runner whose ordering differed — exactly the kind of
  // machine-fingerprint flake this suite must not have. Start every test clean.
  beforeEach(() => {
    process.exitCode = 0;
  });

  it("new → list → show → update, committing and keeping the number", async () => {
    const { root, clean } = makeRepo();
    const prevExit = process.exitCode;
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(a.join(" "));
    });
    try {
      process.exitCode = 0;
      await withCwd(root, () =>
        cmdStoryNew(["Launch checklist", "--body", "Scope and non-goals."]),
      );
      expect(process.exitCode ?? 0).toBe(0);
      const dir = readdirSync(join(root, "stories"));
      expect(dir).toEqual(["launch-checklist.md"]);
      // Committed, not left dirty.
      const status = execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(status.trim()).toBe("");

      logs.length = 0;
      await withCwd(root, () => cmdStoryList([]));
      expect(logs.join("\n")).toContain("Launch checklist");

      logs.length = 0;
      await withCwd(root, () => cmdStoryShow(["0001"]));
      const showOut = logs.join("\n");
      expect(showOut).toContain("A member task");
      expect(showOut).toContain("ready");

      logs.length = 0;
      await withCwd(root, () => cmdStoryUpdate(["0001", "--body", "Rewritten scope."]));
      const updated = readFileSync(join(root, "stories", "launch-checklist.md"), "utf8");
      expect(updated).toContain("Rewritten scope.");
      expect(updated).toMatch(/^number: "0001"$/m);
      // Still clean after the update commit.
      const status2 = execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(status2.trim()).toBe("");
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("update --name renames the file but keeps the number", async () => {
    const { root, clean } = makeRepo();
    const prevExit = process.exitCode;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await withCwd(root, () => cmdStoryNew(["Original", "--body", "body"]));
      await withCwd(root, () => cmdStoryUpdate(["0001", "--name", "Renamed story"]));
      const files = readdirSync(join(root, "stories"));
      expect(files).toEqual(["renamed-story.md"]);
      const content = readFileSync(join(root, "stories", "renamed-story.md"), "utf8");
      expect(content).toMatch(/^name: "?Renamed story"?$/m);
      expect(content).toMatch(/^number: "0001"$/m);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("new rejects a duplicate name with a non-zero exit", async () => {
    const { root, clean } = makeRepo();
    const prevExit = process.exitCode;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await withCwd(root, () => cmdStoryNew(["Same", "--body", "one"]));
      process.exitCode = 0;
      await withCwd(root, () => cmdStoryNew(["Same", "--body", "two"]));
      expect(process.exitCode).toBe(1);
      expect(readdirSync(join(root, "stories"))).toHaveLength(1);
    } finally {
      errSpy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });

  it("show works for a tag-only story (no definition file)", async () => {
    const { root, clean } = makeRepo();
    const prevExit = process.exitCode;
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(a.join(" "));
    });
    try {
      process.exitCode = 0;
      await withCwd(root, () => cmdStoryShow(["Launch checklist"]));
      expect(process.exitCode ?? 0).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("tag-only");
      expect(out).toContain("A member task");
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
      clean();
    }
  });
});
