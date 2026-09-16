/**
 * #0362 — task previews are pluggable per project instead of hardcoded to
 * `repoos serve`.
 *
 * Covers the resolution precedence (`[[preview.targets]]` by task `area` →
 * default `[preview] command` → clean "none" → `repoos serve` fallback), the
 * `[preview]` TOML parsing, and one real end-to-end custom-command preview:
 * spawn, serve, and group-kill.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { loadConfig, parsePreviewConfig } from "../../core/config";
import { ensureWorktree } from "../../core/git";
import { PreviewManager, resolvePreviewTarget } from "../../server/preview";

function baseConfig(preview?: RepoOSConfig["preview"]): RepoOSConfig {
  return {
    root: "/tmp/repoos-preview-unit",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ...(preview ? { preview } : {}),
  };
}

function task(area: string): Task {
  return { id: "0001", area, branch: "feat/x", status: "active" } as unknown as Task;
}

describe("resolvePreviewTarget", () => {
  it("falls back to repoos serve when no [preview] section exists", () => {
    expect(resolvePreviewTarget(baseConfig(), task("web"))).toEqual({
      kind: "repoos",
      readyPath: "/api/health",
      label: "repoos",
    });
  });

  it("uses a default command for any area, with a '/' readiness default", () => {
    const cfg = baseConfig({ command: "bun run dev --port {port}" });
    expect(resolvePreviewTarget(cfg, task("server"))).toEqual({
      kind: "command",
      label: "default",
      command: "bun run dev --port {port}",
      cwd: undefined,
      readyPath: "/",
    });
  });

  it("selects a named target by area, case-insensitively, honoring overrides", () => {
    const cfg = baseConfig({
      command: "bun run default --port {port}",
      targets: [
        { name: "Landing", areas: ["Web", "landing"], command: "bun run landing --port {port}" },
        {
          name: "Docs",
          areas: ["docs"],
          command: "bun run docs --port {port}",
          cwd: "apps/docs",
          readyPath: "/healthz",
        },
      ],
    });
    expect(resolvePreviewTarget(cfg, task("web"))).toEqual({
      kind: "command",
      label: "Landing",
      command: "bun run landing --port {port}",
      cwd: undefined,
      readyPath: "/",
    });
    expect(resolvePreviewTarget(cfg, task("docs"))).toEqual({
      kind: "command",
      label: "Docs",
      command: "bun run docs --port {port}",
      cwd: "apps/docs",
      readyPath: "/healthz",
    });
  });

  it("falls through to the default command when no target matches", () => {
    const cfg = baseConfig({
      command: "bun run default --port {port}",
      targets: [{ name: "Landing", areas: ["web"], command: "bun run landing --port {port}" }],
    });
    expect(resolvePreviewTarget(cfg, task("server"))).toMatchObject({
      kind: "command",
      label: "default",
    });
  });

  it("returns a clean 'no preview configured' result when targets exist but nothing matches", () => {
    const cfg = baseConfig({
      targets: [{ name: "Landing", areas: ["web"], command: "bun run landing --port {port}" }],
    });
    const result = resolvePreviewTarget(cfg, task("server"));
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.reason).toContain('No preview configured for area "server"');
      expect(result.reason).toContain("#0001");
    }
  });
});

describe("parsePreviewConfig", () => {
  it("parses a default command, cwd, readiness path, and named targets", () => {
    const parsed = parsePreviewConfig({
      "preview.command": "bun run dev --port {port}",
      "preview.cwd": "apps/site",
      "preview.readyPath": "healthz",
      "preview.targets": [
        {
          name: "Landing",
          areas: ["web", "landing"],
          command: "bun run landing --port {port}",
          cwd: "landing",
          ready_path: "/ready",
        },
      ],
    });
    expect(parsed).toEqual({
      command: "bun run dev --port {port}",
      cwd: "apps/site",
      readyPath: "/healthz",
      targets: [
        {
          name: "Landing",
          areas: ["web", "landing"],
          command: "bun run landing --port {port}",
          cwd: "landing",
          readyPath: "/ready",
        },
      ],
    });
  });

  it("accepts a single-string area and defaults a missing target name", () => {
    const parsed = parsePreviewConfig({
      "preview.targets": [{ areas: "web", command: "bun run web --port {port}" }],
    });
    expect(parsed?.targets?.[0]).toMatchObject({ areas: ["web"], name: "web" });
  });

  it("drops targets with no command and returns undefined when nothing usable remains", () => {
    expect(
      parsePreviewConfig({ "preview.targets": [{ name: "x", areas: ["web"] }] }),
    ).toBeUndefined();
    expect(parsePreviewConfig({})).toBeUndefined();
  });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

interface Fixture {
  root: string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-preview-"));
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  const wtRoot = join(root, "..", `${basename(root)}-worktrees`);
  return {
    root,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      try {
        git(root, ["worktree", "prune"]);
      } catch {
        /* ignore */
      }
      rmSync(wtRoot, { recursive: true, force: true });
    },
  };
}

/** A tiny HTTP server the preview command runs; proves PORT + readiness work. */
const SERVER_SCRIPT = `
import { createServer } from "node:http";
const port = Number(process.env.PORT);
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("CUSTOM-PREVIEW-OK");
}).listen(port, "127.0.0.1");
`.trimStart();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred: () => Promise<boolean> | boolean, ms = 8000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await pred()) return true;
    await sleep(100);
  }
  return false;
}

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.clean();
});

describe("PreviewManager with a project-declared command (#0362)", () => {
  it("spawns the configured command, serves it, and group-kills it on stop", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-custom";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(join(wt.path, "preview-server.mjs"), SERVER_SCRIPT);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Web"',
        'areas = ["web"]',
        `command = ${JSON.stringify(`${process.execPath} preview-server.mjs`)}`,
      ].join("\n") + "\n",
    );

    const config = loadConfig(fx.root);
    const manager = new PreviewManager(config, () => {});
    const t = { id: "0001", area: "web", branch, status: "active" } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok).toBe(true);
      expect(result.readyPath).toBe("/");
      expect(await (await fetch(`${result.url}/`)).text()).toContain("CUSTOM-PREVIEW-OK");

      const info = manager.get("0001");
      expect(info?.pid).toBeGreaterThan(0);
      const pid = info!.pid;

      await manager.stop("0001");
      expect(
        await waitFor(() => {
          try {
            process.kill(pid, 0);
            return false;
          } catch {
            return true;
          }
        }),
      ).toBe(true);
    } finally {
      await manager.stopAll();
    }
  }, 60_000);

  it("returns a clean 'no preview configured' error instead of spawning for an unmatched area", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-unmatched";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Web"',
        'areas = ["web"]',
        'command = "bun run dev --port {port}"',
      ].join("\n") + "\n",
    );

    const config = loadConfig(fx.root);
    const manager = new PreviewManager(config, () => {});
    const t = { id: "0002", area: "server", branch, status: "active" } as unknown as Task;
    const result = await manager.start(t);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No preview configured for area "server"');
    expect(manager.get("0002")).toBeNull();
  }, 30_000);
});
