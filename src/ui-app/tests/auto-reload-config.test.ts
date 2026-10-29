import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getConfigSchema,
  loadConfig,
  patchTomlConfig,
  SUPPORTED_TOML_KEYS,
} from "../../core/config";

describe("automatic server reload setting", () => {
  it("defaults on, is exposed in Settings, and persists changes", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-auto-reload-setting-"));
    const file = join(root, "repoos.toml");
    writeFileSync(file, "", "utf8");

    const field = getConfigSchema().find((candidate) => candidate.key === "autoReload");
    expect(loadConfig(root).autoReload).toBe(true);
    expect(field).toMatchObject({
      type: "boolean",
      tier: "restart",
      restartRequired: true,
      default: true,
    });
    expect(SUPPORTED_TOML_KEYS).toContain("autoReload");

    patchTomlConfig(file, { autoReload: false });
    expect(loadConfig(root).autoReload).toBe(false);
    expect(readFileSync(file, "utf8")).toContain("autoReload = false");
  });
});
