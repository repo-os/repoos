/**
 * #0686 — Settings schema and TOML contract for `[approval]`.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { resolveSettingLocation } from "../src/settings-location.js";

describe("[approval] policy config (#0686)", () => {
  it("defaults to off when the section is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-approval-cfg-"));
    try {
      expect(loadConfig(dir).approval?.enabled).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads enabled flag and auto-approve lists from flat TOML", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-approval-cfg-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      'approval.enabled = true\napproval.autoApprove.areas = ["api", "docs"]\napproval.autoApprove.types = ["chore"]\n',
    );
    try {
      const cfg = loadConfig(dir);
      expect(cfg.approval?.enabled).toBe(true);
      expect(cfg.approval?.autoApprove?.areas).toEqual(["api", "docs"]);
      expect(cfg.approval?.autoApprove?.types).toEqual(["chore"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes Settings controls and documents TOML keys", () => {
    const enabled = getConfigSchema().find((f) => f.key === "approval.enabled");
    expect(enabled).toMatchObject({ type: "boolean", tier: "live", default: false });
    const areas = getConfigSchema().find((f) => f.key === "approval.autoApprove.areas");
    expect(areas?.type).toBe("array");
    expect(SUPPORTED_TOML_KEYS).toContain("approval.enabled");
    expect(SUPPORTED_TOML_KEYS).toContain("approval.autoApprove.areas");
    const loc = resolveSettingLocation("approval.enabled", enabled, { inspectorAvailable: true });
    expect(loc).toEqual({ tab: "general", hasUiRow: true });
  });
});
