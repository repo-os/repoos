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

export const API_TIMEOUT_MS = 15_000;

/**
 * Backstop timeout for model-list requests (#0593). Model probes spawn real
 * CLIs server-side (Codex's account-aware app-server alone gets 15s), so the
 * default GET budget would abort before the server could report which CLI
 * failed — with per-CLI requests each call is short, but the longer ceiling
 * keeps a slow one from being mistaken for a dead server.
 */
export const MODEL_API_TIMEOUT_MS = 30_000;

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function api<T = unknown>(path: string, opts?: ApiRequestInit): Promise<T> {
  let r: Response;
  const controller = new AbortController();
  let timedOut = false;
  const { timeoutMs: requestedTimeoutMs, ...requestInit } = opts ?? {};
  const method = (requestInit.method ?? "GET").toUpperCase();
  const boundsRequest = method === "GET" || method === "HEAD";
  const timeoutMs = requestedTimeoutMs ?? (boundsRequest ? API_TIMEOUT_MS : undefined);
  const timeout =
    timeoutMs !== undefined
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;
  const signal = requestInit.signal;
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  try {
    r = await fetch(path, { ...requestInit, signal: controller.signal });
  } catch (err) {
    // A deliberate abort (e.g. a superseded request) should surface as-is.
    if (err instanceof DOMException && err.name === "AbortError") {
      if (!timedOut || signal?.aborted) throw err;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("repoos:api-timeout", {
            detail:
              "The RepoOS server did not respond in time — retry the request or reload when the server is ready.",
          }),
        );
      }
      throw new Error(
        "The RepoOS server did not respond in time — retry the request or reload when the server is ready.",
      );
    }
    // fetch() rejects only on a network-level failure — the server is down,
    // the connection was refused, or the browser is offline. It never rejects
    // on an HTTP error status. Say that instead of the browser's opaque
    // "Failed to fetch" / "Load failed".
    throw new Error(
      "Can't reach the RepoOS server — it may be down. Restart it (`repoos serve`), then reload.",
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
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
