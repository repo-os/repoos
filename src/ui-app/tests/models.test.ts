/**
 * Tests for the per-CLI model sources (0060). Unit-tests the parser, exercises
 * the opencode adapter against a fake `opencode` binary that records its argv
 * (with and without `--refresh`), and verifies `/api/models` + the relaxed
 * save validation.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { parseLiveModels, MODEL_SOURCES, listModelSources } from "../../core/models";
import { AGENT_MODELS } from "../../core/config";
import { startServer } from "../../server/server";

/** Fake `opencode`: records its argv to a log, prints env-provided models. */
const FAKEBIN = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write(process.env.REPOOS_FAKE_MODELS || "opencode/big-pickle\\nopencode/deepseek-v4-flash-free\\n");
`;

const FAKE_CODEX = `#!/usr/bin/env node
let pending = "";
process.stdin.on("data", (chunk) => {
  pending += chunk;
  if (!pending.includes('"model/list"')) return;
  process.stdout.write(JSON.stringify({ id: 1, result: { userAgent: "fake" } }) + "\\n");
  process.stdout.write(JSON.stringify({ id: 2, result: { data: [
    { model: "gpt-5.6-sol" }, { model: "gpt-5.6-terra" }
  ], nextCursor: null } }) + "\\n");
});
`;

const tmpRoots: string[] = [];
afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  delete process.env.REPOOS_FAKEBIN_LOG;
  delete process.env.REPOOS_FAKE_MODELS;
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-models-"));
  tmpRoots.push(dir);
  return dir;
}

interface Fixture {
  bin: string;
  log: string;
}

function makeFixture(): Fixture {
  const root = tmpDir();
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode"), FAKEBIN, { mode: 0o755 });
  writeFileSync(join(bin, "codex"), FAKE_CODEX, { mode: 0o755 });
  writeFileSync(join(bin, "claude"), "#!/bin/sh\necho REPOOS_MODEL_OK\n", { mode: 0o755 });
  return { bin, log: join(root, "spawns.log") };
}

function spawnArgs(fx: Fixture): string[][] {
  const text = readFileSync(fx.log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((l) => JSON.parse(l) as string[]);
}

/** Set PATH exactly (used when a binary must be MISSING — opencode absent). */
function withPath(p: string): string {
  const old = process.env.PATH ?? "";
  process.env.PATH = p;
  return old;
}

/** Prepend a dir to PATH so a fixture bin wins while `env node` still works. */
function prependPath(p: string): string {
  const old = process.env.PATH ?? "";
  process.env.PATH = `${p}${delimiter}${old}`;
  return old;
}

describe("parseLiveModels", () => {
  it("parses provider/model lines, sorted and unique", () => {
    expect(
      parseLiveModels(
        "openai/gpt-4o\nanthropic/claude-sonnet-4\nopenai/gpt-4o\nopencode/big-pickle\n",
      ),
    ).toEqual(["anthropic/claude-sonnet-4", "openai/gpt-4o", "opencode/big-pickle"]);
  });

  it("drops headers, help text, and ANSI noise", () => {
    expect(
      parseLiveModels(
        "Usage: opencode models [provider]\n\ntext without a slash is skipped\nprovider/model\n\u001b[32mok\u001b[0m\n",
      ),
    ).toEqual(["provider/model"]);
  });

  it("drops overlong ids", () => {
    expect(parseLiveModels(`opencode/${"x".repeat(200)}\nopencode/ok\n`)).toEqual(["opencode/ok"]);
  });
});

describe("MODEL_SOURCES registry", () => {
  it("keys adapters by Agent.cli", () => {
    expect(Object.keys(MODEL_SOURCES)).toEqual(
      expect.arrayContaining(["opencode", "claude code", "qwen code", "codex", "github copilot"]),
    );
  });

  it("implements opencode and codex and stubs the rest", () => {
    expect(MODEL_SOURCES.opencode.supported).toBe(true);
    expect(MODEL_SOURCES["claude code"].supported).toBe(false);
    expect(MODEL_SOURCES.codex.supported).toBe(true);
    expect(MODEL_SOURCES["github copilot"].supported).toBe(true);
  });
});

describe("codex adapter", () => {
  it("reads the account-specific model picker catalog from app-server", async () => {
    const fx = makeFixture();
    const old = prependPath(fx.bin);
    try {
      const res = await listModelSources({ cwd: tmpDir() });
      expect(res.codex).toEqual({
        supported: true,
        models: ["default", "gpt-5.6-sol", "gpt-5.6-terra"],
        refreshable: true,
      });
    } finally {
      process.env.PATH = old;
    }
  });
});

describe("opencode adapter", () => {
  it("spawns `opencode models` and returns 'default' + parsed models", async () => {
    const fx = makeFixture();
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKE_MODELS = "opencode/big-pickle\nopenai/gpt-4o\n";
    const old = prependPath(fx.bin);
    try {
      const res = await listModelSources({ cwd: tmpDir() });
      expect(res.opencode).toEqual({
        supported: true,
        models: ["default", "openai/gpt-4o", "opencode/big-pickle"],
        refreshable: true,
      });
      expect(spawnArgs(fx)).toEqual([["models"]]);
    } finally {
      process.env.PATH = old;
    }
  });

  it("spawns `opencode models --refresh` when refresh is requested", async () => {
    const fx = makeFixture();
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const old = prependPath(fx.bin);
    try {
      await listModelSources({ refresh: true, cwd: tmpDir() });
      expect(spawnArgs(fx)).toEqual([["models", "--refresh"]]);
    } finally {
      process.env.PATH = old;
    }
  });

  it("returns empty models (fail-soft) when opencode is missing", async () => {
    const old = withPath(join(tmpDir(), "empty"));
    try {
      const res = await listModelSources({ cwd: tmpDir() });
      expect(res.opencode.models).toEqual(["default"]);
    } finally {
      process.env.PATH = old;
    }
  });

  it("returns only 'default' instead of hanging when the probe times out", async () => {
    const root = tmpDir();
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "opencode"), "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });
    const old = withPath(bin);
    try {
      const res = await listModelSources({ cwd: tmpDir() });
      expect(res.opencode.models).toEqual(["default"]);
    } finally {
      process.env.PATH = old;
    }
  });
});

describe("GET /api/models", () => {
  it("returns byCli with live opencode models and supported:false stubs", async () => {
    const root = tmpDir();
    const fx = makeFixture();
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKE_MODELS = "opencode/big-pickle\n";
    const old = prependPath(fx.bin);
    try {
      const server = await startServer({ root, host: "127.0.0.1", port: 0 });
      try {
        const res = await fetch(`${server.url}/api/models`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          byCli: Record<string, { supported: boolean; models: string[]; refreshable: boolean }>;
          at: string;
        };
        expect(body.byCli.opencode).toEqual({
          supported: true,
          models: ["default", "opencode/big-pickle"],
          refreshable: true,
        });
        expect(body.byCli["claude code"]).toEqual({
          supported: false,
          models: [],
          refreshable: false,
        });
        expect(typeof body.at).toBe("string");
      } finally {
        await server.close();
      }
    } finally {
      process.env.PATH = old;
    }
  });

  it("still returns 200 when no opencode is on PATH", async () => {
    const root = tmpDir();
    const old = withPath(join(tmpDir(), "empty"));
    try {
      const server = await startServer({ root, host: "127.0.0.1", port: 0 });
      try {
        const res = await fetch(`${server.url}/api/models?refresh=1`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { byCli: Record<string, { models: string[] }> };
        expect(body.byCli.opencode.models).toEqual(["default"]);
      } finally {
        await server.close();
      }
    } finally {
      process.env.PATH = old;
    }
  });
});

describe("POST /api/models/test", () => {
  it("probes a selected pair even when its CLI cannot discover models", async () => {
    const root = tmpDir();
    const fx = makeFixture();
    const old = prependPath(fx.bin);
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${server.url}/api/models/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: "claude code", model: "default" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { result: { cli: string; model: string; status: string } };
      expect(body.result).toEqual({
        cli: "claude code",
        model: "default",
        status: "passed",
        durationMs: expect.any(Number),
      });
    } finally {
      await server.close();
      process.env.PATH = old;
    }
  });

  it("rejects the removed bulk matrix request shape", async () => {
    const server = await startServer({ root: tmpDir(), host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${server.url}/api/models/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ byCli: { opencode: ["default", "provider/model"] } }),
      });
      expect(res.status).toBe(400);
    } finally {
      await server.close();
    }
  });
});

describe("PATCH /api/config agents validation", () => {
  it("accepts any non-empty model string (static or live)", async () => {
    const root = tmpDir();
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      for (const model of ["default", "big pickle", "opencode/big-pickle"]) {
        const res = await fetch(`${server.url}/api/config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agents: [{ name: "engineer", cli: "opencode", model, enabled: true }],
          }),
        });
        expect(res.status).toBe(200);
      }
    } finally {
      await server.close();
    }
  });

  it("rejects a missing or empty model", async () => {
    const root = tmpDir();
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${server.url}/api/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agents: [{ name: "engineer", cli: "opencode", model: "  ", enabled: true }],
        }),
      });
      expect(res.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("still serves AGENT_MODELS as the fallback in agentsMeta.models", async () => {
    const root = tmpDir();
    const server = await startServer({ root, host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${server.url}/api/config`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { agentsMeta: { models: string[] } };
      expect(body.agentsMeta.models).toEqual([...AGENT_MODELS]);
    } finally {
      await server.close();
    }
  });
});
