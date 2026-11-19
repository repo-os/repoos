/**
 * Server reachability + HTTPS validation.
 *
 * A URL is only savable if it is HTTPS and reachable at `/api/health` (the
 * RepoOS health endpoint). Validate on the native side using a plain fetch so
 * we reject non-HTTPS, non-RepoOS, or dead URLs before they ever get stored.
 *
 * Every rejection comes with a plain-English reason that says what is wrong and
 * what to do next; the add form shows it verbatim.
 */
export interface Reachability {
  ok: boolean;
  error?: string;
}

/** `name:` at the start of the input, unless it is `host:port` (`dev:7171`). */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

type ParsedServerInput =
  | { url: string; problem?: undefined }
  | { url?: undefined; problem: string };

/**
 * Normalize what the person typed into a saved origin (plus any Serve path).
 *
 * A scheme other than https is rejected rather than stripped: `file:///x` or
 * `ftp://x` must never become a request to a host named `file` or `ftp`.
 */
function parseServerInput(input: string): ParsedServerInput {
  const trimmed = input.trim();
  if (!trimmed) return { problem: "Enter a server URL." };

  let rest = trimmed;
  const scheme = SCHEME.exec(trimmed);
  // `dev.repoos.org:8443` looks like a scheme too; a digit after the colon means a port.
  if (scheme && !/^\d/.test(trimmed.slice(scheme[0].length))) {
    const name = scheme[1].toLowerCase();
    if (name === "http") {
      return {
        problem:
          "This address uses http://, which Hub doesn't connect to. Change it to https:// and try again.",
      };
    }
    if (name !== "https") {
      return {
        problem: `That address starts with ${name}:, which Hub can't use. Enter the server's https:// address, like https://dev.repoos.org.`,
      };
    }
    rest = trimmed.slice(scheme[0].length).replace(/^\/*/, "");
  }

  // WebKit and Chromium accept a space or `%20` inside a host (the WebView's URL
  // parser is more lenient than Node's), so check the host[:port] text here.
  const authority = rest.split(/[/?#]/, 1)[0] ?? "";
  const plausibleAuthority =
    /^[a-z0-9.-]+(:\d+)?$/i.test(authority) || /^\[[0-9a-f:.]+\](:\d+)?$/i.test(authority);
  let u: URL | null = null;
  if (plausibleAuthority) {
    try {
      u = new URL(`https://${rest}`);
    } catch {
      u = null;
    }
  }
  if (!u) {
    return {
      problem:
        "That doesn't look like a web address. Enter the server's address, like https://dev.repoos.org.",
    };
  }
  if (u.search || u.hash) {
    return {
      problem:
        "Remove everything after the ? or # in the address. Hub only needs the server address, like https://dev.repoos.org.",
    };
  }
  const path = u.pathname.replace(/\/+$/, "");
  return { url: `${u.origin}${path === "/" ? "" : path}` };
}

/** The saved origin for an address, or null when it can't be saved. */
export function serverUrlOf(input: string): string | null {
  return parseServerInput(input).url ?? null;
}

/** Why an address can't be saved, in plain English, or null when it can. */
export function serverUrlProblem(input: string): string | null {
  return parseServerInput(input).problem ?? null;
}

export function isHttps(input: string): boolean {
  return serverUrlOf(input) !== null;
}

export function originOf(input: string): string | null {
  const serverUrl = serverUrlOf(input);
  return serverUrl ? new URL(serverUrl).origin : null;
}

/**
 * Validate an HTTPS URL is reachable and responds to the RepoOS health check.
 * Returns { ok, error }.
 */
export async function validateServer(
  input: string,
  timeoutMs = 10_000,
  fetchImpl: typeof fetch = fetch,
): Promise<Reachability> {
  const parsed = parseServerInput(input);
  if (parsed.url === undefined) return { ok: false, error: parsed.problem };
  const serverUrl = parsed.url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${serverUrl}/api/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `That address answered with HTTP ${res.status}, so it isn't a RepoOS server. Check the address, including any path after the host.`,
      };
    }
    // The health endpoint answers `{ ok: true, … }`. Any other 2xx page (a
    // sign-in portal, a plain website) is not RepoOS, so it must not be saved.
    const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    if (body?.ok !== true) {
      return {
        ok: false,
        error: "That address answered, but it isn't a RepoOS server. Check the address.",
      };
    }
    return { ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? `The server didn't answer within ${Math.round(timeoutMs / 1000)} seconds. Check that it's running and reachable from this phone, then try again.`
        : "Can't reach that server. Check the address and your connection, then try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}
