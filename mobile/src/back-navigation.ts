/**
 * Android system-back handling for the Hub shell.
 *
 * The picker is the shell's root. Settings, Add server and tailnet discovery
 * are local Vue routes in `App.vue`, not WebView history entries, so Android's
 * default "go back in the WebView" has nothing to pop. Capacitor's App plugin
 * consumes the gesture whenever a `backButton` listener exists, so the shell
 * must map it explicitly. With no listener the gesture does nothing on these
 * screens (the WebView cannot go back) — the bug this module fixes.
 *
 * The discovery screen's content (signed out, loading, empty, or errored)
 * never changes the navigation target: every non-picker Hub route returns to
 * the picker. Only the root picker exits the app, which is the expected
 * Android behaviour there.
 */
export type HubRoute = "picker" | "settings" | "add" | "edit" | "discover";

export interface HubBackState {
  route: HubRoute;
  /** The edit-server bottom sheet is open over the picker. */
  sheetOpen: boolean;
  /** The device-lock gate is showing; back must not dismiss or exit it. */
  lockOpen: boolean;
}

export type HubBackAction = "ignore" | "close-sheet" | "show-picker" | "exit-app";

/** Pure decision for one back gesture, in priority order. */
export function hubBackAction(state: HubBackState): HubBackAction {
  // A lock gate is modal and must not be dismissed by the system gesture.
  if (state.lockOpen) return "ignore";
  if (state.sheetOpen) return "close-sheet";
  if (state.route !== "picker") return "show-picker";
  return "exit-app";
}

export interface HubBackHandlers {
  closeSheet: () => void;
  showPicker: () => void;
  exitApp: () => void;
}

/** Apply a back gesture and return what was done (also useful in tests). */
export function runHubBack(state: HubBackState, handlers: HubBackHandlers): HubBackAction {
  const action = hubBackAction(state);
  if (action === "close-sheet") handlers.closeSheet();
  else if (action === "show-picker") handlers.showPicker();
  else if (action === "exit-app") handlers.exitApp();
  return action;
}

export interface BackButtonRegistration {
  remove: () => Promise<void> | void;
}

export interface InstallHubBackOptions {
  platform: "ios" | "android" | "web";
  /** Attach the native listener, e.g. `(cb) => App.addListener("backButton", cb)`. */
  subscribe: (listener: () => void) => Promise<BackButtonRegistration>;
  getState: () => HubBackState;
  handlers: HubBackHandlers;
}

/**
 * Attach the Android back handler. iOS and the web dev build keep their
 * platform-native behaviour and never subscribe. Returns an idempotent
 * teardown for `onUnmounted`.
 */
export async function installHubBackButton(
  options: InstallHubBackOptions,
): Promise<() => Promise<void>> {
  if (options.platform !== "android") return async () => undefined;

  const registration = await options.subscribe(() => {
    runHubBack(options.getState(), options.handlers);
  });

  let removed = false;
  return async () => {
    if (removed) return;
    removed = true;
    await registration.remove();
  };
}
