/**
 * `repoos check`'s UI smoke step is per-project and opt-in (#0348). The
 * resolver decides between a `repoos.toml` `[check] uiSmoke` command (which
 * wins), a `smoke` package.json script (zero-config default), and nothing
 * (the caller skips cleanly). RepoOS dogfoods the script path; the last describe
 * block guards that its own `smoke` declaration doesn't go missing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveSmokeCommand, UI_SMOKE_SCRIPT } from "../../commands/check.js";
import { loadConfig } from "../../core/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmpRepo(toml = ""): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-check-smoke-"));
  roots.push(d);
  writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

describe("resolveSmokeCommand — check's UI smoke opt-in", () => {
  it("is null when neither config nor a smoke script is declared", () => {
    expect(resolveSmokeCommand(undefined, undefined)).toBeNull();
    expect(resolveSmokeCommand(undefined, { test: "vitest" })).toBeNull();
    expect(resolveSmokeCommand("", {})).toBeNull();
  });

  it("uses the well-known package.json script when no config is set", () => {
    expect(resolveSmokeCommand(undefined, { [UI_SMOKE_SCRIPT]: "playwright test" })).toEqual({
      source: "script",
      script: "smoke",
    });
  });

  it("lets repoos.toml [check] uiSmoke override the package.json script", () => {
    expect(
      resolveSmokeCommand("bun run custom-smoke", { [UI_SMOKE_SCRIPT]: "playwright test" }),
    ).toEqual({ source: "config", command: "bun run custom-smoke" });
  });

  it("trims a configured command and treats whitespace-only as unset", () => {
    expect(resolveSmokeCommand("  bun run smoke  ", undefined)).toEqual({
      source: "config",
      command: "bun run smoke",
    });
    expect(resolveSmokeCommand("   ", { [UI_SMOKE_SCRIPT]: "x" })).toEqual({
      source: "script",
      script: "smoke",
    });
  });
});

describe("loadConfig [check] uiSmoke parsing", () => {
  it("reads the uiSmoke command", () => {
    expect(loadConfig(tmpRepo('[check]\nuiSmoke = "bun run smoke"\n')).check?.uiSmoke).toBe(
      "bun run smoke",
    );
  });

  it("accepts the plural [checks] spelling used in the task prose", () => {
    expect(loadConfig(tmpRepo('[checks]\nuiSmoke = "bun run smoke"\n')).check?.uiSmoke).toBe(
      "bun run smoke",
    );
  });

  it("is undefined when unset or empty", () => {
    expect(loadConfig(tmpRepo("")).check?.uiSmoke).toBeUndefined();
    expect(loadConfig(tmpRepo('[check]\nuiSmoke = ""\n')).check?.uiSmoke).toBeUndefined();
  });
});

describe("RepoOS dogfoods the smoke declaration", () => {
  // There is no pkg.name === "repoos" fallback any more, so losing this
  // declaration would silently turn RepoOS's own UI smoke step into a skip.
  it("declares its dashboard smoke test through the generic mechanism", () => {
    const root = resolve(__dirname, "../../..");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(resolveSmokeCommand(loadConfig(root).check?.uiSmoke, pkg.scripts)).not.toBeNull();
    expect(pkg.scripts[UI_SMOKE_SCRIPT]).toContain("scripts/ui-smoke.mjs");
  });
});
