/** Thin fetch wrapper over the RepoOS local server API. */

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let message = r.statusText;
    try {
      const body = await r.json();
      if (body && (body.error || body.reason)) message = body.error ?? body.reason;
    } catch {
      /* keep statusText */
    }
    throw new Error(message);
  }
  try {
    return (await r.json()) as T;
  } catch {
    // A 200 that isn't JSON is almost always the SPA fallback answering for an
    // API route the running server build doesn't have — surface that instead
    // of the raw JSON parse error (`Unexpected token '<'`).
    throw new Error("The server returned an unexpected (non-JSON) response — the running server build may be older than this UI. Rebuild and reload.");
  }
}

export const JSON_OPTS = (method: "POST" | "PATCH", body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
