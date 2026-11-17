/**
 * Opens a saved RepoOS server in a chromeless, isolated WebView.
 *
 * We use @capacitor/inappbrowser's `openInWebView` rather than the main app
 * WebView. This is the core security boundary: server content runs in an
 * isolated WebView with:
 *   - no Capacitor bridge (and thus no privileged native plugins),
 *   - isolated localStorage/cookies (separate Android process / iOS isolation),
 * which persist across app launches like a browser session, per origin.
 *
 * `showToolbar: false` + `showURL: false` give the chromeless experience the
 * task asks for (no tabs, no address/search bar).
 *
 * Returning to the picker (#1152) does not add a bridge: the shell opens the
 * server with a per-open `?repoos_hub=<token>`, and the SPA may navigate to the
 * exact return path with that token. `browserPageNavigationCompleted` is the
 * existing supported navigation contract; only that exact origin/path/token
 * dismisses the browser (see src/core/hub-return.ts). Server content therefore
 * never gains a native capability — the most it can do is close its own
 * browser, which is a UI action the user invoked from the logo.
 */
import { InAppBrowser, DefaultWebViewOptions, iOSViewStyle } from "@capacitor/inappbrowser";
import {
  applyHubNavigation,
  createHubReturnToken,
  withHubContext,
  type HubReturnSession,
} from "../../src/core/hub-return.js";

/** This open's origin and token, or null when no server is open. */
let activeSession: HubReturnSession | null = null;

/** Test/status hook: the session the next navigation is checked against. */
export function activeHubSession(): HubReturnSession | null {
  return activeSession;
}

export async function openServer(url: string): Promise<void> {
  const token = createHubReturnToken();
  // Parse before opening so an invalid URL fails without changing the session.
  const scopedUrl = withHubContext(url, token);
  activeSession = { origin: new URL(url).origin, token };
  try {
    await InAppBrowser.openInWebView({
      url: scopedUrl,
      options: {
        ...DefaultWebViewOptions,
        showToolbar: false,
        showURL: false,
        showNavigationButtons: false,
        clearCache: false,
        clearSessionCache: false,
        closeButtonText: "Done",
        android: {
          ...DefaultWebViewOptions.android,
          // Defaults to true; kept explicit because isolation is the boundary
          // that keeps server content away from native APIs.
          isIsolated: true,
        },
        iOS: {
          ...DefaultWebViewOptions.iOS,
          viewStyle: iOSViewStyle.FULL_SCREEN,
        },
      },
    });
  } catch (error) {
    activeSession = null;
    throw error;
  }
}

export async function closeServer(): Promise<void> {
  activeSession = null;
  await InAppBrowser.close();
}

export interface NavEvent {
  url?: string;
}

/** Attach browser-close/navigation listeners, returns teardown. */
export function onBrowserEvents(handlers: {
  closed?: () => void;
  navigated?: (url: string) => void;
  /** The SPA asked to return to the native server picker. */
  returned?: () => void;
}): () => void {
  let closedHandle: { remove: () => Promise<void> } | undefined;
  let navHandle: { remove: () => Promise<void> } | undefined;

  InAppBrowser.addListener("browserClosed", () => {
    activeSession = null;
    handlers.closed?.();
  }).then((h) => (closedHandle = h));

  InAppBrowser.addListener("browserPageNavigationCompleted", (data: NavEvent) => {
    applyHubNavigation(data.url, activeSession, {
      closeBrowser: () => {
        activeSession = null;
        void InAppBrowser.close();
      },
      navigated: handlers.navigated,
      returned: handlers.returned,
    });
  }).then((h) => (navHandle = h));

  return () => {
    closedHandle?.remove();
    navHandle?.remove();
  };
}
