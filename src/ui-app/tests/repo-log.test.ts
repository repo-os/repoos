/**
 * Git history helpers + `/api/repo/log` (#0514): machine-format parsing,
 * task-id extraction, input validation, cursor pagination, and rejection of
 * shell-metacharacter branch/path values.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { getRepoBranches, getRepoCommitRoute, getRepoLog } from "../../server/routes/repo-log";
import {
  extractTaskId,
  isValidBranch,
  isValidPathFilter,
  isValidSha,
  listRepoLog,
  parseDecorations,
  parseGitLogOutput,
} from "../../core/repo-log";

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-log-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "hist@example.com"]);
  git(root, ["config", "user.name", "Hist Bot"]);
  return root;
}

function commitFile(root: string, rel: string, contents: string, message: string): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  git(root, ["add", "--", rel]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function makeReq(url: string): IncomingMessage {
  return { url, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: any;
}

function makeRes(): { res: ServerResponse; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined };
  const res = {
    setHeader() {},
    writeHead(code: number) {
      fake.status = code;
    },
    end(p: string) {
      fake.payload = JSON.parse(p);
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function makeCtx(root: string): RouteContext {
  return {
    config: { root, cacheDir: ".repoos" } as RepoOSConfig,
  } as RouteContext;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("git log parsing (#0514)", () => {
  it("extracts a task id from type(NNNN): subjects and ignores other forms", () => {
    expect(extractTaskId("docs(0513): update task")).toBe("0513");
    expect(extractTaskId("feat(0514): add history")).toBe("0514");
    expect(extractTaskId("fix(web): button")).toBeNull();
    expect(extractTaskId("WIP on main")).toBeNull();
  });

  it("parses NUL-terminated unit-separated records including a multiline body", () => {
    const rec =
      [
        "abc123def",
        "abc123d",
        "docs(0513): update task",
        "Ada Lovelace",
        "ada@example.com",
        "2026-09-26T12:00:00+00:00",
        "HEAD -> main, tag: v1.2.3",
        "parentsha",
        "Line one.\nLine two.",
      ].join("\x1f") + "\0";
    const [c] = parseGitLogOutput(rec);
    expect(c?.sha).toBe("abc123def");
    expect(c?.shortSha).toBe("abc123d");
    expect(c?.subject).toBe("docs(0513): update task");
    expect(c?.taskId).toBe("0513");
    expect(c?.body).toBe("Line one.\nLine two.");
    expect(c?.refs).toEqual(["HEAD", "main", "v1.2.3"]);
    expect(c?.parents).toEqual(["parentsha"]);
  });

  it("strips the newline git inserts before the next record", () => {
    const rec =
      ["aaaaaaaa", "aaaaaaa", "one", "A", "a@b.c", "2026-01-01T00:00:00Z", "", "", ""].join(
        "\x1f",
      ) +
      "\0\n" +
      ["bbbbbbbb", "bbbbbbb", "two", "A", "a@b.c", "2026-01-01T00:00:00Z", "", "", ""].join(
        "\x1f",
      ) +
      "\0";
    const parsed = parseGitLogOutput(rec);
    expect(parsed.map((c) => c.sha)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  });

  it("parses decoration tokens", () => {
    expect(parseDecorations("HEAD -> main, origin/main, tag: v0.1.0")).toEqual([
      "HEAD",
      "main",
      "origin/main",
      "v0.1.0",
    ]);
  });

  it("rejects unsafe sha, branch, and path inputs", () => {
    expect(isValidSha("abc")).toBe(false);
    expect(isValidSha("deadbeef")).toBe(true);
    expect(isValidSha("deadbeef;rm")).toBe(false);
    expect(isValidBranch("feat/add-history")).toBe(true);
    expect(isValidBranch("main;rm -rf /")).toBe(false);
    expect(isValidBranch("-evil")).toBe(false);
    expect(isValidBranch("foo..bar")).toBe(false);
    expect(isValidPathFilter("src/ui-app")).toBe(true);
    expect(isValidPathFilter("../etc/passwd")).toBe(false);
    expect(isValidPathFilter("/etc/passwd")).toBe(false);
  });
});

describe("listRepoLog pagination (#0514)", () => {
  it("returns a capped page and a before cursor for the next page", async () => {
    const root = initRepo();
    dirs.push(root);
    for (let i = 0; i < 5; i++) {
      commitFile(root, "f.txt", `n${i}\n`, `docs(0514): commit ${i}`);
    }
    const first = await listRepoLog(root, { branch: "main", limit: 2 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.commits).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(first.commits[0]?.subject).toContain("commit 4");

    const second = await listRepoLog(root, {
      branch: "main",
      limit: 2,
      before: first.nextCursor!,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.commits).toHaveLength(2);
    expect(second.commits[0]?.sha).not.toBe(first.commits[0]?.sha);
    expect(second.commits.map((c) => c.sha)).not.toContain(first.commits[0]?.sha);
  });

  it("filters by path", async () => {
    const root = initRepo();
    dirs.push(root);
    commitFile(root, "keep.txt", "k\n", "feat(0514): keep");
    commitFile(root, "skip.txt", "s\n", "feat(0514): skip");
    const page = await listRepoLog(root, { branch: "main", path: "keep.txt", limit: 20 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.commits.every((c) => c.subject.includes("keep"))).toBe(true);
    expect(page.commits.some((c) => c.subject.includes("skip"))).toBe(false);
  });
});

describe("GET /api/repo/log (#0514)", () => {
  it("lists commits from a real repo and refuses a metacharacter branch", async () => {
    const root = initRepo();
    dirs.push(root);
    commitFile(root, "a.txt", "a\n", "docs(0514): seed");
    const ctx = makeCtx(root);

    const ok = makeRes();
    await getRepoLog(ctx, makeReq("/api/repo/log?limit=10"), ok.res, {});
    expect(ok.fake.status).toBe(200);
    expect(ok.fake.payload.ok).toBe(true);
    expect(ok.fake.payload.commits[0].taskId).toBe("0514");
    expect(ok.fake.payload.commits[0].subject).toContain("seed");

    const bad = makeRes();
    await getRepoLog(ctx, makeReq("/api/repo/log?branch=main%3Brm"), bad.res, {});
    expect(bad.fake.status).toBe(400);
    expect(bad.fake.payload.ok).toBe(false);
  });

  it("returns a readable not-git payload for a plain directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-nongit-"));
    dirs.push(root);
    const ctx = makeCtx(root);
    const { res, fake } = makeRes();
    await getRepoLog(ctx, makeReq("/api/repo/log"), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload.ok).toBe(false);
    expect(fake.payload.code).toBe("not-git");
  });

  it("returns commit files for a sha and 400 for an invalid sha", async () => {
    const root = initRepo();
    dirs.push(root);
    const sha = commitFile(root, "src/x.ts", "export const n = 1;\n", "feat(0514): file");
    const ctx = makeCtx(root);
    const ok = makeRes();
    await getRepoCommitRoute(ctx, makeReq(`/api/repo/commits/${sha}`), ok.res, { param1: sha });
    expect(ok.fake.status).toBe(200);
    expect(ok.fake.payload.files.some((f: { path: string }) => f.path === "src/x.ts")).toBe(true);
    expect(ok.fake.payload.patch).toContain("export const n");

    const bad = makeRes();
    await getRepoCommitRoute(ctx, makeReq("/api/repo/commits/nope"), bad.res, { param1: "nope" });
    expect(bad.fake.status).toBe(400);

    const branches = makeRes();
    await getRepoBranches(ctx, makeReq("/api/repo/branches"), branches.res, {});
    expect(branches.fake.payload.branches).toContain("main");
    expect(branches.fake.payload.defaultBranch).toBe("main");
  });
});
