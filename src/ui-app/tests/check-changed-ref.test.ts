import { describe, expect, it } from "vitest";
import { changedTestRef } from "../../commands/check.js";

/**
 * The Tests step's `--changed` scoping guard. Standalone `repoos check`
 * (env unset) is the full definition-of-done gate and must never narrow
 * coverage. Only the two per-branch pre-merge checks (engineer self-check,
 * handoff-finalize re-verification) set REPOOS_CHECK_CHANGED — see
 * changedTestRef's doc comment in commands/check.ts.
 */
describe("changedTestRef — repoos check's Tests-step scoping", () => {
  it("standalone (env unset) runs the full suite", () => {
    expect(changedTestRef({})).toBeUndefined();
  });

  it("a set ref scopes the test step to it", () => {
    expect(changedTestRef({ REPOOS_CHECK_CHANGED: "main" })).toBe("main");
    expect(changedTestRef({ REPOOS_CHECK_CHANGED: "a1b2c3d" })).toBe("a1b2c3d");
  });

  it("an empty or whitespace-only value is treated as unset", () => {
    expect(changedTestRef({ REPOOS_CHECK_CHANGED: "" })).toBeUndefined();
    expect(changedTestRef({ REPOOS_CHECK_CHANGED: "   " })).toBeUndefined();
  });

  it("trims surrounding whitespace from a real ref", () => {
    expect(changedTestRef({ REPOOS_CHECK_CHANGED: "  main  " })).toBe("main");
  });
});
