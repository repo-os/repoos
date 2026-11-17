/**
 * Server-side half of the native Hub return-to-picker contract (#1152).
 *
 * The SPA lives in the native shell's isolated WebView with no Capacitor
 * bridge. It learns it is in the Hub from the one-time `?repoos_hub=<token>`
 * the shell added, keeps that token for this WebView session (so a login
 * redirect can come back to it), and on the logo action performs a full-page
 * navigation to the return path. The shell validates the exact origin, path
 * and token before closing. See src/core/hub-return.ts for the contract.
 */
import {
  hubReturnHref,
  isHubReturnToken,
  readHubContext,
  stripHubContext,
  type HubReturnSession,
} from "../../../core/hub-return.js";

/** sessionStorage key scoped to this WebView tab. */
const HUB_CONTEXT_STORAGE_KEY = "repoos.hub.returnToken";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be unavailable in hardened/private contexts; the URL token
    // still works for the initial page load.
    return null;
  }
}

function remember(token: string): void {
  try {
    storage()?.setItem(HUB_CONTEXT_STORAGE_KEY, token);
  } catch {
    /* storage full or blocked — the in-memory URL token is enough */
  }
}

function rememberedToken(): string | null {
  try {
    const token = storage()?.getItem(HUB_CONTEXT_STORAGE_KEY);
    return isHubReturnToken(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * Claim the native context from the current URL, if present, and remove the
 * parameter so it does not end up in copied links or the visible URL. Called
 * once at boot; safe to call again.
 */
export function claimHubContext(
  location: Pick<Location, "href" | "origin"> = window.location,
  historyState: unknown = window.history.state,
): HubReturnSession | null {
  const fromUrl = readHubContext(location.href);
  if (fromUrl) {
    remember(fromUrl.token);
    const cleaned = new URL(stripHubContext(location.href));
    window.history.replaceState(historyState, "", cleaned.pathname + cleaned.search + cleaned.hash);
    return fromUrl;
  }
  const token = rememberedToken();
  return token ? { origin: location.origin, token } : null;
}

/**
 * The current native-Hub session, whether the token came from this URL (direct
 * open) or sessionStorage (login round-trip). Null in a normal browser.
 */
export function readHubShellSession(
  location: Pick<Location, "href" | "origin" | "search"> = window.location,
): HubReturnSession | null {
  const fromUrl = readHubContext(location.href);
  if (fromUrl) {
    remember(fromUrl.token);
    return fromUrl;
  }
  const token = rememberedToken();
  if (!token) return null;
  // sessionStorage is per origin, so the current origin is the one bound to
  // this token; the shell enforces the same origin on the native side.
  return { origin: location.origin, token };
}

/**
 * Ask the native shell to dismiss this server and show the picker. This is a
 * full document navigation on purpose: client-side routing would not produce
 * the WebView navigation event the shell listens for.
 */
export function returnToHubServerPicker(
  session: HubReturnSession,
  navigate: (href: string) => void = (href) => window.location.assign(href),
): void {
  navigate(hubReturnHref(session));
}
