/**
 * #0362 — task previews are pluggable per project instead of hardcoded to
 * `repoos serve`.
 *
 * Covers the resolution precedence (`[[preview.targets]]` by task `area` →
 * default `[preview] command` → clean, actionable "none"), the `[preview]`
 * TOML parsing, and one real end-to-end custom-command preview: spawn, serve,
 * and group-kill.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoOSConfig, Task } from "../../core/types";
import { loadConfig, parsePreviewConfig } from "../../core/config";
import { ensureWorktree } from "../../core/git";
import { PreviewManager, previewTargetOptions, resolvePreviewTarget } from "../../server/preview";

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
  it("returns an actionable 'no preview configured' result when no [preview] section exists (#0370)", () => {
    const result = resolvePreviewTarget(baseConfig(), task("web"));
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.reason).toContain("no usable [preview] config");
      expect(result.reason).toContain('No preview configured for area "web"');
      expect(result.reason).toContain("#0001");
      expect(result.reason).toContain("[[preview.targets]]");
      expect(result.reason).toContain('areas = ["web"]');
      expect(result.reason).toContain("bun run dev --port {port} --host {host}");
    }
  });

  it("suggests a default command when the task has no area", () => {
    const result = resolvePreviewTarget(baseConfig(), task(""));
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.reason).toContain('No preview configured for area "(none)"');
      expect(result.reason).toContain("[preview]");
      expect(result.reason).toContain("bun run dev --port {port} --host {host}");
      expect(result.reason).not.toContain("[[preview.targets]]");
    }
  });

  it("uses a default command for any area, with a '/' readiness default", () => {
    const cfg = baseConfig({ command: "bun run dev --port {port}" });
    expect(resolvePreviewTarget(cfg, task("server"))).toEqual({
      kind: "command",
      label: "default",
      command: "bun run dev --port {port}",
      cwd: undefined,
      readyPath: "/",
      readyTimeoutMs: 10_000,
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
      readyTimeoutMs: 10_000,
    });
    expect(resolvePreviewTarget(cfg, task("docs"))).toEqual({
      kind: "command",
      label: "Docs",
      command: "bun run docs --port {port}",
      cwd: "apps/docs",
      readyPath: "/healthz",
      readyTimeoutMs: 10_000,
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
      expect(result.reason).toContain("[[preview.targets]]");
      expect(result.reason).toContain('areas = ["server"]');
      expect(result.reason).toContain("bun run dev --port {port} --host {host}");
    }
  });

  it("uses the configured readyTimeoutMs override, per-target and as a default (#0370 review)", () => {
    const cfg = baseConfig({
      command: "bun run build && bun dist/cli/index.js serve --port {port}",
      readyTimeoutMs: 240_000,
      targets: [
        {
          name: "Fast",
          areas: ["web"],
          command: "vite --port {port}",
          readyTimeoutMs: 5_000,
        },
        { name: "Plain", areas: ["docs"], command: "vitepress dev --port {port}" },
      ],
    });
    // A target with its own override uses it, not the section default.
    expect(resolvePreviewTarget(cfg, task("web"))).toMatchObject({ readyTimeoutMs: 5_000 });
    // A target with no override falls back to HEALTH_TIMEOUT_MS (10s), NOT the
    // section's default `command` timeout — each target's budget is its own.
    expect(resolvePreviewTarget(cfg, task("docs"))).toMatchObject({ readyTimeoutMs: 10_000 });
    // The default `command` (no area matches) uses the section-level override —
    // this is what makes a cold-worktree build-then-serve command survivable.
    expect(resolvePreviewTarget(cfg, task("server"))).toMatchObject({ readyTimeoutMs: 240_000 });
  });

  it("lists every target whose areas match the task, in config order (#0379)", () => {
    const cfg = baseConfig({
      command: "bun run default --port {port}",
      targets: [
        { name: "App", areas: ["web"], command: "bun run app --port {port}" },
        { name: "Landing", areas: ["landing"], command: "bun run landing --port {port}" },
        { name: "Web v2", areas: ["web"], command: "bun run web2 --port {port}" },
      ],
    });
    // Several targets claim `web`: both are offered, in config order.
    expect(previewTargetOptions(cfg, task("web"))).toEqual([
      { name: "App", areas: ["web"] },
      { name: "Web v2", areas: ["web"] },
    ]);
    // Exactly one match stays a single-entry list (today's common case).
    expect(previewTargetOptions(cfg, task("landing"))).toEqual([
      { name: "Landing", areas: ["landing"] },
    ]);
    // The default command is offered only when no named target matches.
    expect(previewTargetOptions(cfg, task("server"))).toEqual([{ name: "default", areas: [] }]);
    // Nothing configured for the area → no options at all.
    expect(previewTargetOptions(baseConfig(), task("web"))).toEqual([]);
  });

  it("selects the requested target by name, and rejects an unknown one (#0379)", () => {
    const cfg = baseConfig({
      targets: [
        { name: "App", areas: ["web"], command: "bun run app --port {port}" },
        { name: "Web v2", areas: ["web"], command: "bun run web2 --port {port}" },
      ],
    });
    expect(resolvePreviewTarget(cfg, task("web"), "Web v2")).toMatchObject({
      kind: "command",
      label: "Web v2",
      command: "bun run web2 --port {port}",
    });
    const missing = resolvePreviewTarget(cfg, task("web"), "Nope");
    expect(missing.kind).toBe("none");
    if (missing.kind === "none") {
      expect(missing.reason).toContain('No preview target named "Nope"');
      expect(missing.reason).toContain('"App"');
      expect(missing.reason).toContain('"Web v2"');
    }
  });

  it("defaults to the first match when no target is named (#0379)", () => {
    const cfg = baseConfig({
      targets: [
        { name: "App", areas: ["web"], command: "bun run app --port {port}" },
        { name: "Web v2", areas: ["web"], command: "bun run web2 --port {port}" },
      ],
    });
    expect(resolvePreviewTarget(cfg, task("web"))).toMatchObject({ label: "App" });
  });
});

/**
 * Regression guard for #0370's own config: this repo's `[preview]` command must
 * run the WORKTREE's compiled CLI. Invoking the globally installed `repoos`
 * release instead serves stale server/core code (the #0313 failure), and no
 * fixture-based test exercises this repo's own `repoos.toml`.
 */
