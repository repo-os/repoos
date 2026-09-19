/**
 * #0428 — close-out failure reasons must name the failing check, not the tail
 * of the combined output.
 *
 * These tests pin the parse of the gate's own `── Results ──` block and the
 * summary built from it: a formatting failure buried under noisy stderr still
 * yields a reason that names `check-fmt:check` and the offending file, and
 * checks skipped because of an earlier failure are shown as skipped.
 */
import { describe, expect, it } from "vitest";
import {
  checkFailureSignature,
  parseCheckResults,
  summarizeCheckOutput,
} from "../../core/check-results.js";

const RED = "\u001b[31m";
const GREEN = "\u001b[32m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

/** A realistic `repoos check` run whose only failure is `oxfmt --check`. */
const FMT_FAILURE_OUTPUT = [
  `${DIM}  ◆ Formatting & lint guard${RESET}`,
  `${RED}  ✗ Formatting check failed — run \`bun run fmt\` to fix${RESET}`,
  `${DIM}  ◆ Full build${RESET}`,
  `${DIM}  · Skipped — formatting/lint failed above; fix that first${RESET}`,
  `${DIM}  ◆ Tests${RESET}`,
  `${DIM}  · Skipped — formatting/lint failed above, so build was skipped too${RESET}`,
  "",
  `${DIM}  ── Results ──${RESET}`,
  `${GREEN}  ✔ staleness${RESET}`,
  `  ✔ lockfile-sync  ${DIM}— skipped — no bun.lock${RESET}`,
  `${GREEN}  ✔ zero-runtime-deps${RESET}`,
  `  ${RED}✗ check-fmt:check${RESET}  ${DIM}— Formatting check failed — run \`bun run fmt\` to fix:${RESET}`,
  "Checking formatting...",
  "",
  "src/ui-app/src/style.css (12ms)",
  "",
  "Format issues found in above 1 files. Run without `--check` to fix.",
  "Finished in 40ms on 1 files using 10 threads.",
  `  ${GREEN}✔ build${RESET}  ${DIM}— skipped — formatting/lint failed, fix and rerun${RESET}`,
  `  ${GREEN}✔ tests${RESET}  ${DIM}— skipped — formatting/lint failed, fix and rerun${RESET}`,
  `  ${GREEN}✔ ui-smoke${RESET}  ${DIM}— skipped — formatting/lint failed, fix and rerun${RESET}`,
  "",
  "  1 check(s) failed.",
].join("\n");

/** Noisy stderr the old tail-based reason latched onto instead. */
const NOISY_STDERR = [
  "[Vue warn]: Failed to resolve component: RouterView",
  "init-scaffold: wrote src/commands/init.test.ts",
  "auth-invite: sending invite to user@example.com",
  "[global-reap] reaped 0 stale worktrees",
].join("\n");

describe("summarizeCheckOutput (0428)", () => {
  it("names the failing check and file despite noisy stderr", () => {
    const result = summarizeCheckOutput(`${FMT_FAILURE_OUTPUT}\n${NOISY_STDERR}`);
    expect(result).not.toBeNull();
    const { summary, failedChecks } = result!;

    // The formatting failure leads, with the offending file — never the tail.
    expect(summary).toContain("✗ check-fmt:check");
    expect(summary).toContain("src/ui-app/src/style.css");
    expect(failedChecks).toEqual(["check-fmt:check"]);
    expect(summary).not.toContain("global-reap");
    expect(summary).not.toContain("auth-invite");

    // Skipped-because-of-the-failure checks are shown as skipped, not passed.
    expect(summary).toContain("⏭ build");
    expect(summary).toContain("⏭ tests");
    expect(summary).toContain("skipped — formatting/lint failed");
    // A routine config skip is not part of the diagnosis.
    expect(summary).not.toContain("lockfile-sync");
  });

  it("names the FAIL test when the test suite is the failing check", () => {
    const output = [
      " FAIL  src/ui-app/tests/session-persistence.test.ts > loads a cold session",
      "AssertionError: expected output to contain the persisted line",
      "❯ src/ui-app/tests/session-persistence.test.ts:161:46",
      "",
      "  ── Results ──",
      "  ✔ check-fmt:check",
      "  ✔ build",
      "  ✗ tests  — Command failed: bun run --bun test -- --changed main",
      "",
      "  1 check(s) failed.",
    ].join("\n");

    const result = summarizeCheckOutput(output);
    expect(result?.failedChecks).toEqual(["tests"]);
    expect(result?.summary).toContain("session-persistence.test.ts");
  });

  it("returns null when there is no Results block (process killed/timeout)", () => {
    expect(summarizeCheckOutput("Killed\nsome partial output")).toBeNull();
  });

  it("returns null when every check passed", () => {
    const output = ["  ── Results ──", "  ✔ build", "  ✔ tests", "  All checks passed."].join("\n");
    expect(summarizeCheckOutput(output)).toBeNull();
  });
});

