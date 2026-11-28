import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "../../core/config.js";

const REPO_ROOT = findRepoRoot(process.cwd());

describe("Hub GitHub Actions workflows", () => {
  it("keeps setup-android package requests explicit and avoids job-level runner context", () => {
    for (const name of ["android-hub.yml", "publish-hub-dev.yml"]) {
      const workflow = readFileSync(join(REPO_ROOT, ".github/workflows", name), "utf8");
      const setupCount = [
        ...workflow.matchAll(/^\s*- uses: android-actions\/setup-android@[^\n]+$/gm),
      ].length;
      const explicitPackageCount = [
        ...workflow.matchAll(
          /^\s*- uses: android-actions\/setup-android@[^\n]+\n\s+with:\n\s+packages:\s*["']{2}\s*$/gm,
        ),
      ].length;
      expect(setupCount, name).toBeGreaterThan(0);
      expect(explicitPackageCount, name).toBe(setupCount);
    }

    const macosWorkflow = readFileSync(join(REPO_ROOT, ".github/workflows/macos-hub.yml"), "utf8");
    expect(macosWorkflow).not.toMatch(/^    env:\n(?:      .*\n)*?\s*\$\{\{\s*runner\./m);
  });

  it("publishes an unnotarized DMG only when no notarization secrets exist", () => {
    const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/macos-hub.yml"), "utf8");
    const pushTrigger = workflow.match(/^  push:\n([\s\S]*?)(?=^  workflow_dispatch:)/m)?.[1];

    expect(pushTrigger).toBeDefined();
    expect(pushTrigger).toContain("tags:");
    expect(pushTrigger).toContain('"v*.*.*"');
    expect(pushTrigger).not.toContain("paths:");
    expect(workflow).toContain('if [[ -z "${APPLE_TEAM_ID:-}${APPLE_ID:-}${APPLE_APP_SPECIFIC_PASSWORD:-}${APPLE_API_KEY:-}${APPLE_API_KEY_ID:-}${APPLE_API_ISSUER_ID:-}" ]]');
    expect(workflow).toContain("RepoOSHub.dmg will be uploaded without notarization.");
    expect(workflow).toContain("**Not notarized:** no Apple notarization credentials are configured.");
    expect(workflow).toContain("Dry run did not exercise notarization because no Apple notarization credentials are configured.");
    expect(workflow).toContain("Incomplete App Store Connect API key notarization credentials.");
    expect(workflow).toContain("No complete notarization credential set is configured.");
    expect(workflow).toContain("xcrun stapler staple RepoOSHub.dmg");
    expect(workflow).toContain("xcrun stapler validate RepoOSHub.dmg");
    expect(workflow).toContain("spctl --assess --type open --context context:primary-signature RepoOSHub.dmg");
    expect(workflow).toContain("uses: softprops/action-gh-release@v2");
    expect(workflow).toContain("if: ${{ inputs.dry_run != 'true' }}");
    expect(workflow.indexOf("Notarize, staple and verify DMG")).toBeLessThan(
      workflow.indexOf("Upload DMG to GitHub Release"),
    );
  });
});
