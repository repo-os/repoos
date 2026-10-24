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
import { execFileSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoOSConfig, Task } from "../../core/types";
import { loadConfig, parsePreviewConfig } from "../../core/config";
import { ensureWorktree } from "../../core/git";
import {
  PreviewManager,
  awaitNativeLaunch,
  previewTargetOptions,
  resolvePreviewTarget,
} from "../../server/preview";

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
  it("prefers a target whose changed-path globs match, while preserving area fallback", () => {
    const cfg = baseConfig({
      targets: [
        {
          name: "iOS shell",
          kind: "native",
          platform: "ios",
          areas: ["ios"],
          paths: ["mobile/ios/**"],
          command: "",
          buildCommand: "build",
          launchCommand: "launch",
        },
        {
          name: "macOS shell",
          kind: "native",
          platform: "macos",
          areas: ["mac"],
          paths: ["macos/**"],
          command: "",
          buildCommand: "build",
          launchCommand: "launch",
        },
        { name: "Web", areas: ["web"], command: "bun run dev" },
      ],
    });
    const resolved = resolvePreviewTarget(cfg, task("mac"), undefined, ["mobile/ios/App.swift"]);
    expect(resolved.kind === "command" && resolved.label).toBe("iOS shell");
    const web = resolvePreviewTarget(cfg, task("web"));
    expect(web.kind === "command" && web.label).toBe("Web");
  });

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
      services: [],
      unresolvedServices: [],
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
      services: [],
      unresolvedServices: [],
    });
    expect(resolvePreviewTarget(cfg, task("docs"))).toEqual({
      kind: "command",
      label: "Docs",
      command: "bun run docs --port {port}",
      cwd: "apps/docs",
      readyPath: "/healthz",
      readyTimeoutMs: 10_000,
      services: [],
      unresolvedServices: [],
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
    // When no named target ranks above it, the default command is the last
    // configured fallback and keeps its section-level timeout.
    expect(
      resolvePreviewTarget(
        baseConfig({
          command: "bun run build && bun dist/cli/index.js serve --port {port}",
          readyTimeoutMs: 240_000,
        }),
        task("server"),
      ),
    ).toMatchObject({ readyTimeoutMs: 240_000 });
  });

  it("ranks area matches, then the default, then every other target (#0411)", () => {
    const cfg = baseConfig({
      command: "bun run default --port {port}",
      targets: [
        { name: "App", areas: ["web"], command: "bun run app --port {port}" },
        { name: "Landing", areas: ["landing"], command: "bun run landing --port {port}" },
        { name: "Web v2", areas: ["web"], command: "bun run web2 --port {port}" },
        { name: "Docs", areas: ["docs"], command: "bun run docs --port {port}" },
      ],
    });
    // Area matches first, then the default, then everything else — so the
    // pre-selected choice is never an unrelated target.
    expect(previewTargetOptions(cfg, task("web"))).toEqual([
      { name: "App", areas: ["web"] },
      { name: "Web v2", areas: ["web"] },
      { name: "default", areas: [] },
      { name: "Landing", areas: ["landing"] },
      { name: "Docs", areas: ["docs"] },
    ]);
    expect(previewTargetOptions(cfg, task("landing"))).toEqual([
      { name: "Landing", areas: ["landing"] },
      { name: "default", areas: [] },
      { name: "App", areas: ["web"] },
      { name: "Web v2", areas: ["web"] },
      { name: "Docs", areas: ["docs"] },
    ]);
    // No area match: the default leads; every named target stays pickable.
    expect(previewTargetOptions(cfg, task("server"))).toEqual([
      { name: "default", areas: [] },
      { name: "App", areas: ["web"] },
      { name: "Landing", areas: ["landing"] },
      { name: "Web v2", areas: ["web"] },
      { name: "Docs", areas: ["docs"] },
    ]);
    expect(previewTargetOptions(baseConfig(), task("web"))).toEqual([]);
  });

  it("accepts an out-of-area target by name, and rejects an unknown one (#0411)", () => {
    const cfg = baseConfig({
      command: "bun run default --port {port}",
      targets: [
        { name: "App", areas: ["web"], command: "bun run app --port {port}" },
        { name: "Docs", areas: ["docs"], command: "bun run docs --port {port}" },
      ],
    });
    expect(resolvePreviewTarget(cfg, task("web"), "Docs")).toMatchObject({
      kind: "command",
      label: "Docs",
      command: "bun run docs --port {port}",
    });
    const missing = resolvePreviewTarget(cfg, task("web"), "Nope");
    expect(missing.kind).toBe("none");
    if (missing.kind === "none") {
      expect(missing.reason).toContain('No preview target named "Nope"');
      expect(missing.reason).toContain('"App"');
      expect(missing.reason).toContain('"Docs"');
    }
  });

  it("never implicitly serves an out-of-area target when no name is supplied (#0411)", () => {
    // No area match and no default command: nothing is servable without an
    // explicit pick, even though both targets are offered in the dropdown.
    const cfg = baseConfig({
      targets: [
        { name: "Landing", areas: ["landing"], command: "bun run landing --port {port}" },
        { name: "Docs", areas: ["docs"], command: "bun run docs --port {port}" },
      ],
    });
    expect(resolvePreviewTarget(cfg, task("web")).kind).toBe("none");
    expect(previewTargetOptions(cfg, task("web")).map((o) => o.name)).toEqual(["Landing", "Docs"]);
    expect(resolvePreviewTarget(cfg, task("web"), "Docs")).toMatchObject({
      kind: "command",
      label: "Docs",
    });
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

  // #0411: every configured target is offered, but an unrelated one must never
  // win implicitly. A "web" task matches no named target here, so it gets the
  // default command (the app), not the first configured target (landing page).
  it("ranks area matches, then the default, then other targets", () => {
    const config = loadConfig(repoRoot);
    const web = { id: "0411", area: "web" } as unknown as Task;
    expect(previewTargetOptions(config, web).map((o) => o.name)).toEqual([
      "default",
      "Landing page",
      "Docs site",
    ]);
    const landing = { id: "0411", area: "landing" } as unknown as Task;
    expect(previewTargetOptions(config, landing).map((o) => o.name)[0]).toBe("Landing page");
    const resolved = resolvePreviewTarget(config, landing);
    expect(resolved.kind === "command" && resolved.label).toBe("Landing page");
  });

  it("serves an out-of-area target only when explicitly picked (#0409 recovery)", () => {
    const config = loadConfig(repoRoot);
    const web = { id: "0409", area: "web" } as unknown as Task;
    const picked = resolvePreviewTarget(config, web, "Docs site");
    expect(picked.kind === "command" && picked.label).toBe("Docs site");
    const implicit = resolvePreviewTarget(config, web);
    expect(implicit.kind === "command" && implicit.label).toBe("default");
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

  it("parses native targets only when platform, build and launch are valid", () => {
    const parsed = parsePreviewConfig({
      "preview.targets": [
        {
          kind: "native",
          platform: "ios",
          areas: ["ios"],
          build_command: "build",
          launch_command: "launch",
          launch_waits: true,
          stop: "stop",
          device: "iPhone",
          timeout_ms: 5000,
          requires: "xcrun",
        },
        {
          kind: "native",
          platform: "watchos",
          areas: ["ios"],
          build_command: "build",
          launch_command: "launch",
        },
        { kind: "native", platform: "macos", areas: ["mac"], build_command: "build" },
      ],
    });
    expect(parsed?.targets).toEqual([
      {
        name: "ios",
        areas: ["ios"],
        command: "build && launch",
        kind: "native",
        platform: "ios",
        buildCommand: "build",
        launchCommand: "launch",
        launchWaits: true,
        stop: "stop",
        device: "iPhone",
        timeoutMs: 5000,
        requires: "xcrun",
      },
    ]);
  });

  it("accepts launchWaits in camelCase and ignores a non-boolean launch_waits (#0943)", () => {
    const camel = parsePreviewConfig({
      "preview.targets": [
        {
          kind: "native",
          platform: "macos",
          areas: ["mac"],
          build_command: "build",
          launch_command: "open -W App.app",
          launchWaits: true,
        },
      ],
    });
    expect(camel?.targets?.[0]?.launchWaits).toBe(true);
    const notBool = parsePreviewConfig({
      "preview.targets": [
        {
          kind: "native",
          platform: "macos",
          areas: ["mac"],
          build_command: "build",
          launch_command: "open -W App.app",
          launch_waits: "yes",
        },
      ],
    });
    expect(notBool?.targets?.[0]?.launchWaits).toBeUndefined();
    // Absent means one-shot handoff — the default lifecycle.
    expect(
      parsePreviewConfig({
        "preview.targets": [
          {
            kind: "native",
            platform: "macos",
            areas: ["mac"],
            build_command: "build",
            launch_command: "open App.app",
          },
        ],
      })?.targets?.[0]?.launchWaits,
    ).toBeUndefined();
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

  it("parses [[preview.services]] and target service references (#0681)", () => {
    const parsed = parsePreviewConfig({
      "preview.services": [
        { name: "API", command: "bun run api --port {port}" },
        { name: "API", command: "duplicate name disambiguates" },
      ],
      "preview.targets": [
        {
          name: "Full stack",
          areas: ["web"],
          command: "bun run web --port {port} --api {api.port}",
          services: ["API"],
        },
      ],
    });
    expect(parsed?.services?.map((s) => s.name)).toEqual(["API", "API (2)"]);
    expect(parsed?.targets?.[0]).toMatchObject({
      name: "Full stack",
      services: ["API"],
    });
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

/** Companion API: proves the branch's own service port is wired (#0681). */
const API_SERVICE_SCRIPT = `
import { createServer } from "node:http";
const port = Number(process.env.PORT);
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ branchField: "branch-api-value" }));
}).listen(port, "127.0.0.1");
`.trimStart();

/** Web command: reads the companion API via REPOOS_PREVIEW_API_URL. */
const WEB_PROXY_SCRIPT = `
import { createServer } from "node:http";
const port = Number(process.env.PORT);
const api = process.env.REPOOS_PREVIEW_API_URL;
createServer(async (_req, res) => {
  const r = await fetch(api + "/");
  const data = await r.json();
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("API_FIELD=" + data.branchField);
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
  it("builds and launches a native target in the task worktree and runs its stop command", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Fake macOS app"',
        'kind = "native"',
        'platform = "macos"',
        'areas = ["mac"]',
        'build_command = "touch {outputDir}/built"',
        'launch_command = "sleep 30"',
        'stop = "touch {outputDir}/stopped"',
      ].join("\n") + "\n",
    );
    const config = loadConfig(fx.root);
    const manager = new PreviewManager(config, () => {});
    const t = { id: "0943", area: "mac", branch, status: "active" } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok).toBe(true);
      expect(result.url).toBe("");
      expect(manager.get("0943")?.native?.platform).toBe("macos");
      const output = join(wt.path, ".repoos", "preview-output", "0943");
      expect(readFileSync(join(output, "built"), "utf8")).toBe("");
      await manager.stop("0943");
      expect(readFileSync(join(output, "stopped"), "utf8")).toBe("");
      expect(manager.get("0943")).toBeNull();
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it("reports a failed native launch without registering it as running", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-launch-fails";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Failing native app"',
        'kind = "native"',
        'platform = "macos"',
        'areas = ["mac"]',
        'build_command = "true"',
        'launch_command = "echo launch-broke >&2; false"',
      ].join("\n") + "\n",
    );
    const manager = new PreviewManager(loadConfig(fx.root), () => {});
    try {
      const result = await manager.start({
        id: "0943-fail",
        area: "mac",
        branch,
        status: "active",
      } as unknown as Task);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("native macos launch failed");
      expect(result.error).toContain("launch-broke");
      expect(manager.get("0943-fail")).toBeNull();
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it("accepts a successful one-shot native launcher and preserves its stop command", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-launch-handoff";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "One-shot native app"',
        'kind = "native"',
        'platform = "ios"',
        'areas = ["ios"]',
        'build_command = "true"',
        'launch_command = "true"',
        'stop = "touch {outputDir}/stopped"',
      ].join("\n") + "\n",
    );
    const manager = new PreviewManager(loadConfig(fx.root), () => {});
    const t = { id: "0943-one-shot", area: "ios", branch, status: "active" } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok).toBe(true);
      expect(manager.get(t.id)?.native?.platform).toBe("ios");
      await manager.stop(t.id);
      expect(
        readFileSync(join(wt.path, ".repoos", "preview-output", t.id, "stopped"), "utf8"),
      ).toBe("");
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it.each([
    { ending: "exits cleanly", launch: "sleep 1" },
    { ending: "exits non-zero", launch: "sleep 1 && exit 3" },
    { ending: "is killed by a signal", launch: "sleep 1 && kill -9 $$" },
  ])(
    "drops a native preview whose waiting launcher $ending after the startup grace (#0943)",
    async ({ ending, launch }: { ending: string; launch: string }) => {
      const fx = makeFixture();
      fixtures.push(fx);
      const branch = "feat/preview-native-selfexit";
      const wt = ensureWorktree(fx.root, branch);
      if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
      writeFileSync(
        join(fx.root, "repoos.toml"),
        [
          "[[preview.targets]]",
          'name = "Self-exiting native app"',
          'kind = "native"',
          'platform = "macos"',
          'areas = ["mac"]',
          "launch_waits = true",
          'build_command = "true"',
          `launch_command = ${JSON.stringify(launch)}`,
        ].join("\n") + "\n",
      );
      const events: Array<{ type: string; id?: string; preview?: unknown }> = [];
      const manager = new PreviewManager(loadConfig(fx.root), (e) => events.push(e));
      const t = { id: "0943-selfexit", area: "mac", branch, status: "active" } as unknown as Task;
      try {
        const result = await manager.start(t);
        expect(result.ok, result.error).toBe(true);
        // The WAITING launcher outlives the 150ms startup grace, so it owns
        // the running preview. When it then ends on its own — without a
        // manual stop — the registry entry and the SSE stream must drop,
        // exactly as a web preview whose server process exits does.
        expect(manager.get(t.id)).not.toBeNull();
        expect(await waitFor(() => manager.get(t.id) === null)).toBe(true);
        expect(
          events.some((e) => e.type === "preview" && e.id === t.id && e.preview === null),
        ).toBe(true);
      } finally {
        await manager.stopAll();
      }
    },
    30_000,
  );

  it("keeps a slow one-shot native preview running after its launcher exits 0 (#0943)", async () => {
    // The iOS recipe shape: a launch shell (boot + install + launch) that
    // takes longer than the 150ms startup grace and then exits cleanly while
    // the app keeps running. Before the fix its post-grace exit 0 was
    // conflated with a waiting launcher (`open -W`) and dropped the preview
    // the moment the handoff completed.
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-slow-oneshot";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Slow one-shot native app"',
        'kind = "native"',
        'platform = "ios"',
        'areas = ["ios"]',
        'build_command = "true"',
        'launch_command = "sleep 1"',
        'stop = "touch {outputDir}/stopped"',
      ].join("\n") + "\n",
    );
    const events: Array<{ type: string; id?: string; preview?: unknown }> = [];
    const manager = new PreviewManager(loadConfig(fx.root), (e) => events.push(e));
    const t = {
      id: "0943-slow-one-shot",
      area: "ios",
      branch,
      status: "active",
    } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok, result.error).toBe(true);
      // Wait until the launcher shell itself has exited (pid gone), then the
      // preview must STILL be registered — the handoff completed, the app
      // "keeps running" — with no SSE drop event.
      const pid = manager.get(t.id)?.pid ?? 0;
      const pidGone = (p: number): boolean => {
        try {
          process.kill(p, 0);
          return false;
        } catch {
          return true;
        }
      };
      expect(pid).toBeGreaterThan(0);
      expect(await waitFor(() => pidGone(pid))).toBe(true);
      await sleep(300); // give a (buggy) drop handler time to fire
      expect(manager.get(t.id)).not.toBeNull();
      expect(events.some((e) => e.type === "preview" && e.id === t.id && e.preview === null)).toBe(
        false,
      );
      // Stop still tears it down through the declared stop command.
      await manager.stop(t.id);
      expect(
        readFileSync(join(wt.path, ".repoos", "preview-output", t.id, "stopped"), "utf8"),
      ).toBe("");
      expect(manager.get(t.id)).toBeNull();
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it("reports a launch that cannot spawn without registering the preview (#0943 case 1)", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-spawn-fails";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    // 3MB exceeds ARG_MAX on macOS (1MB) and Linux (2MB), so the launch spawn
    // fails — synchronously under Bun, as an async error event under Node —
    // and BOTH paths must return the error with nothing left registered.
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Unspawnable native app"',
        'kind = "native"',
        'platform = "macos"',
        'areas = ["mac"]',
        'build_command = "true"',
        `launch_command = "${"x".repeat(3_000_000)}"`,
      ].join("\n") + "\n",
    );
    const events: Array<{ type: string; id?: string; preview?: { starting?: boolean } | null }> =
      [];
    const manager = new PreviewManager(loadConfig(fx.root), (e) => events.push(e));
    const t = { id: "0943-spawn", area: "mac", branch, status: "active" } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("native macos launch");
      expect(result.error).toContain("E2BIG");
      expect(manager.get(t.id)).toBeNull();
      expect(manager.startingInfo(t.id)).toBeNull();
      // The building state was visible, then cleared — never left stale.
      expect(
        events.some((e) => e.type === "preview" && e.id === t.id && e.preview?.starting === true),
      ).toBe(true);
      expect(events.some((e) => e.type === "preview" && e.id === t.id && e.preview === null)).toBe(
        true,
      );
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it("reports a failed native build with its log tail and never registers it (#0943 case 7)", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-build-fails";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Failing native build"',
        'kind = "native"',
        'platform = "macos"',
        'areas = ["mac"]',
        'build_command = "echo build-broke >&2; false"',
        'launch_command = "true"',
      ].join("\n") + "\n",
    );
    const events: Array<{ type: string; id?: string; preview?: { starting?: boolean } | null }> =
      [];
    const manager = new PreviewManager(loadConfig(fx.root), (e) => events.push(e));
    const t = { id: "0943-buildfail", area: "mac", branch, status: "active" } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("native macos build failed");
      expect(result.error).toContain("build-broke");
      expect(manager.get(t.id)).toBeNull();
      expect(manager.startingInfo(t.id)).toBeNull();
      expect(
        events.some((e) => e.type === "preview" && e.id === t.id && e.preview?.starting === true),
      ).toBe(true);
      expect(events.some((e) => e.type === "preview" && e.id === t.id && e.preview === null)).toBe(
        true,
      );
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it("a stop during a native build wins: the build is killed and nothing registers (#0943)", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-stop-during-build";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Slow native build"',
        'kind = "native"',
        'platform = "macos"',
        'areas = ["mac"]',
        'build_command = "sleep 30"',
        'launch_command = "true"',
      ].join("\n") + "\n",
    );
    const events: Array<{ type: string; id?: string; preview?: { starting?: boolean } | null }> =
      [];
    const manager = new PreviewManager(loadConfig(fx.root), (e) => events.push(e));
    const t = { id: "0943-stopbuild", area: "mac", branch, status: "active" } as unknown as Task;
    const isPidAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    try {
      const startP = manager.start(t);
      // While the build runs, the manager exposes a visible building state.
      expect(await waitFor(() => (manager.startingInfo(t.id)?.pid ?? 0) > 0)).toBe(true);
      const building = manager.startingInfo(t.id);
      expect(building?.starting).toBe(true);
      expect(building?.native?.platform).toBe("macos");
      const buildPid = building?.pid ?? 0;
      expect(isPidAlive(buildPid)).toBe(true);

      await manager.stop(t.id);
      const result = await startP;
      expect(result.ok).toBe(false);
      expect(result.error).toContain("cancelled");
      expect(manager.get(t.id)).toBeNull();
      expect(manager.startingInfo(t.id)).toBeNull();
      // The recorded build process must actually be gone — not orphaned.
      expect(isPidAlive(buildPid)).toBe(false);
      expect(
        events.some((e) => e.type === "preview" && e.id === t.id && e.preview?.starting === true),
      ).toBe(true);
      expect(events.some((e) => e.type === "preview" && e.id === t.id && e.preview === null)).toBe(
        true,
      );
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

  it("FIFO-evicts the prior native preview when the single slot is reused", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-native-fifo";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.targets]]",
        'name = "Native app"',
        'kind = "native"',
        'platform = "macos"',
        'areas = ["mac"]',
        'build_command = "true"',
        'launch_command = "sleep 30"',
      ].join("\n") + "\n",
    );
    const manager = new PreviewManager(loadConfig(fx.root), () => {});
    const first = { id: "0943-first", area: "mac", branch, status: "active" } as unknown as Task;
    const second = { id: "0943-second", area: "mac", branch, status: "active" } as unknown as Task;
    try {
      expect((await manager.start(first)).ok).toBe(true);
      expect((await manager.start(second)).ok).toBe(true);
      expect(manager.get("0943-first")).toBeNull();
      expect(manager.get("0943-second")?.native?.platform).toBe("macos");
    } finally {
      await manager.stopAll();
    }
  }, 30_000);

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

  it("boots a companion API service and serves the branch response through the main URL (#0681)", async () => {
    const fx = makeFixture();
    fixtures.push(fx);
    const branch = "feat/preview-fullstack";
    const wt = ensureWorktree(fx.root, branch);
    if (!wt.ok) throw new Error(`worktree: ${wt.reason}`);
    const node = process.execPath;
    writeFileSync(join(wt.path, "preview-api.mjs"), API_SERVICE_SCRIPT);
    writeFileSync(join(wt.path, "preview-web.mjs"), WEB_PROXY_SCRIPT);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[preview.services]]",
        'name = "API"',
        `command = ${JSON.stringify(`${node} preview-api.mjs`)}`,
        "",
        "[[preview.targets]]",
        'name = "Full stack"',
        'areas = ["web"]',
        'services = ["API"]',
        `command = ${JSON.stringify(`${node} preview-web.mjs`)}`,
      ].join("\n") + "\n",
    );

    const config = loadConfig(fx.root);
    const manager = new PreviewManager(config, () => {});
    const t = { id: "0681", area: "web", branch, status: "active" } as unknown as Task;
    try {
      const result = await manager.start(t);
      expect(result.ok).toBe(true);
      expect(result.services).toEqual([{ name: "API", port: expect.any(Number) }]);
      expect(await (await fetch(`${result.url}/`)).text()).toBe("API_FIELD=branch-api-value");
    } finally {
      await manager.stopAll();
    }
  }, 60_000);
});

/**
 * The native launch state machine (#0943) — every transition, driven directly
 * with a fake child so grace-timing cannot flake:
 *
 * - during the 150ms startup grace: exit 0 is a handoff completion (stays
 *   running), any error/non-zero exit is a failed launch (error returned);
 * - after the grace, behavior follows the DECLARED lifetime: a one-shot
 *   handoff that exits 0 late completes normally and stays running (the slow
 *   iOS `boot && install && launch` recipe), while a waiting launcher
 *   (`launch_waits = true`) owns the preview — its exit of any kind, and any
 *   error/non-zero exit for either lifetime — must call `onExit` and drop the
 *   registry/SSE exactly like a web preview exiting.
 */
describe("awaitNativeLaunch state machine (#0943)", () => {
  type Row = {
    name: string;
    /** `launch_waits = true` on the target; absent = one-shot handoff. */
    waits?: boolean;
    phase: "during" | "after";
    event: "error" | "exit0" | "exit3" | "signal";
    errorContains: string | null;
    exits: number;
  };
  // The full exit matrix across both declared launcher lifetimes. One-shot
  // (default): a clean exit any time completes the handoff and leaves the
  // preview running — including a SLOW one that outlives the grace (the iOS
  // `boot && install && launch` recipe). Waiting (`launch_waits = true`,
  // e.g. `open -W`): the launcher owns the preview, so any later exit — even
  // a clean user quit — drops it.
  const rows: Row[] = [
    {
      name: "spawn error during the grace returns an error without cleanup",
      phase: "during",
      event: "error",
      errorContains: "could not spawn",
      exits: 0,
    },
    {
      name: "a spawn error after the grace drops the preview",
      phase: "after",
      event: "error",
      errorContains: null,
      exits: 1,
    },
    {
      name: "exit 0 during the grace is a one-shot handoff that stays running",
      phase: "during",
      event: "exit0",
      errorContains: null,
      exits: 0,
    },
    {
      name: "exit 0 after the grace completes a slow one-shot handoff and stays running",
      phase: "after",
      event: "exit0",
      errorContains: null,
      exits: 0,
    },
    {
      name: "a waiting launcher exiting 0 during the grace is still treated as launched",
      waits: true,
      phase: "during",
      event: "exit0",
      errorContains: null,
      exits: 0,
    },
    {
      name: "a waiting launcher exiting 0 after the grace drops the preview (open -W)",
      waits: true,
      phase: "after",
      event: "exit0",
      errorContains: null,
      exits: 1,
    },
    {
      name: "a non-zero exit during the grace returns an error without cleanup",
      phase: "during",
      event: "exit3",
      errorContains: "exited with code 3",
      exits: 0,
    },
    {
      name: "a non-zero exit after the grace drops the preview",
      phase: "after",
      event: "exit3",
      errorContains: null,
      exits: 1,
    },
    {
      name: "a waiting launcher's non-zero exit after the grace also drops the preview",
      waits: true,
      phase: "after",
      event: "exit3",
      errorContains: null,
      exits: 1,
    },
    {
      name: "a signal death during the grace returns an error without cleanup",
      phase: "during",
      event: "signal",
      errorContains: "SIGKILL",
      exits: 0,
    },
    {
      name: "a signal death after the grace drops the preview",
      phase: "after",
      event: "signal",
      errorContains: null,
      exits: 1,
    },
    {
      name: "a waiting launcher's signal death after the grace also drops the preview",
      waits: true,
      phase: "after",
      event: "signal",
      errorContains: null,
      exits: 1,
    },
  ];

  it.each(rows)("$name", async (row: Row) => {
    const child = new EventEmitter() as unknown as ChildProcess;
    let exits = 0;
    const pending = awaitNativeLaunch(
      child,
      () => {
        exits += 1;
      },
      { waits: row.waits },
    );
    if (row.phase === "after") await sleep(200); // let the 150ms grace expire
    switch (row.event) {
      case "error":
        child.emit("error", new Error("spawn blew up"));
        break;
      case "exit0":
        child.emit("exit", 0, null);
        break;
      case "exit3":
        child.emit("exit", 3, null);
        break;
      case "signal":
        child.emit("exit", null, "SIGKILL");
        break;
    }
    const result = await pending;
    if (row.errorContains) expect(result.error).toContain(row.errorContains);
    else expect(result.error).toBeUndefined();
    expect(exits).toBe(row.exits);
  });
});
