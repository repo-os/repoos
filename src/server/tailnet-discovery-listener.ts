import { createServer } from "node:http";
import { detectTailscaleIPv4, detectTailscaleIPv6 } from "../core/tailscale.js";
import { TAILNET_DISCOVERY_PORT } from "../core/tailnet-servers.js";
import { getTailnetPeerDiscovery } from "./routes/servers.js";
import type { RouteContext } from "./routes/types.js";

/**
 * Bind a tiny machine-level discovery listener directly to the Tailscale IP.
 * Its socket therefore carries the real peer address; no forwarded header or
 * user identity is needed, including for tagged Tailscale devices.
 */
export function startTailnetDiscoveryListener(
  onError: (error: unknown) => void = () => {},
): () => void {
  const bindAddresses = [detectTailscaleIPv4(), detectTailscaleIPv6()].filter(
    (address): address is string => !!address,
  );
  if (!bindAddresses.length) return () => {};

  let closed = false;
  const listeners = bindAddresses.map((bindAddress) => {
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
      // Each registry row carries the opt-out recorded by that project. Do not
      // bind the listener owner's repo config to this machine-level port.
      void Promise.resolve(getTailnetPeerDiscovery({} as RouteContext, req, res, {})).catch(
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
    return { listener, bind, clearRetry: () => retry && clearTimeout(retry) };
  });
  for (const item of listeners) item.bind();

  return () => {
    closed = true;
    for (const { listener, clearRetry } of listeners) {
      clearRetry();
      if (listener.listening) listener.close();
    }
  };
}
