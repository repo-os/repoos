import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  detectAgents,
  isAppBundleBinary,
  isDesktopOutputSignature,
  resolveBinary,
  type KnownAgent,
} from "../../core/detect";
import { startServer } from "../../server/server";

const FIXTURE_AGENTS: KnownAgent[] = [
  { id: "opencode", name: "opencode", binary: "opencode", drivable: true, installHint: "npm i -g opencode-ai" },
  { id: "claude-code", name: "claude code", binary: "claude", drivable: true, installHint: "npm i -g @anthropic-ai/claude-code" },
  { id: "qwen-code", name: "qwen code", binary: "qwen", drivable: false, installHint: "npm i -g @qwen-code/qwen-code" },
];

const tmpRoots: string[] = [];
afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-detect-"));
  tmpRoots.push(dir);
  return dir;
}

function makeBin(dir: string, name: string, body = "#!/bin/sh\necho 'fixture 1.0.0'\n"): string {
  const p = join(dir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(p, body, { mode: 0o755 });
  return p;
}

describe("resolveBinary", () => {
  it("finds the first executable match in PATH order", () => {
    const root = tmpDir();
    makeBin(join(root, "a"), "claude", "#!/bin/sh\necho 'a'\n");
    makeBin(join(root, "b"), "claude", "#!/bin/sh\necho 'b'\n");
    expect(resolveBinary("claude", [join(root, "b"), join(root, "a")].join(delimiter))).toBe(
      join(root, "b", "claude"),
    );
  });

  it("skips non-executable files and empty PATH entries", () => {
    const root = tmpDir();
    writeFileSync(join(root, "claude"), "#!/bin/sh\n", { mode: 0o644 });
    expect(resolveBinary("claude", `${delimiter}${root}${delimiter}missing-dir`)).toBeNull();
  });

  it("returns null when the binary is not on PATH", () => {
    expect(resolveBinary("does-not-exist-xyz", tmpDir())).toBeNull();
  });
});

describe("isAppBundleBinary", () => {
  it("detects a binary inside a macOS .app bundle", () => {
    expect(
      isAppBundleBinary("/Applications/Opencode.app/Contents/MacOS/opencode"),
    ).toBe(true);
    expect(
      isAppBundleBinary(join(tmpDir(), "Test.app", "Contents", "MacOS", "claude")),
    ).toBe(true);
  });

  it("does not flag plain installs", () => {
    expect(isAppBundleBinary("/usr/local/bin/opencode")).toBe(false);
    expect(isAppBundleBinary("/Users/me/.local/share/mise/shims/opencode")).toBe(false);
  });
});

describe("isDesktopOutputSignature", () => {
  it("flags a desktop relaunch signature in --version output", () => {
    expect(isDesktopOutputSignature("relaunching the desktop app")).toBe(true);
    expect(isDesktopOutputSignature("v1.2.3 (desktop application)")).toBe(true);
  });

  it("accepts a normal version string", () => {
    expect(isDesktopOutputSignature("opencode v0.3.0")).toBe(false);
    expect(isDesktopOutputSignature(null)).toBe(false);
  });
});

describe("detectAgents", () => {
  it("reports installed, version-carrying headless binaries", async () => {
    const root = tmpDir();
    makeBin(join(root, "bin"), "opencode", "#!/bin/sh\necho 'opencode v0.3.0'\n");
    const rows = await detectAgents({
      pathEnv: join(root, "bin"),
      agents: FIXTURE_AGENTS,
      // Generous probe timeout: a real spawn on a busy machine must not be
      // killed by the production 1.5s default mid-boot (the 0076 flake).
      versionTimeoutMs: 10_000,
    });

    const opencode = rows.find((a) => a.id === "opencode");
    expect(opencode?.installed).toBe(true);
    expect(opencode?.headless).toBe(true);
    expect(opencode?.path).toBe(join(root, "bin", "opencode"));
    expect(opencode?.version).toContain("opencode");
    expect(opencode?.drivable).toBe(true);
  });

  it("marks a binary inside a fake Contents/MacOS tree as desktop-only", async () => {
    const root = tmpDir();
    const macosDir = join(root, "bin", "Test.app", "Contents", "MacOS");
    makeBin(macosDir, "claude");
    const rows = await detectAgents({ pathEnv: macosDir, agents: FIXTURE_AGENTS });

    const claude = rows.find((a) => a.id === "claude-code");
    expect(claude?.installed).toBe(true);
    expect(claude?.headless).toBe(false);
    // A desktop-app binary is never spawned for a version probe.
    expect(claude?.version).toBeNull();
    expect(claude?.path).toBe(join(macosDir, "claude"));
  });

  it("reports missing binaries as not installed", async () => {
    const rows = await detectAgents({ pathEnv: tmpDir(), agents: FIXTURE_AGENTS });

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.installed).toBe(false);
      expect(row.path).toBeNull();
      expect(row.version).toBeNull();
      expect(row.headless).toBeNull();
      expect(row.installHint.length).toBeGreaterThan(0);
    }
  });

  it("never throws on broken PATH entries", async () => {
    const broken = `${join(tmpDir(), "nope")}${delimiter}${delimiter}/nonexistent${delimiter}`;
    const rows = await detectAgents({ pathEnv: broken, agents: FIXTURE_AGENTS });
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.installed).toBe(false);
  });

  it("treats a hung version probe as a missing version instead of failing", async () => {
    const root = tmpDir();
    makeBin(join(root, "bin"), "qwen", "#!/bin/sh\nexec sleep 30\n");
    const rows = await detectAgents({
      pathEnv: join(root, "bin"),
      agents: FIXTURE_AGENTS,
      versionTimeoutMs: 100,
    });
    const qwen = rows.find((a) => a.id === "qwen-code");
    expect(qwen?.installed).toBe(true);
    expect(qwen?.version).toBeNull();
    expect(qwen?.headless).toBe(true);
  });
});

describe("GET /api/agents/detect", () => {
  it("returns detection rows and never breaks on a broken PATH", async () => {
    const root = tmpDir();
    makeBin(join(root, "bin"), "opencode", "#!/bin/sh\necho 'opencode v0.3.0'\n");
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    const oldPath = process.env.PATH;
    try {
      process.env.PATH = `${join(root, "bin")}${delimiter}${join(root, "missing")}`;
      const res = await fetch(`${server.url}/api/agents/detect`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { agents: { id: string; installed: boolean }[] };
      expect(Array.isArray(body.agents)).toBe(true);
      const opencode = body.agents.find((a) => a.id === "opencode");
      expect(opencode?.installed).toBe(true);
    } finally {
      process.env.PATH = oldPath;
      await server.close();
    }
  });
});
