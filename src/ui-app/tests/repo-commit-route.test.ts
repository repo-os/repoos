import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { Readable } from "node:stream";
import { commitRepoRoot } from "../../server/routes/repo-log.js";

let repo: string;
const sh = (cmd: string): string => execSync(cmd, { cwd: repo }).toString();

/** Run the handler with a fake request/response and return status + body. */
async function call(
  body: unknown,
  opts: { closingOut?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  let status = 0;
  let payload = "";
  const res = {
    writeHead: (s: number) => void (status = s),
    end: (p: string) => void (payload = p),
  };
  const ctx = {
    config: { root: repo },
    closeOutLock: { closingOut: () => opts.closingOut ?? false },
    jobCoordinator: { peekNext: () => null },
  };
  await (commitRepoRoot as unknown as (...a: unknown[]) => Promise<void>)(ctx, req, res, {});
  return { status, body: JSON.parse(payload) };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "repoos-commit-"));
  sh("git init -q -b main");
  sh('git config user.email "t@example.com"');
  sh('git config user.name "T"');
  writeFileSync(join(repo, "a.txt"), "one\n");
  sh("git add -A && git commit -q -m init");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("POST /api/repo/commit", () => {
  it("commits every change, including untracked files, on the current branch", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    writeFileSync(join(repo, "new.txt"), "new\n");
    const r = await call({ message: "  my change  " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, branch: "main", files: 2 });
    expect(sh("git status --porcelain")).toBe("");
    expect(sh("git log -1 --format=%s").trim()).toBe("my change");
  });

  it("commits on a non-main branch", async () => {
    sh("git checkout -q -b topic");
    writeFileSync(join(repo, "a.txt"), "two\n");
    expect((await call({ message: "x" })).body).toMatchObject({ ok: true, branch: "topic" });
  });

  it("falls back to a default message when none is given", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    expect((await call({ message: "   " })).status).toBe(200);
    expect(sh("git log -1 --format=%s").trim()).toBe("chore: commit uncommitted changes");
    writeFileSync(join(repo, "a.txt"), "three\n");
    expect((await call({})).status).toBe(200);
  });

  it("refuses when there is nothing to commit", async () => {
    expect((await call({ message: "x" })).status).toBe(409);
  });

  it("refuses while a close-out owns the checkout", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    expect((await call({ message: "x" }, { closingOut: true })).status).toBe(409);
  });

  it("refuses a detached HEAD", async () => {
    sh("git checkout -q --detach");
    writeFileSync(join(repo, "a.txt"), "two\n");
    const r = await call({ message: "x" });
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toContain("detached");
  });

  it("returns a rejecting hook's output", async () => {
    mkdirSync(join(repo, ".git", "hooks"), { recursive: true });
    const hook = join(repo, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\necho 'format check failed' >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    writeFileSync(join(repo, "a.txt"), "two\n");
    const r = await call({ message: "x" });
    expect(r.status).toBe(422);
    expect(String(r.body.output)).toContain("format check failed");
  });
});
