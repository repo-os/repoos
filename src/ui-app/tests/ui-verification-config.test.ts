/**
 * #0680 — Settings schema and TOML contract for UI handoff verification.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";
import { resolvedUiVerification } from "../../core/ui-verification-config.js";
import { resolveSettingLocation } from "../src/settings-location.js";
import { shouldAutoRefreshStaleEvidence } from "../../server/review.js";

describe("uiVerification config (#0680)", () => {
  it("defaults to enabled with standard viewports", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-uiv-cfg-"));
    try {
      const cfg = loadConfig(dir);
      expect(resolvedUiVerification(cfg).enabled).toBe(true);
      expect(resolvedUiVerification(cfg).viewportWidths).toEqual([1024, 375]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads flat TOML keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-uiv-cfg-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      "uiVerification.enabled = false\nuiVerification.viewportWidths = [1280, 390]\nuiVerification.autoRefreshStaleOnce = true\n",
    );
    try {
      const cfg = loadConfig(dir);
      expect(cfg.uiVerification?.enabled).toBe(false);
      expect(cfg.uiVerification?.viewportWidths).toEqual([1280, 390]);
      expect(cfg.uiVerification?.autoRefreshStaleOnce).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes Settings controls and documents TOML keys", () => {
    const enabled = getConfigSchema().find((f) => f.key === "uiVerification.enabled");
    expect(enabled).toMatchObject({ type: "boolean", tier: "live", default: true });
    const widths = getConfigSchema().find((f) => f.key === "uiVerification.viewportWidths");
    expect(widths?.type).toBe("array");
    expect(SUPPORTED_TOML_KEYS).toContain("uiVerification.enabled");
    expect(SUPPORTED_TOML_KEYS).toContain("uiVerification.viewportWidths");
    const autoRefresh = getConfigSchema().find(
      (f) => f.key === "uiVerification.autoRefreshStaleOnce",
    );
    expect(autoRefresh).toMatchObject({ type: "boolean", tier: "live", default: false });
    expect(SUPPORTED_TOML_KEYS).toContain("uiVerification.autoRefreshStaleOnce");
    const loc = resolveSettingLocation("uiVerification.enabled", enabled, {
      inspectorAvailable: true,
    });
    expect(loc).toEqual({ tab: "general", hasUiRow: true });
    expect(
      resolveSettingLocation("uiVerification.autoRefreshStaleOnce", autoRefresh, {
        inspectorAvailable: true,
      }),
    ).toEqual({ tab: "general", hasUiRow: true });
  });

  it("auto-refreshes only an explicitly stale-evidence-only review when enabled", () => {
    const enabled = { uiVerification: { autoRefreshStaleOnce: true } } as RepoOSConfig;
    const disabled = { uiVerification: { autoRefreshStaleOnce: false } } as RepoOSConfig;
    expect(
      shouldAutoRefreshStaleEvidence(
        enabled,
        "## Verdict\nneeds some work. STALE-EVIDENCE-ONLY",
        "needs some work",
      ),
    ).toBe(true);
    expect(
      shouldAutoRefreshStaleEvidence(
        enabled,
        "## Problem\nSTALE-EVIDENCE-ONLY\n\n## Verdict\nneeds some work",
        "needs some work",
      ),
    ).toBe(false);
    expect(
      shouldAutoRefreshStaleEvidence(enabled, "bug plus stale capture", "needs some work"),
    ).toBe(false);
    expect(
      shouldAutoRefreshStaleEvidence(
        disabled,
        "## Verdict\nneeds some work. STALE-EVIDENCE-ONLY",
        "needs some work",
      ),
    ).toBe(false);
    expect(
      shouldAutoRefreshStaleEvidence(
        enabled,
        "## Verdict\ngood to go. STALE-EVIDENCE-ONLY",
        "good to go",
      ),
    ).toBe(false);
  });
});
