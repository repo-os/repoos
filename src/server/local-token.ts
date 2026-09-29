/**
 * Local control-plane token for the CLI (#0582).
 *
 * `repoos shot` talks to the running server over loopback, but a browser-less
 * CLI has no session cookie. When auth is enabled the server writes a random
 * token to `<cacheDir>/local-cli-token` (mode 0600); the CLI reads it and sends
 * it as `x-repoos-local-token`. The server accepts it only from a loopback
 * peer, so a request arriving through the tunnel cannot use it without the
 * file. Regenerated on every server boot, so a stale token is never trusted
 * across restarts. Never logged; never part of `repoos.toml`.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Absolute path of the token file a running server wrote. */
export function localCliTokenPath(root: string, cacheDir: string): string {
  return join(root, cacheDir, "local-cli-token");
}

/** Read the token a running server wrote, or null when absent. */
export function readLocalCliToken(root: string, cacheDir: string): string | null {
  try {
    const token = readFileSync(localCliTokenPath(root, cacheDir), "utf8").trim();
    return token || null;
  } catch {
    return null;
  }
}

/** Generate and persist a fresh token for this server run. Best-effort. */
export function writeLocalCliToken(root: string, cacheDir: string): string | null {
  try {
    const token = randomBytes(32).toString("hex");
    const dir = join(root, cacheDir);
    mkdirSync(dir, { recursive: true });
    const path = localCliTokenPath(root, cacheDir);
    writeFileSync(path, `${token}\n`, { mode: 0o600 });
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best-effort on platforms without chmod semantics */
    }
    return token;
  } catch {
    return null;
  }
}

/** Constant-time comparison of a provided token against the expected one. */
export function localTokenMatches(provided: string | undefined, expected: string | null): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Whether a socket peer address is loopback (v4, v6, or v6-mapped v4). */
export function isLoopbackAddress(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}
