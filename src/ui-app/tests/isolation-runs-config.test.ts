/**
 * `check.isolationRuns` (#0655) — the flake-triage re-run count. It is a
 * user-facing feature setting, so it has a Settings control (Advanced) and the
 * parser clamps it to a sane range rather than accepting a typo that would
 * loop a failed gate for hours.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function repo(toml: string): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-isolation-runs-"));
  roots.push(d);
  writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

describe("check.isolationRuns config (#0655)", () => {
  it("defaults to 3", () => {
    expect(loadConfig(repo("[check]\nversion = 1\n")).check?.isolationRuns).toBe(3);
  });

  it("accepts a whole number in range, including 0 to disable", () => {
    expect(loadConfig(repo("[check]\nversion = 1\nisolationRuns = 5\n")).check?.isolationRuns).toBe(
      5,
    );
    expect(loadConfig(repo("[check]\nversion = 1\nisolationRuns = 0\n")).check?.isolationRuns).toBe(
      0,
    );
  });

  it("ignores out-of-range, fractional or non-numeric values, keeping the default", () => {
    for (const bad of ["11", "1.5", "-1", '"3"']) {
      expect(
        loadConfig(repo(`[check]\nversion = 1\nisolationRuns = ${bad}\n`)).check?.isolationRuns,
      ).toBe(3);
    }
  });

  it("exposes a guarded number field in the Settings schema", () => {
    const field = getConfigSchema().find((f) => f.key === "check.isolationRuns");
    expect(field).toMatchObject({ type: "number", tier: "guarded", default: 3 });
    expect(field?.description).toMatch(/never turns a failed gate green|informational/i);
  });
});
