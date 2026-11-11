import { describe, expect, it } from "vitest";
import { getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { resolveBranchArtifactGuardOptions } from "../../core/branch-artifact-guard.js";

describe("branch-artifacts config (#1096)", () => {
  it("exposes Settings schema and parser keys", () => {
    for (const key of [
      "check.branchArtifactsMaxFileBytes",
      "check.checkpointMaxStagedFiles",
      "check.buildOutputPatterns",
    ]) {
      expect(getConfigSchema().find((f) => f.key === key)).toBeDefined();
      expect(SUPPORTED_TOML_KEYS).toContain(key);
    }
  });

  it("maps partial [check] keys without requiring branchArtifactsMaxFileBytes", () => {
    const opts = resolveBranchArtifactGuardOptions({
      branchArtifactsAllowlist: ["assets/big.bin"],
      checkpointMaxStagedFiles: 42,
      branchArtifactsMaxScanFiles: 99,
    });
    expect(opts.largeFileAllowlist).toEqual(["assets/big.bin"]);
    expect(opts.checkpointMaxFiles).toBe(42);
    expect(opts.maxScanFiles).toBe(99);
  });
});
