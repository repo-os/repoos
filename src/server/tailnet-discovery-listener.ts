import { createServer } from "node:http";
import { detectTailscaleIPv4 } from "../core/tailscale.js";
import { TAILNET_DISCOVERY_PORT } from "../core/tailnet-servers.js";
import type { RepoOSConfig } from "../core/types.js";
import { getTailnetPeerDiscovery } from "./routes/servers.js";
import type { RouteContext } from "./routes/types.js";

/**
 * Bind a tiny machine-level discovery listener directly to the Tailscale IP.
 * Its socket therefore carries the real peer address; no forwarded header or
 * user identity is needed, including for tagged Tailscale devices.
 */
export function startTailnetDiscoveryListener(
  config: RepoOSConfig,
  onError: (error: unknown) => void = () => {},
): () => void {
  const tailscaleIp = detectTailscaleIPv4();
  if (!tailscaleIp) return () => {};
  const bindAddress = tailscaleIp;

  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const listener = createServer((req, res) => {
    if (
      req.method !== "GET" ||
      new URL(req.url ?? "/", "http://localhost").pathname !== "/api/servers/discovery"
    ) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    void Promise.resolve(getTailnetPeerDiscovery({ config } as RouteContext, req, res, {})).catch(
      (error) => {
        onError(error);
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Discovery failed" }));
      },
    );
  });
  listener.on("error", (error: NodeJS.ErrnoException) => {
    if (closed) return;
    // One server process per machine owns the well-known port. Another RepoOS
    // instance retries after the owner exits, so discovery survives restarts.
    if (error.code === "EADDRINUSE") {
      retry = setTimeout(bind, 2_000);
      retry.unref?.();
      return;
    }
    onError(error);
  });

  function bind(): void {
    if (closed || listener.listening) return;
    listener.listen(TAILNET_DISCOVERY_PORT, bindAddress);
  }
  bind();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (listener.listening) listener.close();
  };
}
