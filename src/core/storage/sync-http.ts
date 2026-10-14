/**
 * A synchronous HTTP/HTTPS client with zero runtime dependencies (#0660).
 *
 * Why this exists: the storage-provider interface (#0658) is deliberately
 * **synchronous** — the server's attachment read path (`readAttachment`,
 * `resolveScreenshot`, `listAttachments`) calls `provider.get()`/`list()`
 * inline from request handlers, and the interface was frozen that way before
 * any cloud provider existed. Node and Bun both lack a synchronous HTTP
 * primitive, so a remote provider has to bridge the async network call back
 * onto the calling thread itself.
 *
 * The bridge is a child process: the request runs in a short-lived
 * `process.execPath` child (`node:http`/`node:https`), whose own event loop is
 * free to drive the socket, and the parent blocks in `spawnSync` until the
 * child prints a JSON result. This was chosen over a `worker_threads` +
 * `Atomics.wait` bridge deliberately: **Bun starves a worker's I/O loop while
 * the main thread sits in `Atomics.wait`**, so the worker's socket never
 * receives the response (verified on Bun 1.4.2 — the worker connects and
 * writes, then times out). RepoOS runs on Bun by default, so the worker bridge
 * is not viable here. `spawnSync` works identically on Bun and Node, needs no
 * package and no native addon, and keeps the child script inline (no asset to
 * copy into `dist/`).
 *
 * Costs and limits, stated honestly: one process per request (a few ms of
 * fork/exec, fine for attachment reads at human scale, not for bulk
 * operations), and a full response body buffered in memory (the server's own
 * screenshot ceiling is 10 MB, far below Neon's 5 GiB object limit). This is
 * the transport seam for the Neon provider; tests inject a fake and never
 * spawn anything.
 */
import { spawnSync } from "node:child_process";

/** One request the transport must perform. */
export interface SyncHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
}

/** The response, with the body fully read into a Buffer. */
export interface SyncHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
}

/** A transport performs one request synchronously, throwing on network failure. */
export type SyncHttpTransport = (request: SyncHttpRequest) => SyncHttpResponse;

/**
 * The child program, run with `--eval`. Reads `REPOOS_SYNC_HTTP_REQUEST` (a
 * JSON envelope) from the environment, performs the request, and writes one
 * JSON envelope to stdout: `{ status, statusText, headers, body }` on success
 * or `{ error }` on failure. It exercises `http`/`https` from the runtime it
 * inherits, so it speaks TLS to a Neon endpoint without any extra config.
 */
const CHILD_SCRIPT = `
const http = process.getBuiltinModule("node:http");
const https = process.getBuiltinModule("node:https");
const req = JSON.parse(process.env.REPOOS_SYNC_HTTP_REQUEST || "{}");
const mod = req.url.startsWith("https:") ? https : http;
const request = mod.request(req.url, { method: req.method, headers: req.headers }, (res) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => {
    process.stdout.write(JSON.stringify({
      status: res.statusCode,
      statusText: res.statusMessage || "",
      headers: res.headers,
      body: Buffer.concat(chunks).toString("base64"),
    }));
  });
});
request.on("error", (err) => {
  process.stdout.write(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
});
if (req.bodyBase64) request.write(Buffer.from(req.bodyBase64, "base64"));
request.end();
`;

/**
 * Perform one request synchronously by delegating it to a child process and
 * blocking on `spawnSync`. Throws on a network failure or a malformed child
 * response; the provider converts that to a `{ error }` / `null` rather than
 * letting it reach a request handler.
 */
export function syncHttpRequest(request: SyncHttpRequest): SyncHttpResponse {
  const envelope = {
    method: request.method,
    url: request.url,
    headers: request.headers,
    bodyBase64: request.body ? request.body.toString("base64") : "",
  };

  const child = spawnSync(process.execPath, ["--eval", CHILD_SCRIPT], {
    env: { ...process.env, REPOOS_SYNC_HTTP_REQUEST: JSON.stringify(envelope) },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });

  if (child.error) throw child.error;
  const stdout = (child.stdout ?? "").trim();
  if (!stdout) {
    throw new Error(
      child.stderr?.trim()
        ? `synchronous HTTP request failed: ${child.stderr.trim().slice(0, 500)}`
        : "synchronous HTTP request produced no response",
    );
  }

  let parsed: {
    error?: string;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("synchronous HTTP request produced a malformed response");
  }
  if (parsed.error) throw new Error(parsed.error);

  return {
    status: parsed.status ?? 0,
    statusText: parsed.statusText ?? "",
    headers: parsed.headers ?? {},
    body: Buffer.from(parsed.body ?? "", "base64"),
  };
}