describe("parseCheckResults (0428)", () => {
  it("classifies failed, passed, and skipped checks", () => {
    const results = parseCheckResults(FMT_FAILURE_OUTPUT);
    expect(results).not.toBeNull();
    const byName = Object.fromEntries(results!.map((r) => [r.name, r]));
    expect(byName["check-fmt:check"].status).toBe("failed");
    expect(byName["staleness"].status).toBe("passed");
    expect(byName["build"].status).toBe("skipped");
    expect(byName["build"].blocked).toBe(true);
    expect(byName["lockfile-sync"].status).toBe("skipped");
    expect(byName["lockfile-sync"].blocked).toBe(false);
  });
});

/**
 * #0446 — the results block gained two icons: `⏭` for a step that was
 * explicitly excluded, and `⚠` for an optional step that failed (reported, not
 * gating). The parser has to read both, or a close-out reason would either hide
 * a real failure or blame a skip.
 */
const PLAN_OUTPUT = [
  "  ── Results ──",
  "  ✔ staleness",
  "  ⏭ task-assets  — skipped — no changed path matches work/**, inputs/**",
  "  ✗ build  — timed out after 120s",
  "  ✗ go-test  — missing prerequisite: go — install Go (https://go.dev/dl)",
  "  ⚠ coverage  — command failed (exit 1)",
  "",
  "  2 check(s) failed.",
].join("\n");

describe("parseCheckResults (0446) — the plan-driven results block", () => {
  it("reads the skip, timeout, missing-prerequisite and optional-failure icons", () => {
    const results = parseCheckResults(PLAN_OUTPUT);
    const byName = Object.fromEntries(results!.map((r) => [r.name, r]));
    expect(byName.staleness.status).toBe("passed");
    expect(byName["task-assets"].status).toBe("skipped");
    expect(byName.build.status).toBe("failed");
    expect(byName.build.detail).toMatch(/timed out/);
    expect(byName["go-test"].status).toBe("failed");
    expect(byName["go-test"].detail).toMatch(/missing prerequisite: go/);
    expect(byName.coverage.status).toBe("failed");
  });

  it("summarises a plan failure by check name, with the prerequisite advice", () => {
    const summary = summarizeCheckOutput(PLAN_OUTPUT);
    expect(summary?.failedChecks).toEqual(["build", "go-test", "coverage"]);
    expect(summary?.summary).toMatch(/go-test/);
    expect(summary?.summary).toMatch(/go\.dev/);
  });
});

describe("checkFailureSignature (0428)", () => {
  it("treats the same failing checks as the same failure despite log paths", () => {
    const a = checkFailureSignature(
      ["check-fmt:check"],
      "check failed: Results:\n  ✗ check-fmt:check\nFull check output: .repoos/logs/integration/0428-1.log",
    );
    const b = checkFailureSignature(
      ["check-fmt:check"],
      "check failed: Results:\n  ✗ check-fmt:check\nFull check output: .repoos/logs/integration/0428-2.log",
    );
    expect(a).toBe(b);
  });

  it("distinguishes different failing checks", () => {
    expect(checkFailureSignature(["tests"], "x")).not.toBe(
      checkFailureSignature(["check-fmt:check"], "y"),
    );
  });

  it("falls back to the reason when no check list is available", () => {
    expect(checkFailureSignature(undefined, "merge conflict in a.ts")).toBe(
      checkFailureSignature(undefined, "merge conflict in a.ts"),
    );
    expect(checkFailureSignature(undefined, "merge conflict in a.ts")).not.toBe(
      checkFailureSignature(undefined, "merge conflict in b.ts"),
    );
  });
});
