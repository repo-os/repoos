/**
 * Per-browser repo color preference.
 *
 * The web UI has always kept this in `localStorage` under
 * `repoos.repoColor.<repoName>`. The native macOS Hub embeds the web UI in an
 * isolated `WKWebView`, so it cannot see that storage from SwiftUI and has no
 * JavaScript bridge (see docs/adr/0006-macos-repoos-hub.md). A first-party
 * cookie is the one browser-owned value both sides can read: the web UI writes
 * it, and the Hub reads only this named cookie from the server's isolated
 * cookie store and observes changes to update its sidebar immediately.
 *
 * `localStorage` stays the web UI's fallback and migration source for colors
 * picked before the cookie existed; it is not sent to the server.
 */

export const REPO_COLOR_STORAGE_PREFIX = "repoos.repoColor.";
export const REPO_COLOR_COOKIE = "repoos_repo_color";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The localStorage key the repo header has used since #0257. */
export function repoColorStorageKey(repoName: string): string {
  return REPO_COLOR_STORAGE_PREFIX + repoName.toLowerCase().replace(/\//g, "-");
}

/** Normalize a swatch value to `#RRGGBB`, or null when it is not a color. */
export function normalizeRepoColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return HEX_COLOR.test(trimmed) ? trimmed.toUpperCase() : null;
}

/**
 * The cookie value for a repo color. The repo name is included so a server
 * that later serves a different repo cannot inherit a stale color. An empty
 * color is an explicit "Default" choice, distinct from no cookie at all.
 */
export function repoColorCookieValue(repoName: string, color: string | null): string {
  return encodeURIComponent(`${repoName.toLowerCase()}:${color ?? ""}`);
}

/** Parse a preference cookie, returning null when it is malformed. */
export function parseRepoColorCookie(
  rawValue: string,
): { repoName: string; color: string | null } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    return null;
  }
  const separator = decoded.lastIndexOf(":");
  if (separator === -1) {
    // Accept a bare color from a hand-written or older cookie.
    const color = normalizeRepoColor(decoded);
    return color ? { repoName: "", color } : null;
  }
  const repoName = decoded.slice(0, separator);
  const color = normalizeRepoColor(decoded.slice(separator + 1));
  return { repoName, color };
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined" || !document.cookie) return null;
  for (const pair of document.cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function readStoredColor(repoName: string): string | null {
  try {
    return normalizeRepoColor(window.localStorage.getItem(repoColorStorageKey(repoName)));
  } catch {
    return null;
  }
}

/**
 * Read the current repo's color. The cookie wins; a legacy localStorage value
 * is migrated into the cookie so the Hub can see it.
 */
export function readRepoColor(repoName: string): string | null {
  if (!repoName) return null;

  const rawCookie = readCookie(REPO_COLOR_COOKIE);
  if (rawCookie !== null) {
    const parsed = parseRepoColorCookie(rawCookie);
    // Accept a bare color as the pre-repo-scoped legacy format.
    if (
      parsed &&
      (parsed.repoName === "" || parsed.repoName.toLowerCase() === repoName.toLowerCase())
    ) {
      return parsed.color;
    }
  }

  const legacy = readStoredColor(repoName);
  if (legacy) {
    writeCookie(REPO_COLOR_COOKIE, repoColorCookieValue(repoName, legacy));
  }
  return legacy;
}

/** Persist a color, or an explicit Default (`null`) that clears both stores. */
export function writeRepoColor(repoName: string, color: string | null): void {
  if (!repoName) return;
  const normalized = normalizeRepoColor(color);
  const key = repoColorStorageKey(repoName);
  try {
    if (normalized) {
      window.localStorage.setItem(key, normalized);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Private browsing or a full quota: the cookie below is still the
    // preference the Hub reads.
  }
  writeCookie(REPO_COLOR_COOKIE, repoColorCookieValue(repoName, normalized));
}
