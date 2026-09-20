/**
 * The `repoos doctor` contract in the adoption matrix (#0452, depends on #0451).
 *
 * #0451 is a staged dependency — the matrix must not hand-wave it away, and it
 * must not hard-fail before the command exists either. So this file is written
 * to *activate* the moment doctor lands:
 *
 * - While no doctor implementation is present, the contract suite is skipped
 *   and an always-on test records that the dependency is still pending, so the
 *   gap is visible in the suite rather than forgotten.
 * - Once `repoos doctor --json` exists, the suite scaffolds each fixture and
 *   asserts the report classifies every finding into a clean/warn/fail-style
 *   severity — the categories #0451 promises the UI and support bundle.
 *
 * Detection is by source file, not import: importing a module that does not
 * exist yet would break type-checking and this whole task's gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scaffoldInto } from "../../commands/init.js";
import { findRepoRoot } from "../../core/config.js";
import { ADOPTION_FIXTURES, materializeFixture } from "./adoption/fixtures.js";
import { newFixtureDir, removeFixtureDir } from "./adoption/harness.js";

const REPO_ROOT = findRepoRoot(process.cwd());
const CLI_PATH = join(REPO_ROOT, "dist/cli/index.js");

function doctorSourcePresent(): boolean {
  return (
    existsSync(join(REPO_ROOT, "src/commands/doctor.ts")) ||
    existsSync(join(REPO_ROOT, "src/core/doctor.ts"))
  );
}

/** Doctor can be exercised only when both the source and a built CLI exist. */
const DOCTOR_AVAILABLE = doctorSourcePresent() && existsSync(CLI_PATH);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) removeFixtureDir(root);
});

/**
 * Every finding the doctor report contains must carry a severity in one of the
 * three categories the UX promises. The exact shape above that is #0451's to
 * define; this walks the parsed JSON for severity-bearing objects.
 */
function severitiesIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) severitiesIn(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "severity" && typeof child === "string") out.push(child.toLowerCase());
      else severitiesIn(child, out);
    }
  }
  return out;
}

describe("adoption matrix — repoos doctor (#0451)", () => {
  it("records doctor as a staged dependency until the command exists", () => {
    if (DOCTOR_AVAILABLE) return;
    // The matrix doc must name the dependency so it is not silently dropped.
    const doc = readFileSync(join(REPO_ROOT, "docs/adoption-matrix.md"), "utf8");
    expect(doc).toMatch(/#0451/);
    expect(doc.toLowerCase()).toContain("doctor");
  });

  describe.runIf(DOCTOR_AVAILABLE)("repoos doctor --json", () => {
    for (const fixture of ADOPTION_FIXTURES) {
      it(`classifies ${fixture.id} with clean/warn/fail severities`, () => {
        const root = newFixtureDir(`repoos-adopt-doctor-${fixture.id}-`);
        roots.push(root);
        materializeFixture(fixture.id, root);
        scaffoldInto(root, "", "", fixture.kind);
        mkdirSync(join(root, "work"), { recursive: true });
        writeFileSync(join(root, "work/0001-placeholder.md"), "---\nid: '0001'\n---\n");

        const run = spawnSync(process.execPath, [CLI_PATH, "doctor", "--json"], {
          cwd: root,
          encoding: "utf8",
          timeout: 120_000,
        });
        expect(run.status, run.stderr || run.stdout).toBe(0);

        let parsed: unknown;
        expect(
          () => {
            parsed = JSON.parse(run.stdout);
          },
          `doctor --json must emit JSON, got: ${run.stdout.slice(0, 400)}`,
        ).not.toThrow();

        const severities = severitiesIn(parsed);
        expect(severities.length, "doctor reported at least one finding").toBeGreaterThan(0);
        for (const severity of severities) {
          expect(["pass", "ok", "info", "warn", "warning", "fail", "error"]).toContain(severity);
        }
      });
    }
  });
});
