import { describe, expect, it } from "vitest";
import type { PageGateIssue } from "./page-browser-gate.js";
import {
  applyMechanicalReviewVerification,
  evaluateConsoleErrorReviewCheck,
  evaluateGuardNegativeTestChecks,
  evaluateReviewVerification,
  guardsMateriallyChangedFromDiff,
  isBlockingBrowserIssueForReview,
  reviewVerificationWithoutWorktree,
  testContentDemonstratesGuardRejection,
} from "./review-verification.js";
import { parseReviewVerdict } from "./review-verdict.js";

describe("isBlockingBrowserIssueForReview (#0714)", () => {
  it("treats console errors as blocking", () => {
    expect(isBlockingBrowserIssueForReview({ kind: "console", message: "vue-i18n warn" })).toBe(
      true,
    );
  });

  it("applies the benign resource URL exception for request failures", () => {
    expect(
      isBlockingBrowserIssueForReview({
        kind: "request",
        message: "Failed to load resource",
        url: "http://127.0.0.1:1/favicon.ico",
      }),
    ).toBe(false);
  });
});

describe("evaluateConsoleErrorReviewCheck (#0714)", () => {
  it("fails when required evidence contains a console error", () => {
    const issues: PageGateIssue[] = [{ kind: "console", message: "[intlify] Not found 'x'" }];
    const r = evaluateConsoleErrorReviewCheck({
      uiVerificationRequired: true,
      evidence: { issues, at: "2026-01-01T00:00:00Z" },
    });
    expect(r.status).toBe("failed");
    expect(r.issues).toHaveLength(1);
  });

  it("marks not_run when UI verification was required but evidence is missing", () => {
    const r = evaluateConsoleErrorReviewCheck({
      uiVerificationRequired: true,
      evidence: null,
    });
    expect(r.status).toBe("not_run");
  });

  it("skips when UI handoff verification did not apply", () => {
    const r = evaluateConsoleErrorReviewCheck({
      uiVerificationRequired: false,
      evidence: null,
    });
    expect(r.status).toBe("skipped");
  });
});

describe("guard negative-test evidence (#0714)", () => {
  it("detects materially changed guards from added check.ts lines only", () => {
    const ids = guardsMateriallyChangedFromDiff({
      changedPaths: ["src/commands/check.ts"],
      checkTsDiff: "+ export function bareRequireOffenders(\n",
    });
    expect(ids).toContain("bare-require");
    const contextOnly = guardsMateriallyChangedFromDiff({
      changedPaths: ["src/commands/check.ts"],
      checkTsDiff: " // bareRequireOffenders mentioned in a comment\n",
    });
    expect(contextOnly).toEqual([]);
  });

  it("ignores unrelated repoos.toml additions outside [[check.steps]] (#0762)", () => {
    const tomlDiff = [
      "+[release]",
      "+version = \"1.0.0\"",
      "+[[distribution]]",
      "+kind = \"github-release\"",
      "+name = \"dist\"",
      "+command = \"./release.sh\"",
      "+[[shot.targets]]",
      "+name = \"app\"",
      "+kind = \"command\"",
      "+command = \"make shot\"",
      "+[[preview.targets]]",
      "+name = \"default\"",
      "+kind = \"server\"",
      "+command = \"bun run dev\"",
      "+[[agents]]",
      "+name = \"reviewer\"",
    ].join("\n");
    const ids = guardsMateriallyChangedFromDiff({
      changedPaths: ["repoos.toml"],
      repoosTomlDiff: tomlDiff,
    });
    expect(ids).toEqual([]);
  });

  it("detects a guard kind only inside a [[check.steps]] block (#0762)", () => {
    const tomlDiff = [
      "+[[check.steps]]",
      "+name = \"contrast\"",
      "+kind = \"theme-contrast\"",
      "+[[check.steps]]",
      "+name = \"rendered-contrast\"",
      "+command = \"bun run contrast:audit\"",
    ].join("\n");
    const ids = guardsMateriallyChangedFromDiff({
      changedPaths: ["repoos.toml"],
      repoosTomlDiff: tomlDiff,
    });
    expect(ids).toEqual(["theme-contrast"]);
  });

  it("does not treat a [[distribution]] kind as a guard even after a check.steps block", () => {
    const tomlDiff = [
      "+[[check.steps]]",
      "+name = \"contrast\"",
      "+kind = \"theme-contrast\"",
      "+[[distribution]]",
      "+name = \"release\"",
      "+kind = \"npm\"",
      "+command = \"npm publish\"",
    ].join("\n");
    const ids = guardsMateriallyChangedFromDiff({
      changedPaths: ["repoos.toml"],
      repoosTomlDiff: tomlDiff,
    });
    expect(ids).toEqual(["theme-contrast"]);
  });

  it("accepts negative evidence from an unchanged test at branch HEAD", () => {
    const negative = `
      import { bareRequireOffenders } from "../../commands/check.js";
      it("flags bare require", () => {
        expect(bareRequireOffenders(["app"], { repoRoot: root })).toEqual(["app/a.ts:1"]);
      });
    `;
    const checks = evaluateGuardNegativeTestChecks({
      guardIds: ["bare-require"],
      changedTestFiles: [],
      branchTestFiles: [{ path: "src/ui-app/tests/check-bare-require.test.ts", content: negative }],
    });
    expect(checks[0]?.status).toBe("passed");
    expect(checks[0]?.detail).toContain("existing test");
  });

  it("records an actionable block reason on a failed guard check (#0762)", () => {
    const checks = evaluateGuardNegativeTestChecks({
      guardIds: ["bare-require"],
      changedTestFiles: [],
      testGlobs: ["**/*.test.ts", "**/*Tests.swift"],
    });
    expect(checks[0]?.status).toBe("failed");
    expect(checks[0]?.blockReason).toContain("bare-require");
    expect(checks[0]?.blockReason).toContain("**/*Tests.swift");
  });

  it("does not treat a bare rejects mention as negative evidence", () => {
    const prose = `// this module rejects bad input in theory\nit("ok", () => {});`;
    expect(testContentDemonstratesGuardRejection(prose)).toBe(false);
    expect(testContentDemonstratesGuardRejection(`expect(fn()).toThrow();`)).toBe(true);
  });

  it("requires a rejection test, not happy-path only", () => {
    const happyOnly = `
      import { bareRequireOffenders } from "../../commands/check.js";
      it("allows clean tree", () => {
        expect(bareRequireOffenders(["app"], { repoRoot: root })).toEqual([]);
      });
    `;
    const withNegative = `
      import { bareRequireOffenders } from "../../commands/check.js";
      it("flags bare require", () => {
        expect(bareRequireOffenders(["app"], { repoRoot: root })).toEqual(["app/a.ts:1"]);
      });
    `;
    expect(testContentDemonstratesGuardRejection(happyOnly)).toBe(false);
    expect(testContentDemonstratesGuardRejection(withNegative)).toBe(true);

    const checks = evaluateGuardNegativeTestChecks({
      guardIds: ["bare-require"],
      changedTestFiles: [
        { path: "src/ui-app/tests/check-bare-require.test.ts", content: happyOnly },
      ],
    });
    expect(checks[0]?.status).toBe("failed");

    const ok = evaluateGuardNegativeTestChecks({
      guardIds: ["bare-require"],
      changedTestFiles: [
        { path: "src/ui-app/tests/check-bare-require.test.ts", content: withNegative },
      ],
    });
    expect(ok[0]?.status).toBe("passed");
  });
});

