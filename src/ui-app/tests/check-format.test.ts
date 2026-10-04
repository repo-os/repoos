/**
 * #0651 — the format FIXER that `repoos check --fix` and handoff auto-format
 * both use. The fix command must come from the plan (`fix = "..."`) or the
 * conventional `fmt` script of a `kind = "format"` step — never a
 * RepoOS-shaped command invented in the server.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { formatFixCommand, runFormatFixes } from "../../core/check-format.js";
import { resolveCheckPlan } from "../../core/check-plan.js";
import { detectRepoMarkers } from "../../core/check-runner.js";

const dirs: string[] = [];
const originalPath = process.env.PATH ?? "";

afterEach(() => {
  process.env.PATH = originalPath;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function planFor(root: string) {
  return resolveCheckPlan({
    check: loadConfig(root).check,
    markers: detectRepoMarkers(root),
    bunRunner: true,
  });
}

describe("formatFixCommand (#0651)", () => {
  it("prefers an explicit `fix` on the step", () => {
    const root = tmp("repoos-fmt-");
    writeFileSync(
      join(root, "repoos.toml"),
      '[check]\nversion = 1\n\n[[check.steps]]\nname = "fmt"\ncommand = "cargo fmt --check"\nfix = "cargo fmt"\n',
    );
    const plan = planFor(root);
    expect(formatFixCommand(plan.steps[0], root)).toBe("cargo fmt");
  });

  it("derives the fmt script for a kind=format step, and nothing for a raw command", () => {
    const root = tmp("repoos-fmt-");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "x", scripts: { fmt: "oxfmt", "fmt:check": "oxfmt --check" } }),
    );
    writeFileSync(join(root, "bun.lock"), "");
    writeFileSync(
      join(root, "repoos.toml"),
      '[check]\nversion = 1\n\n[[check.steps]]\nname = "check-fmt:check"\nkind = "format"\n\n[[check.steps]]\nname = "other"\ncommand = "cargo fmt --check"\n',
    );
    const plan = planFor(root);
    expect(formatFixCommand(plan.steps[0], root)).toMatch(/^bun run fmt$/);
    // A raw command step has no fixer to guess — it needs `fix = "..."`.
    expect(formatFixCommand(plan.steps[1], root)).toBeNull();
  });

  it("returns null for a kind=format step with no fmt script", () => {
    const root = tmp("repoos-fmt-");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "x", scripts: { "fmt:check": "oxfmt --check" } }),
    );
    writeFileSync(
      join(root, "repoos.toml"),
      '[check]\nversion = 1\n\n[[check.steps]]\nname = "check-fmt:check"\nkind = "format"\n',
    );
    expect(formatFixCommand(planFor(root).steps[0], root)).toBeNull();
  });
});

describe("runFormatFixes (#0651)", () => {
  function fixture(exitCode: number): { root: string; log: string } {
    const root = tmp("repoos-fmt-run-");
    const binDir = tmp("repoos-fmt-bin-");
    const log = join(binDir, "calls.log");
    writeFileSync(
      join(binDir, "bun"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nexit ${exitCode}\n`,
    );
    chmodSync(join(binDir, "bun"), 0o755);
    process.env.PATH = `${binDir}:${originalPath}`;
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "x", scripts: { fmt: "oxfmt", "fmt:check": "oxfmt --check" } }),
    );
    writeFileSync(join(root, "bun.lock"), "");
    writeFileSync(
      join(root, "repoos.toml"),
      '[check]\nversion = 1\n\n[[check.steps]]\nname = "check-fmt:check"\nkind = "format"\n',
    );
    return { root, log };
  }

  it("runs the plan's format fixer and reports success", async () => {
    const { root, log } = fixture(0);
    const report = await runFormatFixes(root, loadConfig(root));
    expect(report.commands).toEqual(["bun run fmt"]);
    expect(report.failures).toEqual([]);
    expect(readFileSync(log, "utf8")).toContain("run fmt");
  });

  it("reports a fixer that exits non-zero instead of throwing", async () => {
    const { root, log } = fixture(1);
    const report = await runFormatFixes(root, loadConfig(root));
    expect(report.commands).toEqual(["bun run fmt"]);
    expect(report.failures.map((f) => f.command)).toEqual(["bun run fmt"]);
    expect(readFileSync(log, "utf8")).toContain("run fmt");
  });

  it("is a no-op for a repo whose config has no check plan", async () => {
    const root = tmp("repoos-fmt-none-");
    const report = await runFormatFixes(root, loadConfig(root));
    expect(report).toEqual({ commands: [], failures: [] });
  });
});