describe("this repo's own [preview] config", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

  it("builds with the worktree's staleness-aware build, then its own compiled CLI", () => {
    const config = loadConfig(repoRoot);
    const result = resolvePreviewTarget(config, { id: "0370", area: "web" } as unknown as Task);
    expect(result.kind).toBe("command");
    if (result.kind === "command") {
      // #0377: `bun run build` is itself staleness-aware (scripts/build.mjs),
      // so the preview no longer needs a separate build-only-if-stale wrapper.
      // A plain build-then-serve is cheap when nothing changed and still does
      // the build on a cold worktree. The served binary must still be the
      // worktree's own dist/cli, never the global release.
      expect(result.command).toContain("bun run build");
      expect(result.command).toContain("dist/cli/index.js");
      expect(result.command).not.toMatch(/(^|[&|;]\s*)repoos serve/);
      // NOT "/": this repo has auth.enabled = true, so the default readyPath
      // ("/") is auth-gated and returns 401 forever — waitForReady would
      // poll it until readyTimeoutMs (240s) expires on every single preview,
      // even once the server is genuinely healthy. Confirmed live,
      // 2026-09-17: previews sat on "Starting preview…" for 80s+ despite the
      // child being up and serving within seconds. /api/health is
      // unauthenticated by design (#0121).
      expect(result.readyPath).toBe("/api/health");
      expect(result.readyTimeoutMs).toBeGreaterThanOrEqual(60_000);
    }
  });

  it("scripts/build.mjs reuses checkBuildForRoot and runs the raw pipeline", () => {
    const script = readFileSync(join(repoRoot, "scripts", "build.mjs"), "utf8");
    // The single staleness decision lives in core/build.ts and is rendered
    // here — with the release-version guard — and the actual work is the raw
    // pipeline.
    expect(script).toContain("checkBuildForRoot");
    expect(script).toContain("buildVersionMatchesPackage");
    expect(script).toContain("build:raw");
    expect(script).not.toMatch(/(^|[\s&|;])repoos serve/);
  });
});

