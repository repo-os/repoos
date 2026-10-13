/**
 * Config for the mechanical review verification gate (#0714, narrowed by
 * #0762). Mirrors `ui-verification-config.ts`: the loader stores whatever the
 * TOML says (possibly nothing) and this resolver fills in the behaviour-
 * meaning defaults.
 */
import type { RepoOSConfig, ReviewVerificationConfig } from "./types.js";
import { globToRegExp } from "./check-plan.js";

/**
 * The test-file globs the guard negative-test check read before it was
 * configurable: JS/TS unit-test files. A project whose tests are Swift, Python,
 * Go, etc. declares its own `testGlobs`.
 */
export const DEFAULT_GUARD_TEST_GLOBS = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.mjs",
];

export interface ResolvedReviewVerification {
  /**
   * Whether the guard negative-test check runs at all. Absent config means on;
   * narrowing the guard DETECTION (see `guardsMateriallyChangedFromDiff`) is
   * what keeps it from misfiring, not turning it off. The switch is the
   * explicit opt-out.
   */
  guardTestCheck: boolean;
  /** Non-empty list of globs identifying test files. */
  testGlobs: string[];
}

export function resolvedReviewVerification(
  config: Pick<RepoOSConfig, "reviewVerification">,
): ResolvedReviewVerification {
  const raw: ReviewVerificationConfig = config.reviewVerification ?? {};
  const globs = (raw.testGlobs ?? []).map((g) => g.trim()).filter((g) => g.length > 0);
  return {
    guardTestCheck: raw.guardTestCheck !== false,
    testGlobs: globs.length ? globs : [...DEFAULT_GUARD_TEST_GLOBS],
  };
}

/**
 * Whether `path` (repo-relative) is a test file under `globs`. Uses the same
 * glob compiler `repoos check` uses for `whenChanged`, so `Tests.swift`-style
 * globs, `tests/**`, `*_test.go` and the JS defaults all mean the same thing
 * here.
 */
export function isTestFilePath(path: string, globs: string[]): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return globs.some((pattern) => globToRegExp(pattern).test(normalized));
}

/**
 * Filter repo-relative paths down to the test files under `globs`.
 */
export function testPathsMatching(paths: string[], globs: string[]): string[] {
  return paths.filter((p) => isTestFilePath(p, globs));
}
