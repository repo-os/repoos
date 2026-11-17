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
  hubFallbackHref,
  hubReturnHref,
  isHubReturnToken,
  readHubContext,
  stripHubContext,
  type HubReturnSession,
} from "../../../core/hub-return.js";

/** sessionStorage key scoped to this WebView tab. */
const HUB_CONTEXT_STORAGE_KEY = "repoos.hub.returnToken";

/** How long to wait for the tiny landing page before assuming the server is down. */
export const HUB_RETURN_PROBE_TIMEOUT_MS = 1200;

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
 *
 * The landing page is tiny, but it still needs the server. If the network or
 * server is down, `browserPageNavigationCompleted` would never fire and the
 * WebView would stay open, so probe first and fall back to an in-memory
 * `blob:` document that keeps the same origin and token (and a link back to the
 * server if the shell cannot react).
 */
export async function returnToHubServerPicker(
  session: HubReturnSession,
  deps: {
    navigate?: (href: string) => void;
    reachable?: (session: HubReturnSession) => boolean | Promise<boolean>;
    createBlob?: (html: string) => string;
  } = {},
): Promise<void> {
  const navigate = deps.navigate ?? ((href: string) => window.location.assign(href));
  const reachable = deps.reachable ?? probeReturnPage;
  if (await reachable(session)) {
    navigate(hubReturnHref(session));
    return;
  }
  const createBlob =
    deps.createBlob ??
    ((html: string) => URL.createObjectURL(new Blob([html], { type: "text/html" })));
  const blobUrl = createBlob(fallbackPage(session));
  navigate(hubFallbackHref(session, blobUrl));
}

/** A minimal, script-free page used when the server cannot answer the probe. */
function fallbackPage(session: HubReturnSession): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Returning to RepoOS Hub</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:Canvas;color:CanvasText;font:15px/1.5 system-ui,sans-serif;text-align:center">
    <div>
      <p style="margin:0">Returning to RepoOS Hub&hellip;</p>
      <p style="margin:12px 0 0"><a href="${session.origin}/">Back to the server</a></p>
    </div>
  </body>
</html>`;
}

/**
 * GET the landing page with a short deadline. `redirect: "manual"` means a
 * login redirect counts as unreachable for this purpose, so the fallback wins
 * instead of leaving the WebView on a login screen with no logo.
 */
async function probeReturnPage(session: HubReturnSession): Promise<boolean> {
  if (typeof fetch !== "function" || typeof AbortController !== "function") return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HUB_RETURN_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(hubReturnHref(session).split("#")[0] ?? "", {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
