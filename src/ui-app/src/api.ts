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
  return r.json() as Promise<T>;
}

export const JSON_OPTS = (method: "POST" | "PATCH", body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
