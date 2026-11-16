/**
 * Android system-back navigation (#1142).
 *
 * The Hub picker, settings, add form and tailnet discovery are local Vue
 * routes, so Android's WebView-history back has nothing to pop. These tests
 * pin the explicit mapping and the native-listener wiring.
 */
import { describe, expect, it, vi } from "vitest";
import {
  hubBackAction,
  installHubBackButton,
  runHubBack,
  type HubBackHandlers,
  type HubBackState,
  type BackButtonRegistration,
} from "../../../mobile/src/back-navigation";

function handlers(): HubBackHandlers & {
  closeSheet: ReturnType<typeof vi.fn>;
  showPicker: ReturnType<typeof vi.fn>;
  exitApp: ReturnType<typeof vi.fn>;
} {
  return { closeSheet: vi.fn(), showPicker: vi.fn(), exitApp: vi.fn() };
}

function state(overrides: Partial<HubBackState> = {}): HubBackState {
  return { route: "picker", sheetOpen: false, lockOpen: false, ...overrides };
}

describe("hub system back action", () => {
  it.each([
    ["picker root", state(), "exit-app"],
    ["settings", state({ route: "settings" }), "show-picker"],
    ["add server", state({ route: "add" }), "show-picker"],
    ["tailnet discovery", state({ route: "discover" }), "show-picker"],
    ["edit server", state({ route: "edit" }), "show-picker"],
    ["edit sheet", state({ sheetOpen: true }), "close-sheet"],
    ["device lock", state({ route: "discover", lockOpen: true }), "ignore"],
    ["lock over the edit sheet", state({ sheetOpen: true, lockOpen: true }), "ignore"],
  ] as const)("%s maps to %s", (_label, current, expected) => {
    expect(hubBackAction(current)).toBe(expected);
  });

  // Discovery content never gates navigation: signed-out, loading and error
  // states all live on the same route and must still return to the picker.
  it.each(["signed-out", "loading", "errored", "empty"] as const)(
    "returns to the picker from %s tailnet discovery",
    () => {
      expect(hubBackAction(state({ route: "discover" }))).toBe("show-picker");
    },
  );

  it("runs exactly the matching handler", () => {
    const picker = handlers();
    expect(runHubBack(state({ route: "discover" }), picker)).toBe("show-picker");
    expect(picker.showPicker).toHaveBeenCalledOnce();
    expect(picker.closeSheet).not.toHaveBeenCalled();
    expect(picker.exitApp).not.toHaveBeenCalled();

    const sheet = handlers();
    expect(runHubBack(state({ sheetOpen: true }), sheet)).toBe("close-sheet");
    expect(sheet.closeSheet).toHaveBeenCalledOnce();
    expect(sheet.showPicker).not.toHaveBeenCalled();
    expect(sheet.exitApp).not.toHaveBeenCalled();

    const root = handlers();
    expect(runHubBack(state(), root)).toBe("exit-app");
    expect(root.exitApp).toHaveBeenCalledOnce();
    expect(root.showPicker).not.toHaveBeenCalled();
  });

  it("does nothing while the lock gate is showing", () => {
    const spies = handlers();
    expect(runHubBack(state({ route: "settings", lockOpen: true }), spies)).toBe("ignore");
    expect(spies.closeSheet).not.toHaveBeenCalled();
    expect(spies.showPicker).not.toHaveBeenCalled();
    expect(spies.exitApp).not.toHaveBeenCalled();
  });
});

describe("hub back button registration", () => {
  it("subscribes on Android and routes live state changes", async () => {
    let listener: (() => void) | undefined;
    const remove = vi.fn(async () => undefined);
    const subscribe = vi.fn(async (callback: () => void): Promise<BackButtonRegistration> => {
      listener = callback;
      return { remove };
    });
    const spies = handlers();
    let current = state({ route: "discover" });
    const dispose = await installHubBackButton({
      platform: "android",
      subscribe,
      getState: () => current,
      handlers: spies,
    });

    expect(subscribe).toHaveBeenCalledOnce();
    listener?.();
    expect(spies.showPicker).toHaveBeenCalledOnce();

    current = state();
    listener?.();
    expect(spies.exitApp).toHaveBeenCalledOnce();

    current = state({ sheetOpen: true });
    listener?.();
    expect(spies.closeSheet).toHaveBeenCalledOnce();

    current = state({ route: "discover", lockOpen: true });
    listener?.();
    expect(spies.exitApp).toHaveBeenCalledOnce();
    expect(spies.showPicker).toHaveBeenCalledOnce();

    await dispose();
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each(["ios", "web"] as const)("leaves %s back navigation alone", async (platform) => {
    const subscribe = vi.fn(async (): Promise<BackButtonRegistration> => ({ remove: vi.fn() }));
    const dispose = await installHubBackButton({
      platform,
      subscribe,
      getState: () => state({ route: "discover" }),
      handlers: handlers(),
    });

    expect(subscribe).not.toHaveBeenCalled();
    await dispose();
  });

  it("removes the native listener at most once", async () => {
    const remove = vi.fn(async () => undefined);
    const dispose = await installHubBackButton({
      platform: "android",
      subscribe: async () => ({ remove }),
      getState: () => state(),
      handlers: handlers(),
    });

    await Promise.all([dispose(), dispose()]);
    expect(remove).toHaveBeenCalledOnce();
  });
});