describe("reviewVerificationWithoutWorktree (#0714)", () => {
  it("still reports not_run for branch checks and appends a verification section", () => {
    const result = reviewVerificationWithoutWorktree({
      uiVerificationRequired: false,
      evidence: null,
    });
    expect(result.guardTests[0]?.status).toBe("not_run");
    expect(result.consoleErrors.status).toBe("skipped");
    const applied = applyMechanicalReviewVerification("## Verdict\n`good to go`\n", result);
    expect(applied.markdown).toContain("## Automated verification");
    expect(applied.markdown).toContain("**not run**");
  });
});

describe("applyMechanicalReviewVerification (#0714)", () => {
  it("clamps good to go when console errors block approval", () => {
    const agent = "## Verdict\n`good to go` — looks fine.\n\n## Bugs\nNone found.\n";
    const verification = evaluateReviewVerification({
      uiVerificationRequired: true,
      evidence: {
        issues: [{ kind: "console", message: "TypeError: undefined is not a function" }],
      },
      changedPaths: [],
      changedTestFiles: [],
    });
    const applied = applyMechanicalReviewVerification(agent, verification);
    expect(applied.verdictOverride).toBe("needs some work");
    expect(parseReviewVerdict(applied.markdown)).toBe("needs some work");
    expect(applied.markdown).toContain("## Automated verification");
    expect(applied.markdown).toContain("**failed**");
    expect(applied.markdown).toMatch(/Browser verification:/);
  });

  it("leaves needs some work unchanged but still records verification status", () => {
    const agent = "## Verdict\n`needs some work` — fix tests.\n";
    const verification = evaluateReviewVerification({
      uiVerificationRequired: true,
      evidence: { issues: [{ kind: "console", message: "err" }] },
      changedPaths: [],
      changedTestFiles: [],
    });
    const applied = applyMechanicalReviewVerification(agent, verification);
    expect(applied.verdictOverride).toBeUndefined();
    expect(applied.markdown).toContain("Browser console-error check");
  });

  it("skips the guard check with a stated reason when disabled (#0762)", () => {
    const verification = evaluateReviewVerification({
      uiVerificationRequired: false,
      evidence: null,
      changedPaths: ["repoos.toml"],
      changedTestFiles: [],
      guardTestCheck: false,
    });
    expect(verification.guardTests[0]?.status).toBe("skipped");
    expect(verification.guardTests[0]?.detail).toContain("guardTestCheck = false");
    expect(verification.blocksApproval).toBe(false);
  });

  it("records the clamp reason and includes it in the follow-up text (#0762)", () => {
    const agent = "## Verdict\n`good to go` — looks fine.\n\n## Bugs\nNone found.\n";
    const verification = evaluateReviewVerification({
      uiVerificationRequired: false,
      evidence: null,
      changedPaths: ["repoos.toml"],
      repoosTomlDiff: [
        "+[[check.steps]]",
        "+name = \"contrast\"",
        "+kind = \"theme-contrast\"",
      ].join("\n"),
      changedTestFiles: [],
      testGlobs: ["**/*.test.ts"],
    });
    expect(verification.blocksApproval).toBe(true);
    expect(verification.clampReason).toContain("theme-contrast");

    const applied = applyMechanicalReviewVerification(agent, verification);
    expect(applied.verdictOverride).toBe("needs some work");
    expect(applied.clampReason).toContain("theme-contrast");
    expect(applied.markdown).toContain("theme-contrast");
  });
});
