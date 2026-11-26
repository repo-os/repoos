import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "../../core/config.js";

const REPO_ROOT = findRepoRoot(process.cwd());

describe("Hub GitHub Actions workflows", () => {
  it("keeps setup-android package requests explicit and avoids job-level runner context", () => {
    for (const name of ["android-hub.yml", "publish-hub-dev.yml"]) {
      const workflow = readFileSync(
        join(REPO_ROOT, ".github/workflows", name),
        "utf8",
      );
      const setupCount = [...workflow.matchAll(
        /^\s*- uses: android-actions\/setup-android@[^\n]+$/gm,
      )].length;
      const explicitPackageCount = [...workflow.matchAll(
        /^\s*- uses: android-actions\/setup-android@[^\n]+\n\s+with:\n\s+packages:\s*["']{2}\s*$/gm,
      )].length;
      expect(setupCount, name).toBeGreaterThan(0);
      expect(explicitPackageCount, name).toBe(setupCount);
    }

    const macosWorkflow = readFileSync(
      join(REPO_ROOT, ".github/workflows/macos-hub.yml"),
      "utf8",
    );
    expect(macosWorkflow).not.toMatch(
      /^    env:\n(?:      .*\n)*?\s*\$\{\{\s*runner\./m,
    );
  });
});
