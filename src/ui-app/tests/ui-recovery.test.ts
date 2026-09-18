import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRouteIntent,
  isStaleImportError,
  shouldAutoReload,
  showStaleUi,
  uiRecoveryState,
} from "../src/lib/uiRecovery";

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  const storage = makeStorage();
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    location: {
      pathname: "/work",
      search: "",
      hash: "",
      assign: vi.fn(),
      reload: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(consumeRouteIntent()).toBe("/inputs?filter=new");
  });

  it("recognizes stale lazy-import failures without matching unrelated MIME errors", () => {
    expect(
      isStaleImportError("Failed to fetch dynamically imported module /assets/Inputs.7f32.js"),
    ).toBe(true);
    expect(isStaleImportError("Loading chunk admins failed.")).toBe(true);
    expect(isStaleImportError("Image MIME type mismatch for /logo.png")).toBe(false);
    expect(isStaleImportError("The uploaded file is not valid JSON")).toBe(false);
  });
});
