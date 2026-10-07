/**
 * Persisted RepoOS web session for the CLI (#0723).
 *
 * Stores the HttpOnly session token the server issued at login so repeat CLI
 * calls do not need OTP every time. Mode 0600, never logged. Loopback calls
 * still prefer the server's local-cli-token when present (#0582).
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export function cliSessionPath(root: string, cacheDir: string): string {
  return join(root, cacheDir, "cli-session");
}

export function readCliSession(root: string, cacheDir: string): string | null {
  try {
    const token = readFileSync(cliSessionPath(root, cacheDir), "utf8").trim();
    return token || null;
  } catch {
    return null;
  }
}

export function writeCliSession(root: string, cacheDir: string, token: string): void {
  const dir = join(root, cacheDir);
  mkdirSync(dir, { recursive: true });
  const path = cliSessionPath(root, cacheDir);
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
}

export function clearCliSession(root: string, cacheDir: string): void {
  try {
    unlinkSync(cliSessionPath(root, cacheDir));
  } catch {
    /* absent */
  }
}

/** Parse `Set-Cookie` for the RepoOS session token value. */
export function sessionTokenFromSetCookie(
  setCookie: string | string[] | undefined,
  cookieName: string,
): string | null {
  if (!setCookie) return null;
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const header of parts) {
    const segment = header.split(";")[0]?.trim();
    if (!segment?.startsWith(`${cookieName}=`)) continue;
    const value = segment.slice(cookieName.length + 1);
    if (value) return value;
  }
  return null;
}
