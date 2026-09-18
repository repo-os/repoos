import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAutoReload, showStaleUi, uiRecoveryState } from "../src/lib/uiRecovery";

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("stale UI recovery", () => {
  it("only permits automatic reload while idle and clean", () => {
    expect(shouldAutoReload(false, false)).toBe(true);
    expect(shouldAutoReload(true, false)).toBe(false);
    expect(shouldAutoReload(false, true)).toBe(false);
  });

  it("persists the attempted route for an explicit reload", () => {
    showStaleUi("/inputs?filter=new");
    expect(sessionStorage.getItem("repoos.route-intent")).toBe("/inputs?filter=new");
    expect(uiRecoveryState().message).toContain("updated while this page was open");
  });
});
