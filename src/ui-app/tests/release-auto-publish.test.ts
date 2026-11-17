/**
 * Server coverage for #1126: "when the AI release-notes draft is ready,
 * publish it automatically or notify me".
 *
 * These drive the real route handlers and the real git-backed guards against a
 * throwaway repository. Only two things are substituted: the one-shot agent
 * (`runPrompt`) and the release cut itself (`__setReleaseAutoPublishStarterForTests`),
 * so the tests prove the guarded decision path without pushing or tagging.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import {
  __setReleaseAutoPublishStarterForTests,
  cancelReleaseAutoPublish,
  generateReleaseNotes,
  getReleaseAutoPublish,
  resumeReleaseAutoPublish,
  whenNotesRunSettles,
} from "../../server/routes/release.js";
import { collectReleaseCommits } from "../../server/release.js";
import { releaseNotesCacheKey } from "../../server/release-notes-cache.js";
import {
  readReleaseAutoPublish,
  writeReleaseAutoPublish,
  type ReleaseAutoPublishRecord,
} from "../../server/release-auto-publish.js";
import { runPrompt } from "../../server/agents.js";
import { resetDbInstance } from "../../core/db.js";

vi.mock("../../server/agents.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../server/agents.js")>("../../server/agents.js");
  return { ...actual, runPrompt: vi.fn() };
});

const roots: string[] = [];

beforeEach(() => {
  // Never let an unexpectedly successful guard path run a real cut (git,
  // checks, push) in a fixture. Tests that assert the starter install their own.
  __setReleaseAutoPublishStarterForTests(() => {});
});

afterEach(async () => {
  __setReleaseAutoPublishStarterForTests(null);
  vi.mocked(runPrompt).mockReset();
  await whenNotesRunSettles();
  resetDbInstance();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** A clean main branch with one source commit and the runtime dir ignored. */
function config(): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-release-when-ready-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
  // The auto-publish record and notes cache live here; in a real checkout this
  // is gitignored, and the clean-tree guard must see it that way too.
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "src", "app.ts"), "export const app = 1;\n");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "feat: initial app"]);
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    release: { enabled: true, provider: "git-tag", tagPrefix: "v", branch: "main" },
  } as RepoOSConfig;
}

function makeRes(): { capture: { statusCode: number; body: any }; res: unknown } {
  const capture = { statusCode: 0, body: undefined as any };
  const res = {
    writeHead: (status: number) => {
      capture.statusCode = status;
    },
    end: (data?: string) => {
      if (data) capture.body = JSON.parse(data);
    },
  };
  return { capture, res };
}

function makeReq(body: unknown = {}) {
  return {
    headers: { host: "127.0.0.1:7171" },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify(body), "utf8");
    },
  } as unknown as never;
}

function ctx(
  cfg: RepoOSConfig,
  starter?: (ctx: unknown, record: ReleaseAutoPublishRecord) => void,
) {
  if (starter) __setReleaseAutoPublishStarterForTests(starter as never);
  return { config: cfg, emitEvent: () => {} } as unknown as never;
}

async function postNotes(
  cfg: RepoOSConfig,
  body: Record<string, unknown>,
  starter?: (ctx: unknown, record: ReleaseAutoPublishRecord) => void,
): Promise<{ statusCode: number; body: any }> {
  const { capture, res } = makeRes();
  await generateReleaseNotes(ctx(cfg, starter), makeReq(body), res as never, {});
  return capture;
}

function draft(notes = "- Fixed a thing") {
  vi.mocked(runPrompt).mockResolvedValue({
    ok: true,
    output: notes,
    elapsedMs: 5,
    totalTokens: 12,
    costUsd: 0,
  } as never);
}

async function waitForPending(cfg: RepoOSConfig): Promise<ReleaseAutoPublishRecord> {
  await whenNotesRunSettles();
  const record = readReleaseAutoPublish(cfg);
  expect(record, "auto-publish record").toBeTruthy();
  return record!;
}

