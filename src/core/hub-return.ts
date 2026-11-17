/**
 * Return-to-picker contract between the native RepoOS Hub shell and the
 * server-served SPA running inside its isolated WebView (#1152).
 *
 * The connected server has no Capacitor bridge on purpose (see
 * docs/mobile-architecture.md), so it cannot call a privileged native API.
 * The only thing it may ask for is "dismiss this browser and show the server
 * picker" — exactly the logo action on a phone.
 *
 * The handshake is deliberately narrow:
 *
 * 1. The shell generates a fresh random token for each open and adds it to the
 *    server URL as `?repoos_hub=<token>`.
 * 2. The SPA reads that token, then navigates to
 *    `<origin>/__repoos_hub/return-to-picker#hub-return=<token>` on the logo
 *    action. The token travels in the fragment, so the server never receives
 *    it.
 * 3. The shell's existing `browserPageNavigationCompleted` listener accepts the
 *    navigation only when the URL's origin is exactly the origin it opened, the
 *    path is exactly the return path, and the fragment carries this open's
 *    token. Then it closes the InAppBrowser. Anything else is ordinary
 *    navigation.
 *
 * A same-origin page can at most dismiss the browser; no native capability is
 * reachable. Foreign origins never load in the isolated WebView (they open in
 * the system browser), and a stale token from another app open never matches
 * the shell's current in-memory token.
 */

/** Query parameter the native shell adds to the URL it opens. */
export const HUB_CONTEXT_PARAM = "repoos_hub";

/** The public landing path the shell watches for. */
export const HUB_RETURN_PATH = "/__repoos_hub/return-to-picker";

const HUB_RETURN_HASH_PREFIX = "#hub-return=";
const HUB_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

/** A native-app open: the server origin plus this open's random token. */
export interface HubReturnSession {
  origin: string;
  token: string;
}

/** Generate a 128-bit token for one server open. */
export function createHubReturnToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isHubReturnToken(value: string | null | undefined): value is string {
  return typeof value === "string" && HUB_TOKEN_PATTERN.test(value);
}

function webOrigin(href: string): URL | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Read the native-shell context from the URL the shell opened. */
export function readHubContext(href: string): HubReturnSession | null {
  const url = webOrigin(href);
  if (!url) return null;
  const token = url.searchParams.get(HUB_CONTEXT_PARAM);
  if (!isHubReturnToken(token)) return null;
  return { origin: url.origin, token };
}

/** Add the native-shell context to a server URL, preserving path/query/hash. */
export function withHubContext(href: string, token: string): string {
  const url = webOrigin(href);
  if (!url) throw new Error("RepoOS Hub can only open an http(s) server URL.");
  url.searchParams.set(HUB_CONTEXT_PARAM, token);
  return url.toString();
}

/** Remove the context parameter from a URL after the SPA has claimed it. */
export function stripHubContext(href: string): string {
  const url = webOrigin(href);
  if (!url) return href;
  url.searchParams.delete(HUB_CONTEXT_PARAM);
  return url.toString();
}

/** The one navigation the native shell treats as "return to the picker". */
export function hubReturnHref(session: HubReturnSession): string {
  return `${session.origin}${HUB_RETURN_PATH}${HUB_RETURN_HASH_PREFIX}${session.token}`;
}

/**
 * True only for this open's exact origin, return path and token. The shell
 * calls this before dismissing the browser; normal navigation must never
 * match.
 */
export function isHubReturnHref(
  href: string,
  session: HubReturnSession | null | undefined,
): boolean {
  if (!session || !isHubReturnToken(session.token)) return false;
  const url = webOrigin(href);
  if (!url) return false;
  return (
    url.origin === session.origin &&
    url.pathname === HUB_RETURN_PATH &&
    url.search === "" &&
    url.hash === `${HUB_RETURN_HASH_PREFIX}${session.token}`
  );
}

/** What the shell does with one completed WebView navigation. */
export type HubNavigationAction = "close-browser" | "continue";

/** Map one WebView navigation event to the shell's action. */
export function hubNavigationAction(
  href: string,
  session: HubReturnSession | null | undefined,
): HubNavigationAction {
  return isHubReturnHref(href, session) ? "close-browser" : "continue";
}
