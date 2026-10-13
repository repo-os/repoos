/**
 * #0762 — pure-unit coverage for the narrowed guard detection and the
 * engineer-facing clamp reason. `src/core/review-verification.test.ts` holds
 * the same assertions, but that file lives outside the vitest `include`
 * (`tests/**` under the ui-app root) and never runs, so the behaviour is
 * pinned here too.
 */
import { describe, expect, it } from "vitest";
import {
  applyMechanicalReviewVerification,
  evaluateGuardNegativeTestChecks,
  evaluateReviewVerification,
  guardsMateriallyChangedFromDiff,
  guardsFromRepoosTomlDiff,
  testContentDemonstratesGuardRejection,
} from "../../core/review-verification.js";

describe("guardsFromRepoosTomlDiff (#0762)", () => {
  it("ignores unrelated repoos.toml additions outside [[check.steps]]", () => {
    const diff = [
      "+[release]",
      '+version = "1.0.0"',
      "+[[distribution]]",
      '+kind = "github-release"',
      '+name = "dist"',
      '+command = "./release.sh"',
      "+[[shot.targets]]",
      '+name = "app"',
      '+kind = "command"',
      '+command = "make shot"',
      "+[[preview.targets]]",
      '+name = "default"',
      '+kind = "server"',
      '+command = "bun run dev"',
      "+[[agents]]",
      '+name = "reviewer"',
    ].join("\n");
    expect(guardsFromRepoosTomlDiff(diff)).toEqual([]);
  });

  it("detects a guard kind only inside a [[check.steps]] block", () => {
    const diff = [
      "+[[check.steps]]",
      '+name = "contrast"',
      '+kind = "theme-contrast"',
      "+[[check.steps]]",
      '+name = "rendered-contrast"',
      '+command = "bun run contrast:audit"',
    ].join("\n");
    expect(guardsFromRepoosTomlDiff(diff)).toEqual(["theme-contrast"]);
  });

  it("stops attributing a [[distribution]] kind to guards after a check.steps block", () => {
    const diff = [
      "+[[check.steps]]",
      '+name = "contrast"',
      '+kind = "theme-contrast"',
      "+[[distribution]]",
      '+name = "release"',
      '+kind = "npm"',
      '+command = "npm publish"',
    ].join("\n");
    expect(guardsFromRepoosTomlDiff(diff)).toEqual(["theme-contrast"]);
  });

  it("does not treat a check.ts comment as a changed guard", () => {
    expect(
      guardsMateriallyChangedFromDiff({
        changedPaths: ["src/commands/check.ts"],
        checkTsDiff: " // bareRequireOffenders mentioned in a comment\n",
      }),
    ).toEqual([]);
  });
});

describe("guard rejection detection is language-agnostic (#0762)", () => {
  it("recognises Swift, Python and Go rejection assertions", () => {
    expect(testContentDemonstratesGuardRejection("XCTAssertThrowsError(try guard(badInput))")).toBe(
      true,
    );
    expect(
      testContentDemonstratesGuardRejection("with pytest.raises(ValueError):\n  guard(bad)"),
    ).toBe(true);
    expect(
      testContentDemonstratesGuardRejection('if !rejected {\n  t.Fatalf("expected reject")\n}'),
    ).toBe(true);
  });

  it("still rejects a bare prose mention of rejection", () => {
    expect(
      testContentDemonstratesGuardRejection(
        "// this module rejects bad input in theory\nit('ok', () => {});",
      ),
    ).toBe(false);
  });
});

describe("guard clamp reason (#0762)", () => {
  it("includes the test globs in the actionable block reason", () => {
    const checks = evaluateGuardNegativeTestChecks({
      guardIds: ["bare-require"],
      changedTestFiles: [],
      testGlobs: ["**/*.test.ts", "**/*Tests.swift"],
    });
    expect(checks[0]?.status).toBe("failed");
    expect(checks[0]?.blockReason).toContain("bare-require");
    expect(checks[0]?.blockReason).toContain("**/*Tests.swift");
  });

  it("skips with a stated reason when the check is disabled", () => {
    const verification = evaluateReviewVerification({
      uiVerificationRequired: false,
      evidence: null,
      changedPaths: ["repoos.toml"],
      repoosTomlDiff: '+[[check.steps]]\n+name = "c"\n+kind = "theme-contrast"\n',
      changedTestFiles: [],
      guardTestCheck: false,
    });
    expect(verification.guardTests[0]?.status).toBe("skipped");
    expect(verification.blocksApproval).toBe(false);
  });

  it("clamps a clean verdict and reports the reason", () => {
    const verification = evaluateReviewVerification({
      uiVerificationRequired: false,
      evidence: null,
      changedPaths: ["repoos.toml"],
      repoosTomlDiff: '+[[check.steps]]\n+name = "contrast"\n+kind = "theme-contrast"\n',
      changedTestFiles: [],
      testGlobs: ["**/*.test.ts"],
    });
    expect(verification.blocksApproval).toBe(true);
    expect(verification.clampReason).toContain("theme-contrast");

    const applied = applyMechanicalReviewVerification("## Verdict\n`good to go`\n", verification);
    expect(applied.verdictOverride).toBe("needs some work");
    expect(applied.clampReason).toContain("theme-contrast");
    expect(applied.markdown).toContain("theme-contrast");
  });
});