describe("AI notes: publish automatically or notify me (#1126)", () => {
  it("publishes through the shared guarded starter with the generated notes", async () => {
    const cfg = config();
    const starter = vi.fn();
    draft();
    const post = await postNotes(
      cfg,
      {
        version: "1.2.4",
        confirmTag: "v1.2.4",
        whenReady: "publish",
        knownIssues: "- macOS build is slow",
      },
      starter,
    );
    expect(post.statusCode).toBe(202);

    const record = await waitForPending(cfg);
    expect(record).toMatchObject({
      state: "publishing",
      mode: "publish",
      version: "1.2.4",
      tag: "v1.2.4",
      notes: "- Fixed a thing",
      knownIssues: "- macOS build is slow",
    });
    expect(starter).toHaveBeenCalledTimes(1);
    const started = starter.mock.calls[0]![1] as ReleaseAutoPublishRecord;
    expect(started.version).toBe("1.2.4");
    expect(started.tag).toBe("v1.2.4");
    expect(started.notes).toBe("- Fixed a thing");
  });

  it("notify mode records the draft and never starts a release", async () => {
    const cfg = config();
    const starter = vi.fn();
    draft("## Highlights\n- Notify me");
    const post = await postNotes(cfg, {
      version: "1.2.4",
      whenReady: "notify",
      knownIssues: "",
    });
    expect(post.statusCode).toBe(202);

    const record = await waitForPending(cfg);
    expect(record).toMatchObject({ state: "notified", mode: "notify", tag: "v1.2.4" });
    expect(record.notes).toContain("Notify me");
    expect(starter).not.toHaveBeenCalled();
  });

  it("Cancel stops an automatic publish before it starts", async () => {
    const cfg = config();
    const starter = vi.fn();
    let release!: (value: unknown) => void;
    vi.mocked(runPrompt).mockImplementation(
      () => new Promise((resolve) => (release = resolve as (value: unknown) => void)) as never,
    );

    await postNotes(cfg, { version: "1.2.4", confirmTag: "v1.2.4", whenReady: "publish" });
    expect(readReleaseAutoPublish(cfg)?.state).toBe("waiting");

    const { capture, res } = makeRes();
    await cancelReleaseAutoPublish(ctx(cfg), makeReq(), res as never, {});
    expect(capture.statusCode).toBe(200);
    expect(capture.body.autoPublish.state).toBe("cancelled");

    release({ ok: true, output: "- Fixed a thing", elapsedMs: 5, totalTokens: 12, costUsd: 0 });
    await whenNotesRunSettles();
    expect(readReleaseAutoPublish(cfg)?.state).toBe("cancelled");
    expect(starter).not.toHaveBeenCalled();
  });

  it("a failed draft publishes nothing and records why", async () => {
    const cfg = config();
    const starter = vi.fn();
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "agent timed out" } as never);

    await postNotes(cfg, { version: "1.2.4", confirmTag: "v1.2.4", whenReady: "publish" });
    const record = await waitForPending(cfg);
    expect(record.state).toBe("failed");
    expect(record.error).toContain("agent timed out");
    expect(starter).not.toHaveBeenCalled();
  });

  it("a blocker appearing mid-wait fails closed instead of publishing newer commits", async () => {
    const cfg = config();
    const starter = vi.fn();
    let release!: (value: unknown) => void;
    vi.mocked(runPrompt).mockImplementation(
      () => new Promise((resolve) => (release = resolve as (value: unknown) => void)) as never,
    );

    await postNotes(cfg, { version: "1.2.4", confirmTag: "v1.2.4", whenReady: "publish" });
    // A source commit lands while the agent is still drafting: the notes no
    // longer describe what would ship.
    writeFileSync(join(cfg.root, "src", "app.ts"), "export const app = 2;\n");
    git(cfg.root, ["add", "."]);
    git(cfg.root, ["commit", "-qm", "feat: newer source change"]);

    release({ ok: true, output: "- Fixed a thing", elapsedMs: 5, totalTokens: 12, costUsd: 0 });
    const record = await waitForPending(cfg);
    expect(record.state).toBe("failed");
    expect(record.error).toContain("New commits landed");
    expect(starter).not.toHaveBeenCalled();
  });

  it("a dirty working tree at publish time fails closed", async () => {
    const cfg = config();
    const starter = vi.fn();
    let release!: (value: unknown) => void;
    vi.mocked(runPrompt).mockImplementation(
      () => new Promise((resolve) => (release = resolve as (value: unknown) => void)) as never,
    );

    await postNotes(cfg, { version: "1.2.4", confirmTag: "v1.2.4", whenReady: "publish" });
    writeFileSync(join(cfg.root, "src", "app.ts"), "export const app = 3;\n");

    release({ ok: true, output: "- Fixed a thing", elapsedMs: 5, totalTokens: 12, costUsd: 0 });
    const record = await waitForPending(cfg);
    expect(record.state).toBe("failed");
    expect(record.error).toContain("dirty");
    expect(starter).not.toHaveBeenCalled();
  });

  it("only one automatic publish can be pending at a time", async () => {
    const cfg = config();
    let release!: (value: unknown) => void;
    vi.mocked(runPrompt).mockImplementation(
      () => new Promise((resolve) => (release = resolve as (value: unknown) => void)) as never,
    );

    await postNotes(cfg, { version: "1.2.4", confirmTag: "v1.2.4", whenReady: "publish" });
    const second = await postNotes(cfg, {
      version: "1.2.5",
      confirmTag: "v1.2.5",
      whenReady: "publish",
    });
    // The same in-flight draft is returned rather than creating a second
    // promise; the first tag is still the one that would publish.
    expect(second.statusCode).toBe(202);
    expect(readReleaseAutoPublish(cfg)?.tag).toBe("v1.2.4");

    release({ ok: false, error: "stop" });
    await whenNotesRunSettles();
  });

  it("survives a restart: a cached draft resumes, a lost draft fails closed", async () => {
    const cfg = config();
    const starter = vi.fn();
    const commits = await collectReleaseCommits(cfg);
    const key = releaseNotesCacheKey(commits.relevantShas, commits.sinceTag);
    const at = new Date().toISOString();
    const base: ReleaseAutoPublishRecord = {
      requestedAt: at,
      state: "ready",
      mode: "publish",
      version: "1.2.4",
      tag: "v1.2.4",
      notes: "- Survived the restart",
      knownIssues: null,
      head: commits.head,
      draftKey: key,
      error: null,
      origin: null,
      updatedAt: at,
    };
    writeReleaseAutoPublish(cfg, base);

    await resumeReleaseAutoPublish(ctx(cfg, starter) as never);
    expect(starter).toHaveBeenCalledTimes(1);

    // A draft that never reached the cache cannot be recovered: the in-memory
    // run is gone, so the promise fails closed with a notification reason.
    const lost: ReleaseAutoPublishRecord = {
      ...base,
      requestedAt: new Date(Date.now() + 1000).toISOString(),
      state: "waiting",
      notes: null,
      draftKey: "missing-key",
    };
    writeReleaseAutoPublish(cfg, lost);
    await resumeReleaseAutoPublish(ctx(cfg) as never);
    const record = readReleaseAutoPublish(cfg)!;
    expect(record.state).toBe("failed");
    expect(record.error).toContain("restarted before the AI draft finished");
  });

  it("returns the remembered default for the chooser", async () => {
    const cfg = { ...config(), release: { enabled: true, notesWhenReady: "publish" as const } };
    const { capture, res } = makeRes();
    await getReleaseAutoPublish(ctx(cfg), makeReq(), res as never, {});
    expect(capture.statusCode).toBe(200);
    expect(capture.body).toMatchObject({ autoPublish: null, defaultWhenReady: "publish" });
  });

  it("rejects an automatic publish without the exact confirmed tag", async () => {
    const cfg = config();
    const post = await postNotes(cfg, {
      version: "1.2.4",
      confirmTag: "v9.9.9",
      whenReady: "publish",
    });
    expect(post.statusCode).toBe(400);
    expect(post.body.error).toContain("confirmTag must be v1.2.4");
    expect(readReleaseAutoPublish(cfg)).toBeNull();
  });
});
