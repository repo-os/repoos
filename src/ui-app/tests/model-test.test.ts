import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MODEL_TEST_TIMEOUTS,
  MODEL_TEST_TIMEOUT_MS,
  modelTestTimeoutMs,
  sanitizeDiagnostic,
  testModelCombination,
  testModelCombinations,
} from "../../server/model-test";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeOpenCode(body: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-model-test-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "opencode"), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return { root, path: `${bin}:${process.env.PATH ?? ""}` };
}

function fakeCodex(body: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-model-test-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "codex"), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return { root, path: `${bin}:${process.env.PATH ?? ""}` };
}

describe("model compatibility runner", () => {
  it("uses an 8-second cloud probe ceiling", () => {
    expect(MODEL_TEST_TIMEOUT_MS).toBe(8000);
  });

  it("tests exactly one requested combination", async () => {
    const fixture = fakeOpenCode("echo REPOOS_MODEL_OK");
    const old = process.env.PATH;
    process.env.PATH = fixture.path;
    try {
      const result = await testModelCombination("opencode", "provider/only-this", {
        cwd: fixture.root,
        timeoutMs: 5000,
      });
      expect(result).toMatchObject({
        cli: "opencode",
        model: "provider/only-this",
        status: "passed",
      });
    } finally {
      process.env.PATH = old;
    }
  });

  it("bypasses Codex's trusted-directory preflight for the probe", async () => {
    const fixture = fakeCodex(
      'case "$*" in *--skip-git-repo-check*) echo REPOOS_MODEL_OK;; *) echo "missing trust flag" >&2; exit 2;; esac',
    );
    const old = process.env.PATH;
    process.env.PATH = fixture.path;
    try {
      const result = await testModelCombination("codex", "gpt-5.6-luna", {
        cwd: fixture.root,
        timeoutMs: 5000,
      });
      expect(result.status).toBe("passed");
    } finally {
      process.env.PATH = old;
    }
  });

  it("reports success and failure independently", async () => {
    const fixture = fakeOpenCode(
      'case "$*" in *bad*) echo "denied" >&2; exit 2;; *) echo REPOOS_MODEL_OK;; esac',
    );
    const old = process.env.PATH;
    process.env.PATH = fixture.path;
    try {
      const results = await testModelCombinations(
        { opencode: { supported: true, refreshable: true, models: ["default", "bad"] } },
        { cwd: fixture.root, concurrency: 2, timeoutMs: 5000 },
      );
      expect(results.find((r) => r.model === "default")?.status).toBe("passed");
      expect(results.find((r) => r.model === "bad")?.status).toBe("failed");
      expect(results.find((r) => r.model === "bad")?.error).toContain("denied");
    } finally {
      process.env.PATH = old;
    }
  });

  it("marks unsupported sources without spawning them", async () => {
    const results = await testModelCombinations(
      { "claude code": { supported: false, refreshable: false, models: [] } },
      { cwd: process.cwd() },
    );
    expect(results).toEqual([
      { cli: "claude code", model: "default", status: "not_testable", durationMs: 0 },
    ]);
  });

  it("strips ANSI and control characters from bounded diagnostics", () => {
    expect(sanitizeDiagnostic("\u001b[31mnope\u001b[0m\u0000")).toBe("nope");
    expect(sanitizeDiagnostic("x".repeat(10_000))).toHaveLength(4096);
  });

  it("uses a per-CLI probe ceiling with the 8 s fallback (#0677)", () => {
    expect(modelTestTimeoutMs("cursor")).toBe(30_000);
    expect(modelTestTimeoutMs("codex")).toBe(25_000);
    expect(modelTestTimeoutMs("kilo")).toBe(MODEL_TEST_TIMEOUT_MS);
    // The calibrated values exist for every driver the probe can spawn.
    expect(Object.keys(MODEL_TEST_TIMEOUTS).length).toBeGreaterThan(0);
  });

  it("surfaces the failing line, not the stream head (#0677)", async () => {
    // The stream starts with a big JSON blob (what the old 4 KB truncation
    // showed) and only reveals the cause on its final line.
    const blob = JSON.stringify({ type: "step_start", pad: "x".repeat(6000) });
    const fixture = fakeOpenCode(
      `echo '${blob}'; echo "Error: Model unavailable: opencode/mimo-v2.6-flash-free"; exit 1`,
    );
    const old = process.env.PATH;
    process.env.PATH = fixture.path;
    try {
      const result = await testModelCombination("opencode", "mimo-v2.6-flash-free", {
        cwd: fixture.root,
        timeoutMs: 5000,
      });
      expect(result.status).toBe("failed");
      expect(result.error).toContain("Model unavailable: opencode/mimo-v2.6-flash-free");
    } finally {
      process.env.PATH = old;
    }
  });

  it("distinguishes a cold start (no output) from a slow failure (#0677)", async () => {
    // Prints nothing and never exits: the probe times out without a token.
    const fixture = fakeOpenCode("exec sleep 5");
    const old = process.env.PATH;
    process.env.PATH = fixture.path;
    try {
      const result = await testModelCombination("opencode", "slow-start", {
        cwd: fixture.root,
        timeoutMs: 300,
      });
      expect(result.status).toBe("cold_start");
      expect(result.error).toMatch(/cold start/i);
    } finally {
      process.env.PATH = old;
    }
  });
});