describe("parsePreviewConfig", () => {
  it("parses a default command, cwd, readiness path/timeout, and named targets", () => {
    const parsed = parsePreviewConfig({
      "preview.command": "bun run dev --port {port}",
      "preview.cwd": "apps/site",
      "preview.readyPath": "healthz",
      "preview.readyTimeoutMs": 240_000,
      "preview.targets": [
        {
          name: "Landing",
          areas: ["web", "landing"],
          command: "bun run landing --port {port}",
          cwd: "landing",
          ready_path: "/ready",
          ready_timeout_ms: 5_000,
        },
      ],
    });
    expect(parsed).toEqual({
      command: "bun run dev --port {port}",
      cwd: "apps/site",
      readyPath: "/healthz",
      readyTimeoutMs: 240_000,
      targets: [
        {
          name: "Landing",
          areas: ["web", "landing"],
          command: "bun run landing --port {port}",
          cwd: "landing",
          readyPath: "/ready",
          readyTimeoutMs: 5_000,
        },
      ],
    });
  });

  it("ignores a non-positive or non-numeric readyTimeoutMs", () => {
    expect(
      parsePreviewConfig({ "preview.command": "x", "preview.readyTimeoutMs": 0 })?.readyTimeoutMs,
    ).toBeUndefined();
    expect(
      parsePreviewConfig({ "preview.command": "x", "preview.readyTimeoutMs": -5 })?.readyTimeoutMs,
    ).toBeUndefined();
    expect(
      parsePreviewConfig({ "preview.command": "x", "preview.readyTimeoutMs": "240000" })
        ?.readyTimeoutMs,
    ).toBeUndefined();
  });

  it("accepts a single-string area and defaults a missing target name", () => {
    const parsed = parsePreviewConfig({
      "preview.targets": [{ areas: "web", command: "bun run web --port {port}" }],
    });
    expect(parsed?.targets?.[0]).toMatchObject({ areas: ["web"], name: "web" });
  });

  it("disambiguates duplicate target names so the picker and label match stay unambiguous (#0379)", () => {
    const parsed = parsePreviewConfig({
      "preview.targets": [
        { areas: ["web"], command: "bun run a --port {port}" },
        { areas: ["web"], command: "bun run b --port {port}" },
        { name: "web", areas: ["blog"], command: "bun run c --port {port}" },
      ],
    });
    expect(parsed?.targets?.map((t) => t.name)).toEqual(["web", "web (2)", "web (3)"]);
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

describe("PreviewManager ambiguous-target enforcement (#0379)", () => {
  const multi = baseConfig({
    targets: [
      { name: "App", areas: ["web"], command: "bun run app --port {port}" },
      { name: "Web v2", areas: ["web"], command: "bun run web2 --port {port}" },
    ],
  });

  it("refuses an ambiguous area with no explicit choice instead of silently picking", async () => {
    const manager = new PreviewManager(multi, () => {});
    const result = await manager.start(task("web"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("matches more than one preview target");
    expect(result.error).toContain("App");
    expect(result.error).toContain("Web v2");
    expect(manager.get("0001")).toBeNull();
  });

  it("lets the agent-request path opt into the first match", async () => {
    const manager = new PreviewManager(multi, () => {});
    // No worktree here, so `doStart` fails on that — but crucially NOT on the
    // ambiguity guard, proving `allowAmbiguous` got past enforcement.
    const result = await manager.start(task("web"), undefined, { allowAmbiguous: true });
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("matches more than one preview target");
    expect(result.error).toMatch(/worktree|branch/i);
  });
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

  it("never falls back to repoos serve: no usable [preview] config is a clean error (#0370)", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-noconfig";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);

    const config = loadConfig(fx.root);
    expect(config.preview).toBeUndefined();
    const manager = new PreviewManager(config, () => {});
    const t = { id: "0003", area: "web", branch, status: "active" } as unknown as Task;
    const result = await manager.start(t);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no usable [preview] config");
    expect(result.error).toContain('No preview configured for area "web"');
    expect(manager.get("0003")).toBeNull();
  }, 30_000);

  it("starts the explicitly chosen target and rejects a different one while running (#0379)", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-multi";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(join(wt.path, "preview-server.mjs"), SERVER_SCRIPT);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "App"',
        'areas = ["web"]',
        `command = ${JSON.stringify(`${process.execPath} preview-server.mjs`)}`,
        "[[preview.targets]]",
        'name = "Web v2"',
        'areas = ["web"]',
        `command = ${JSON.stringify(`${process.execPath} preview-server.mjs`)}`,
      ].join("\n") + "\n",
    );

    const config = loadConfig(fx.root);
    const manager = new PreviewManager(config, () => {});
    const t = { id: "0009", area: "web", branch, status: "active" } as unknown as Task;
    try {
      // Ambiguous area, no choice: refused before anything spawns.
      const ambiguous = await manager.start(t);
      expect(ambiguous.ok).toBe(false);
      expect(ambiguous.error).toContain("matches more than one preview target");
      expect(manager.get("0009")).toBeNull();

      // An explicit choice starts exactly that target.
      const started = await manager.start(t, "Web v2");
      expect(started.ok).toBe(true);
      expect(started.label).toBe("Web v2");
      expect(await (await fetch(`${started.url}/`)).text()).toContain("CUSTOM-PREVIEW-OK");

      // Asking for the other target while one runs is an explicit mismatch,
      // never an idempotent 200 that silently returns the wrong one.
      const mismatch = await manager.start(t, "App");
      expect(mismatch.ok).toBe(false);
      expect(mismatch.error).toContain("already has a preview running");
      expect(mismatch.error).toContain("Web v2");

      // Repeat with the same target stays idempotent.
      const same = await manager.start(t, "Web v2");
      expect(same.ok).toBe(true);
      expect(same.label).toBe("Web v2");
    } finally {
      await manager.stopAll();
    }
  }, 60_000);
});
