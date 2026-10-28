import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../core/config.js";
import { resolveCheckPlan, selectSteps } from "../../core/check-plan.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const plan = resolveCheckPlan({ check: loadConfig(root).check });

describe("RepoOS gate profiles (#0970)", () => {
  it("defers only the measured expensive steps and preserves the full close-out plan", () => {
    expect(plan.errors).toEqual([]);
    expect(plan.steps).toHaveLength(19);
    expect(
      selectSteps(plan)
        .filter((s) => s.skip)
        .map((s) => s.step.name),
    ).toEqual(["rendered-contrast", "user-docs-build"]);
    expect(selectSteps(plan, { profile: "full" }).every((s) => !s.skip)).toBe(true);
    for (const name of ["build", "tests", "ui-smoke", "check-fmt:check", "check-lint"]) {
      expect(selectSteps(plan).find((s) => s.step.name === name)?.skip).toBeUndefined();
    }
  });

  it.each([
    ["rendered-contrast", "scripts/ui-contrast-audit.mjs"],
    ["user-docs-build", "user-docs/check.md"],
    ["landing-build", "landing/src/App.vue"],
    ["telegram-manager-build", "telegram-manager/src/index.ts"],
    ["telegram-manager-test", "telegram-manager/src/index.ts"],
    ["macos-hub-icon-transparency", "macos/scripts/verify-dock-icon-transparency.sh"],
  ])("scopes %s to its own changed paths", (name, path) => {
    const selection = (changedPaths: string[]) =>
      selectSteps(plan, { profile: "full", changedPaths }).find((s) => s.step.name === name)!;
    expect(selection(["docs/unrelated.md"]).skip?.reason).toBe("changed");
    expect(selection([path]).skip).toBeUndefined();
  });
});
