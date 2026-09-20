/**
 * The toolchain-backed half of the polyglot adoption matrix (#0452).
 *
 * Hermetic tests prove the *decisions* — which plan a stack resolves to, how a
 * missing tool is diagnosed. These tests prove the fixtures are real: when the
 * stack's own toolchain is installed, its declared commands actually build and
 * test the materialized project. That catches environment, PATH and cwd
 * assumptions a plan-only test cannot.
 *
 * They are deliberately self-skipping. `bun run test` on a laptop without
 * Rust, Gradle or an Android SDK stays green and fast; each missing tool is
 * reported once so the skip is never silent. The `scheduled` tier (Gradle)
 * only runs when `REPOOS_ADOPTION_SCHEDULED=1`, which the dedicated CI job
 * sets — heavier jobs are labelled rather than forced on every run.
 */
import { afterEach, describe, expect, it } from "vitest";
import { hasBinary, runCommand } from "../../core/check-runner.js";
import {
  ADOPTION_FIXTURES,
  materializeFixture,
  type AdoptionFixture,
} from "./adoption/fixtures.js";
import { newFixtureDir, removeFixtureDir } from "./adoption/harness.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) removeFixtureDir(root);
});

/** A scheduled-tier check also needs the explicit CI opt-in. */
function shouldRun(fixture: AdoptionFixture, tool: string): boolean {
  if (!hasBinary(tool)) return false;
  if (fixture.toolchainTier === "scheduled" && process.env.REPOOS_ADOPTION_SCHEDULED !== "1") {
    return false;
  }
  return true;
}

describe("adoption matrix — toolchain-backed checks", () => {
  it("reports toolchains that are unavailable here so skips are never silent", () => {
    const missing = new Set<string>();
    for (const fixture of ADOPTION_FIXTURES) {
      for (const check of fixture.toolchainChecks) {
        if (!shouldRun(fixture, check.tool)) missing.add(check.tool);
      }
    }
    if (missing.size > 0) {
      console.log(
        `adoption matrix: skipping toolchain checks that need [${[...missing].sort().join(", ")}] — install them (or run the CI matrix) to exercise those fixtures`,
      );
    }
    expect(Array.isArray([...missing])).toBe(true);
  });
});

for (const fixture of ADOPTION_FIXTURES) {
  if (fixture.toolchainChecks.length === 0) continue;
  describe(`toolchain · ${fixture.id} · ${fixture.stack}`, () => {
    for (const check of fixture.toolchainChecks) {
      it.runIf(shouldRun(fixture, check.tool))(
        `${check.label} · ${check.command}`,
        async () => {
          const root = newFixtureDir(`repoos-adopt-toolchain-${fixture.id}-`);
          roots.push(root);
          materializeFixture(fixture.id, root);
          const result = await runCommand({
            command: check.command,
            cwd: root,
            timeoutMs: 240_000,
            echo: false,
          });
          expect(result.status, result.output.slice(-4000)).toBe("passed");
        },
        300_000,
      );
    }
  });
}
