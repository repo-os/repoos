import { describe, expect, it } from "vitest";
import type { PageGateIssue } from "./page-browser-gate.js";
import {
  applyMechanicalReviewVerification,
  evaluateConsoleErrorReviewCheck,
  evaluateGuardNegativeTestChecks,
  evaluateReviewVerification,
  guardsMateriallyChangedFromDiff,
  isBlockingBrowserIssueForReview,
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
  it("detects materially changed guards from check.ts diff", () => {
    const ids = guardsMateriallyChangedFromDiff({
      changedPaths: ["src/commands/check.ts"],
      checkTsDiff: "+ export function bareRequireOffenders(\n",
    });
    expect(ids).toContain("bare-require");
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
});
