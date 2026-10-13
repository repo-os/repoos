/**
 * #0762 — Settings schema and TOML contract for mechanical review verification
 * (guard negative-test check kill switch + configurable test-file globs).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import {
  DEFAULT_GUARD_TEST_GLOBS,
  isTestFilePath,
  resolvedReviewVerification,
} from "../../core/review-verification-config.js";
import { resolveSettingLocation } from "../src/settings-location.js";

describe("reviewVerification config (#0762)", () => {
  it("defaults to guard check on with JS/TS test globs", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-rv-cfg-"));
    try {
      const cfg = loadConfig(dir);
      const resolved = resolvedReviewVerification(cfg);
      expect(resolved.guardTestCheck).toBe(true);
      expect(resolved.testGlobs).toEqual(DEFAULT_GUARD_TEST_GLOBS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads flat TOML keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-rv-cfg-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      [
        "[reviewVerification]",
        "guardTestCheck = false",
        'testGlobs = ["**/*Tests.swift", "**/test_*.py"]',
        "",
      ].join("\n"),
    );
    try {
      const cfg = loadConfig(dir);
      expect(cfg.reviewVerification?.guardTestCheck).toBe(false);
      expect(cfg.reviewVerification?.testGlobs).toEqual(["**/*Tests.swift", "**/test_*.py"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("matches Swift and Python test paths against configured globs", () => {
    const globs = ["**/*Tests.swift", "**/test_*.py", "**/*_test.go"];
    expect(isTestFilePath("Sources/DivotTests/ReleaseConfigTests.swift", globs)).toBe(true);
    expect(isTestFilePath("tests/test_release.py", globs)).toBe(true);
    expect(isTestFilePath("pkg/guard_test.go", globs)).toBe(true);
    expect(isTestFilePath("Sources/Divot/ReleaseConfig.swift", globs)).toBe(false);
    // The JS defaults still work when nothing is configured.
    expect(isTestFilePath("src/core/foo.test.ts", DEFAULT_GUARD_TEST_GLOBS)).toBe(true);
  });

  it("exposes Settings controls and documents TOML keys", () => {
    const toggle = getConfigSchema().find((f) => f.key === "reviewVerification.guardTestCheck");
    expect(toggle).toMatchObject({ type: "boolean", tier: "live", default: true });
    const globs = getConfigSchema().find((f) => f.key === "reviewVerification.testGlobs");
    expect(globs?.type).toBe("array");
    expect(SUPPORTED_TOML_KEYS).toContain("reviewVerification.guardTestCheck");
    expect(SUPPORTED_TOML_KEYS).toContain("reviewVerification.testGlobs");
    const loc = resolveSettingLocation("reviewVerification.guardTestCheck", toggle, {
      inspectorAvailable: true,
    });
    expect(loc).toEqual({ tab: "general", hasUiRow: true });
  });
});
