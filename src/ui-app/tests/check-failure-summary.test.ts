import { describe, expect, it } from "vitest";
import {
  buildLastCheckFailureSummary,
  extractFailedTests,
  isStackFrameLine,
  pickErrorLineFromStepOutput,
  remoteRunHistoryMeta,
} from "../../core/check-failure-summary.js";

describe("buildLastCheckFailureSummary (#0700)", () => {
  it("names the step and the error line for an ESM loader trace, not stack frames", () => {
    const output = [
      "  ── Results ──",
      "  ✔ check-fmt:check",
      "  ✗ build — Command failed with exit 1",
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@scope/missing'",
      "    at afterLoad (node:internal/modules/esm/loader:506:29)",
      "    at ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:419:12)",
      "  1 check(s) failed.",
    ].join("\n");
    const summary = buildLastCheckFailureSummary(output);
    expect(summary).toBe(
      "build — Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@scope/missing'",
    );
    expect(summary).not.toMatch(/\bat afterLoad\b/);
  });

  it("never uses stack-frame-only output as the summary", () => {
    const output = [
      "  ── Results ──",
      "  ✗ build — exited 1",
      "    at afterLoad (node:internal/modules/esm/loader:506:29)",
      "    at ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:419:12)",
    ].join("\n");
    expect(buildLastCheckFailureSummary(output)).toBe("build — failed");
  });

  it("names the failing Vitest test when the tests step failed", () => {
    const output = [
      " FAIL  src/auth/login.test.ts > rejects bad password",
      "AssertionError: expected false to be true",
      "❯ src/auth/login.test.ts:42:10",
      "",
      "  ── Results ──",
      "  ✔ build",
      "  ✗ tests — Command failed: bun run test",
      "",
      "  1 check(s) failed.",
    ].join("\n");
    const summary = buildLastCheckFailureSummary(output);
    expect(summary).toContain("tests —");
    expect(summary).toContain("login.test.ts");
    expect(summary).toContain("rejects bad password");
    expect(isStackFrameLine("    at afterLoad (node:internal/...)")).toBe(true);
    expect(pickErrorLineFromStepOutput("    at foo\n    at bar")).toBeNull();
  });

  it("surfaces a TypeScript error from the build step", () => {
    const output = [
      "  ── Results ──",
      "  ✔ check-fmt:check",
      "  ✗ build — tsc failed",
      "src/server/handoff.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
      "  1 check(s) failed.",
    ].join("\n");
    expect(buildLastCheckFailureSummary(output)).toBe(
      "build — src/server/handoff.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
    );
  });
});

describe("extractFailedTests", () => {
  it("lists each distinct failing test, ignoring colour codes and repeats", () => {
    const out = [
      "\u001b[31m FAIL \u001b[39m tests/agent-review.test.ts > reviews again > after a human returns",
      "AssertionError: timed out",
      " FAIL  tests/agent-review.test.ts > reviews again > after a human returns",
      " FAIL  tests/other.test.ts [ unit ]",
      " ✓ tests/fine.test.ts",
    ].join("\n");
    expect(extractFailedTests(out)).toEqual([
      "tests/agent-review.test.ts > reviews again > after a human returns",
      "tests/other.test.ts",
    ]);
  });

  it("returns nothing for a passing run", () => {
    expect(extractFailedTests(" ✓ tests/a.test.ts (3 tests)\n Tests 3 passed")).toEqual([]);
  });
});

describe("remoteRunHistoryMeta", () => {
  it("names tests and lists Vitest failures from remote output", () => {
    const output = " FAIL  src/foo.test.ts > suite > case\nAssertionError: nope";
    expect(remoteRunHistoryMeta("fail", { output, transient: false })).toEqual({
      failedStep: "tests",
      failedTests: ["src/foo.test.ts > suite > case"],
    });
  });

  it("keeps dispatch failures on remote-validation with no test names", () => {
    expect(remoteRunHistoryMeta("fail", { detail: "remote validation is disabled" })).toMatchObject(
      {
        failedStep: "remote-validation",
        failedTests: [],
      },
    );
  });
});
