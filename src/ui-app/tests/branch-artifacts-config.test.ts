import { describe, expect, it } from "vitest";
import { getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";

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
});
