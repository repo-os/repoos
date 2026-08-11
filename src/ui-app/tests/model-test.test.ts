import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeDiagnostic, testModelCombinations } from "../../server/model-test";

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

describe("model compatibility runner", () => {
  it("reports success and failure independently", async () => {
    const fixture = fakeOpenCode('case "$*" in *bad*) echo "denied" >&2; exit 2;; *) echo REPOOS_MODEL_OK;; esac');
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
    expect(results).toEqual([{ cli: "claude code", model: "default", status: "not_testable", durationMs: 0 }]);
  });

  it("strips ANSI and control characters from bounded diagnostics", () => {
    expect(sanitizeDiagnostic("\u001b[31mnope\u001b[0m\u0000")).toBe("nope");
    expect(sanitizeDiagnostic("x".repeat(10_000))).toHaveLength(4096);
  });
});
