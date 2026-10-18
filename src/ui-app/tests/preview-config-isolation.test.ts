/**
 * Preview-child Settings saves must not dirty the worktree repoos.toml (#0828).
 */
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";
import { loadConfigAfterServerWrite } from "../../server/preview-config-isolation.js";

const roots: string[] = [];
let priorPreviewChild: string | undefined;

beforeEach(() => {
  priorPreviewChild = process.env.REPOOS_PREVIEW_CHILD;
  process.env.REPOOS_PREVIEW_CHILD = "1";
});

afterEach(() => {
  if (priorPreviewChild === undefined) delete process.env.REPOOS_PREVIEW_CHILD;
  else process.env.REPOOS_PREVIEW_CHILD = priorPreviewChild;
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitRepo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-previewcfg-"));
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
): Promise<{ status: number; payload: unknown }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: {
    statusCode?: number;
    payload?: string;
    writeHead: (code: number) => unknown;
    end: (payload: string) => void;
  } = {
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
  let payload: unknown = {};
  try {
    payload = JSON.parse(res.payload ?? "{}");
  } catch {
    /* non-JSON body */
  }
  return { status: res.statusCode ?? 0, payload };
}

describe("preview child config isolation (#0828)", () => {
  it("PATCH applies in memory without modifying worktree repoos.toml", async () => {
    const root = gitRepo('activityAnimationStyle = "orbital-pixel"\n');
    const tracked = join(root, "repoos.toml");
    const before = readFileSync(tracked, "utf8");

    const { status } = await patch(root, { activityAnimationStyle: "bird-quick-trail" });
    expect(status).toBe(200);
    expect(readFileSync(tracked, "utf8")).toBe(before);

    const cfg = loadConfigAfterServerWrite(root, loadConfig(root).cacheDir);
    expect(cfg.activityAnimationStyle).toBe("bird-quick-trail");
  });
});
