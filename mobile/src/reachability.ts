/**
 * Server reachability + HTTPS validation.
 *
 * A URL is only savable if it is HTTPS and reachable at `/api/health` (the
 * RepoOS health endpoint). Validate on the native side using a plain fetch so
 * we reject non-HTTPS, non-RepoOS, or dead URLs before they ever get stored.
 */
export interface Reachability {
  ok: boolean;
  error?: string;
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let withScheme = trimmed;
  if (!/^https?:\/\//i.test(withScheme)) withScheme = "https://" + withScheme;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:") {
      // Explicitly require HTTPS — the task treats every server as untrusted.
      if (/^http:\/\//i.test(trimmed)) return null;
      // Auto-schemed input without an explicit http:// was forced to https above.
    }
    // Reject http:// explicitly entered.
    if (u.protocol === "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function isHttps(input: string): boolean {
  return normalizeUrl(input) !== null;
}

export function originOf(input: string): string | null {
  return normalizeUrl(input);
}

/**
 * Validate an HTTPS URL is reachable and responds to the RepoOS health check.
 * Returns { ok, error }.
 */
export async function validateServer(input: string, timeoutMs = 10_000): Promise<Reachability> {
  const origin = normalizeUrl(input);
  if (!origin) {
    return { ok: false, error: "Enter an HTTPS URL (e.g. https://dev.repoos.org)." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}/api/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Server responded ${res.status}, not a reachable RepoOS instance.`,
      };
    }
    const body = await res.json().catch(() => null);
    // A RepoOS health endpoint reports { status: "ok" } (see src/server). Be
    // tolerant: any 2xx JSON is accepted so we don't couple to field names.
    return { ok: true, error: body ? undefined : undefined };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Timed out — is the server reachable?"
        : "Unreachable — check the URL and your connection.",
    };
  } finally {
    clearTimeout(timer);
  }
}
