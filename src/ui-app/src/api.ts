/** Thin fetch wrapper over the RepoOS local server API. */

/**
 * An HTTP error from the API. Carries the status and decoded body so a caller
 * can react to a specific failure (e.g. the raw-config editor's 409, whose
 * body holds the current file content/hash) rather than only a message.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, opts);
  } catch (err) {
    // A deliberate abort (e.g. a superseded request) should surface as-is.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // fetch() rejects only on a network-level failure — the server is down,
    // the connection was refused, or the browser is offline. It never rejects
    // on an HTTP error status. Say that instead of the browser's opaque
    // "Failed to fetch" / "Load failed".
    throw new Error(
      "Can't reach the RepoOS server — it may be down. Restart it (`repoos serve`), then reload.",
    );
  }
  if (!r.ok) {
    let message = r.statusText;
    let body: unknown;
    try {
      body = await r.json();
      const b = body as { error?: unknown; reason?: unknown } | null;
      const detail = b?.error ?? b?.reason;
      if (typeof detail === "string") message = detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(message, r.status, body);
  }
  try {
    return (await r.json()) as T;
  } catch {
    // A 200 that isn't JSON is almost always the SPA fallback answering for an
    // API route the running server build doesn't have — surface that instead
    // of the raw JSON parse error (`Unexpected token '<'`).
    throw new Error(
      "The server returned an unexpected (non-JSON) response — the running server build may be older than this UI. Rebuild and reload.",
    );
  }
}

export const JSON_OPTS = (method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
