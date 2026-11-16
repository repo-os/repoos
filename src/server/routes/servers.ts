/**
 * `GET /api/servers/tailnet` — the mobile Hub's server-assisted discovery.
 *
 * The phone cannot run the Tailscale CLI or read the Tailscale app's peer list,
 * and it must not scan its network. Instead it asks one server it already
 * trusts, over the normal authenticated API, for the RepoOS servers that server
 * can see on the tailnet. Discovery is performed here with the same
 * `collectTailnetServers` the CLI uses; it has a wall-clock deadline and reports
 * a slow/failed host as `unreachable` with a reason so one bad machine cannot
 * hold the request open.
 *
 * Every row carries a ready-to-open `url` (an HTTPS MagicDNS URL when the
 * server has a `tailscale serve` mapping) so Hub never builds URLs from raw
 * IP addresses. Rows without an HTTPS URL are still reported, with `https:
 * false`, so Hub can say why they cannot be added instead of silently hiding
 * them.
 */
import { json } from "./utils.js";
import type { RouteHandler } from "./types.js";
import { resolveRemoteHosts } from "../../core/remote-hosts.js";
import { listValidatedServerRegistry } from "../../core/server-registry.js";
import {
  collectTailnetServers,
  DISCOVERY_DEADLINE_MS,
  type CollectTailnetOptions,
  type ListedServer,
} from "../../core/tailnet-servers.js";
import type { RepoOSConfig } from "../../core/types.js";

export const DISCOVERY_DISABLED_REASON =
  "Tailnet discovery is turned off on this server. Add a server manually, or enable it in Settings.";

export interface TailnetDiscoveryPayload {
  ok: true;
  servers: ListedServer[];
  tailscaleUnavailable: boolean;
  /**
   * `configured-hosts` when the local Tailscale CLI was absent/unreadable and
   * the configured `remoteValidation.tailscaleHosts` pool supplied the peers.
   */
  discoverySource?: "tailscale" | "configured-hosts";
  /** Set when the server owner turned discovery off. */
  disabled?: boolean;
  /** Plain-language explanation Hub can show without inventing one. */
  reason?: string;
}

export interface TailnetDiscoveryDeps {
  /** Test seam: replace the registry-backed local server list. */
  localRows?: ListedServer[];
  /** Test seams passed straight to `collectTailnetServers`. */
  tailscaleStatus?: () => Promise<string>;
  localServeStatus?: () => Promise<string>;
  remoteExec?: CollectTailnetOptions["remoteExec"];
  deadlineMs?: number;
  now?: () => number;
}

/**
 * Build the endpoint's response. Exported separately from the route handler so
 * tests can fake the Tailscale CLI and SSH without a live server or network.
 */
export async function buildTailnetDiscoveryPayload(
  config: Pick<RepoOSConfig, "remoteValidation" | "tailnetDiscovery">,
  deps: TailnetDiscoveryDeps = {},
): Promise<TailnetDiscoveryPayload> {
  if (config.tailnetDiscovery === false) {
    return {
      ok: true,
      servers: [],
      tailscaleUnavailable: false,
      disabled: true,
      reason: DISCOVERY_DISABLED_REASON,
    };
  }

  const localRows =
    deps.localRows ??
    (await listValidatedServerRegistry()).map((row): ListedServer => ({
      host: "local",
      port: row.entry.port,
      pid: row.entry.pid,
      root: row.entry.root,
      projectName: row.entry.projectName,
      version: row.entry.version,
      startedAt: row.entry.startedAt,
      activeEngineers: row.entry.activeEngineers ?? 0,
      engineersUpdatedAt: row.entry.engineersUpdatedAt ?? null,
      allowlistGroup: row.entry.allowlistGroup,
      uptimeSeconds: row.uptimeSeconds,
      valid: row.valid,
      staleReason: row.staleReason,
      healthRoot: row.healthRoot,
    }));

  const remoteHosts = resolveRemoteHosts(config.remoteValidation);
  const result = await collectTailnetServers(localRows, {
    configuredHosts: remoteHosts.map((host) => host.host),
    remoteHosts,
    remoteValidation: config.remoteValidation,
    annotateUrls: true,
    deadlineMs: deps.deadlineMs ?? DISCOVERY_DEADLINE_MS,
    ...(deps.tailscaleStatus ? { tailscaleStatus: deps.tailscaleStatus } : {}),
    ...(deps.localServeStatus ? { localServeStatus: deps.localServeStatus } : {}),
    ...(deps.remoteExec ? { remoteExec: deps.remoteExec } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });

  return {
    ok: true,
    servers: result.servers,
    tailscaleUnavailable: result.tailscaleUnavailable,
    discoverySource: result.source,
  };
}

export const getTailnetServers: RouteHandler = async (ctx, _req, res) => {
  return json(res, 200, await buildTailnetDiscoveryPayload(ctx.config));
};
