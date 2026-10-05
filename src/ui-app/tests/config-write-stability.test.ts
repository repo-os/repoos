/**
 * Config and git hygiene (#0682, field report 2026-10-05 items 8/9): a one-key
 * `PATCH /api/config` must (a) not relocate an unrelated `[[table]]` section —
 * the old writer dropped and re-appended `[[agents]]` at the end of the file,
 * a whole-section diff for a one-line change — and (b) commit `repoos.toml`
 * so the primary branch never sits dirty and blocks the next Move to done.
 */
import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, patchTomlConfig } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitRepo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-cfgwrite-"));
  roots.push(root);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "repoos.toml"), toml);
  git(root, ["add", "repoos.toml"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: any }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: any = {
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string) {
      res.payload = payload;
    },
  };
  const cfg = loadConfig(root);
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  let payload: any = {};
  try {
    payload = JSON.parse(res.payload ?? "{}");
  } catch {
    /* non-JSON body */
  }
  return { status: res.statusCode, payload };
}

/** A toml with a table AFTER the [[agents]] block, so a naive append would move it. */
const REORDERABLE = `defaultStatus = "inbox"

[[agents]]
name = "engineer"
cli = "opencode"
model = "big pickle"
enabled = true

[[check.steps]]
name = "build"
command = "echo build"
`;

describe("patchTomlConfig keeps [[table]] position (#0682)", () => {
  it("rewrites an existing array-of-tables section in place", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cfgstability-"));
    roots.push(root);
    const p = join(root, "repoos.toml");
    writeFileSync(p, REORDERABLE);
    patchTomlConfig(p, {
      agents: [{ name: "engineer", cli: "opencode", model: "big pickle", enabled: false }],
    });
    const out = readFileSync(p, "utf8");
    // The agents block stays ahead of [[check.steps]] — no whole-section move.
    expect(out.indexOf("[[agents]]")).toBeLessThan(out.indexOf("[[check.steps]]"));
    expect(out).toContain("enabled = false");
  });

  it("is idempotent: re-applying the same patch changes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cfgstability-"));
    roots.push(root);
    const p = join(root, "repoos.toml");
    writeFileSync(p, REORDERABLE);
    const agents = [{ name: "engineer", cli: "opencode", model: "big pickle", enabled: false }];
    patchTomlConfig(p, { agents });
    const once = readFileSync(p, "utf8");
    patchTomlConfig(p, { agents });
    expect(readFileSync(p, "utf8")).toBe(once);
  });

  it("still appends a section that has no existing blocks", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cfgstability-"));
    roots.push(root);
    const p = join(root, "repoos.toml");
    writeFileSync(p, 'defaultStatus = "inbox"\n');
    patchTomlConfig(p, { agents: [{ name: "engineer", enabled: true }] });
    expect(readFileSync(p, "utf8")).toContain("[[agents]]");
  });
});

describe("PATCH /api/config commits repoos.toml and preserves order (#0682)", () => {
  it("changes only the patched line, keeps sections in place, and commits", async () => {
    const root = gitRepo(REORDERABLE);
    const before = readFileSync(join(root, "repoos.toml"), "utf8");

    const res = await patch(root, { maxActiveTasks: "2" });
    expect(res.status).toBe(200);

    const after = readFileSync(join(root, "repoos.toml"), "utf8");
    // One line changed; the sections keep their relative order.
    expect(after).toContain("maxActiveTasks = 2");
    expect(after.indexOf("[[agents]]")).toBeLessThan(after.indexOf("[[check.steps]]"));
    // The agents block is byte-identical to before — no whole-section churn.
    const agentsBlockBefore = before.slice(
      before.indexOf("[[agents]]"),
      before.indexOf("[[check.steps]]"),
    );
    const agentsBlockAfter = after.slice(
      after.indexOf("[[agents]]"),
      after.indexOf("[[check.steps]]"),
    );
    expect(agentsBlockAfter).toBe(agentsBlockBefore);

    // The config write is committed: main is clean and the commit names config.
    expect(git(root, ["status", "--porcelain"])).toBe("");
    const log = git(root, ["log", "--oneline", "-1"]);
    expect(log).toContain("repoos.toml");
  });

  it("does not create a commit for a no-op save", async () => {
    const root = gitRepo(REORDERABLE);
    const headBefore = git(root, ["rev-parse", "HEAD"]);
    const res = await patch(root, { maxActiveTasks: "3" });
    expect(res.status).toBe(200);
    // Adding the key is a real change, so it commits.
    expect(git(root, ["rev-parse", "HEAD"])).not.toBe(headBefore);

    const headAfter = git(root, ["rev-parse", "HEAD"]);
    const noop = await patch(root, { maxActiveTasks: "3" });
    expect(noop.status).toBe(200);
    // Repeating the same value writes nothing new — no second commit.
    expect(git(root, ["rev-parse", "HEAD"])).toBe(headAfter);
  });
});
