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
 */
// @ts-ignore: Cannot find module error due to build environment
import { InAppBrowser, DefaultWebViewOptions, iOSViewStyle } from "@capacitor/inappbrowser";

export async function openServer(url: string): Promise<void> {
  // @ts-ignore: Cannot find module error due to build environment
  await InAppBrowser.openInWebView({
    url,
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
}

export async function closeServer(): Promise<void> {
  // @ts-ignore: Cannot find module error due to build environment
  await InAppBrowser.close();
}

export interface NavEvent {
  url?: string;
}

/** Attach browser-close/navigation listeners, returns teardown. */
export function onBrowserEvents(handlers: {
  closed?: () => void;
  navigated?: (url: string) => void;
}): () => void {
  let closedHandle: { remove: () => Promise<void> } | undefined;
  let navHandle: { remove: () => Promise<void> } | undefined;

  // @ts-ignore: Cannot find module error due to build environment
  InAppBrowser.addListener("browserClosed", () => {
    handlers.closed?.();
  }).then((h: any) => (closedHandle = h));

  // @ts-ignore: Cannot find module error due to build environment
  InAppBrowser.addListener("browserPageNavigationCompleted", (data: NavEvent) => {
    if (data.url) handlers.navigated?.(data.url);
  }).then((h: any) => (navHandle = h));

  return () => {
    closedHandle?.remove();
    navHandle?.remove();
  };
}
