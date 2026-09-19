import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRouteIntent,
  configureUiRecovery,
  dismissRecovery,
  isStaleImportError,
  isstaleDismissed,
  showOffline,
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

  it("keeps the intended route across stale-recovery rechecks", () => {
    showStaleUi("/inputs?filter=new");
    showStaleUi("/work");
    expect(uiRecoveryState().attemptedRoute).toBe("/inputs?filter=new");
    expect(sessionStorage.getItem("repoos.route-intent")).toBe("/inputs?filter=new");
    expect(consumeRouteIntent()).toBe("/inputs?filter=new");
  });

  it("dismisses a recovery state and clears its saved route intent", () => {
    showStaleUi("/agents");
    expect(uiRecoveryState().kind).toBe("stale");
    dismissRecovery();
    expect(uiRecoveryState().kind).toBeNull();
    expect(consumeRouteIntent()).toBeNull();
  });

  it("shows offline recovery as dismissible state", () => {
    showOffline("The server timed out");
    expect(uiRecoveryState().kind).toBe("offline");
    dismissRecovery();
    expect(uiRecoveryState().kind).toBeNull();
  });

  it("clears the normal new-version notice whenever stale recovery starts", () => {
    const clearNewVersion = vi.fn();
    configureUiRecovery({ isDirty: () => true, isBusy: () => false, clearNewVersion });
    showStaleUi("/agents");
    expect(clearNewVersion).toHaveBeenCalledOnce();
  });

  it("does not leave the parked-build banner on when offline recovery appears", () => {
    dismissRecovery();
    const clearNewVersion = vi.fn();
    configureUiRecovery({ isDirty: () => false, isBusy: () => false, clearNewVersion });
    showOffline("The server timed out");
    expect(clearNewVersion).toHaveBeenCalledOnce();
    expect(uiRecoveryState().kind).toBe("offline");
  });

  it("never auto-reloads — showStaleUi only shows the banner", () => {
    vi.useFakeTimers();
    configureUiRecovery({ isDirty: () => false, isBusy: () => false });
    showStaleUi("/work");
    vi.runAllTimers();
    expect((window.location.reload as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((window.location.assign as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("dismiss suppresses re-shows for the same build hash but not a new one", () => {
    showStaleUi("/agents", "hash-a", null);
    expect(isstaleDismissed("hash-a")).toBe(false);
    dismissRecovery();
    expect(isstaleDismissed("hash-a")).toBe(true);
    // Same hash → still suppressed.
    expect(isstaleDismissed("hash-a")).toBe(true);
    // Different hash (new server restart) → no longer suppressed.
    expect(isstaleDismissed("hash-b")).toBe(false);
    // No hash provided → still suppressed (router.onError has no hash).
    expect(isstaleDismissed(undefined)).toBe(true);
  });
});
