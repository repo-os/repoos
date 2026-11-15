/**
 * Tailnet discovery shared by `repoos servers --tailscale` and the authenticated
 * `GET /api/servers/tailnet` endpoint the mobile Hub calls.
 *
 * Discovery runs entirely on the machine that owns the trust relationship: the
 * Tailscale CLI lists online peers, and each peer is asked over SSH for its
 * `repoos servers --json`. The phone never scans or broadcasts — it asks one
 * server it already trusts. Keeping this in `src/core` means the CLI and the
 * server cannot drift into two slightly different discovery implementations.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { remoteHostUser } from "./remote-hosts.js";
import type { RemoteValidationConfig, RemoteValidationHost } from "./types.js";

const execFileAsync = promisify(execFile);

/** Per-command budget for one remote host. */
export const HOST_TIMEOUT_MS = 4_000;
/** Whole-request budget for one discovery pass; slow hosts become `unreachable`. */
export const DISCOVERY_DEADLINE_MS = 8_000;
/** `tailscale status --json` is local and cheap; never let it hold a request. */
const TAILSCALE_STATUS_TIMEOUT_MS = 2_000;
/** URL enrichment is a nicety; a slow `serve status` must not hide servers. */
const SERVE_STATUS_TIMEOUT_MS = 1_500;

export interface ListedServer {
  host: string;
  port?: number;
  pid?: number;
  root?: string;
  projectName?: string;
  valid?: boolean;
  uptimeSeconds?: number | null;
  activeEngineers?: number;
  staleReason?: string | null;
  unreachable?: boolean;
  reason?: string;
  /** URL a tailnet client can open (set when discovery annotates URLs). */
  url?: string;
  /** Whether `url` is HTTPS. Hub only offers HTTPS URLs for saving. */
  https?: boolean;
  [key: string]: unknown;
}

interface TailnetStatusPeer {
  HostName?: string;
  DNSName?: string;
  Online?: boolean;
}

interface TailnetStatus {
  Self?: TailnetStatusPeer;
  Peer?: Record<string, TailnetStatusPeer>;
}

export interface TailnetPeer {
  /** Short host name (`bee`, `thinkpad`) used for display and SSH. */
  host: string;
  /** MagicDNS name without the trailing dot, when Tailscale reports one. */
  dnsName?: string;
}

export interface TailnetInfo {
  /** This machine, as Tailscale knows it. Absent when status is unreadable. */
  self?: TailnetPeer;
  peers: TailnetPeer[];
}

function peerFromStatus(peer: TailnetStatusPeer | undefined): TailnetPeer | null {
  if (!peer) return null;
  const dnsName = (peer.DNSName ?? "").replace(/\.$/, "") || undefined;
  const host = (peer.HostName ?? peer.DNSName ?? "").replace(/\.$/, "").split(".")[0];
  if (!host) return null;
  return { host, ...(dnsName ? { dnsName } : {}) };
}

/**
 * Parse `tailscale status --json` into this machine plus its online peers.
 * Offline peers and this machine are excluded from `peers`; duplicate hosts
 * (Tailscale occasionally reports both a HostName and a DNSName) are collapsed.
 */
export function parseTailnetInfo(json: string): TailnetInfo {
  const status = JSON.parse(json) as TailnetStatus;
  const self = peerFromStatus(status.Self) ?? undefined;
  const seen = new Set<string>();
  const peers: TailnetPeer[] = [];
  for (const raw of Object.values(status.Peer ?? {})) {
    if (raw.Online === false) continue;
    const peer = peerFromStatus(raw);
    if (!peer || peer.host === self?.host || seen.has(peer.host)) continue;
    seen.add(peer.host);
    peers.push(peer);
  }
  return { ...(self ? { self } : {}), peers };
}

/** Backwards-compatible helper used by `repoos servers --tailscale`. */
export function parseTailnetPeers(json: string): string[] {
  return parseTailnetInfo(json).peers.map((peer) => peer.host);
}

/**
 * Map the local proxy ports in `tailscale serve status --json` to the HTTPS
 * MagicDNS URLs that terminate TLS for them. `repoos serve` creates these
 * mappings itself (see `src/core/tailscale.ts`), so this is how a discovered
 * remote server gets a URL the phone can actually open rather than a raw
 * `http://<host>:<port>` guess.
 */
export function parseTailscaleServeUrls(json: string): Record<number, string> {
  const out: Record<number, string> = {};
  let cfg: {
    Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> } | undefined>;
  };
  try {
    cfg = JSON.parse(json || "{}") as typeof cfg;
  } catch {
    return out;
  }
  for (const [hostPort, web] of Object.entries(cfg.Web ?? {})) {
    if (!web || typeof web !== "object") continue;
    // Keys look like "bee.tailnet.ts.net:8443" (or ":443" omitted only in
    // older docs; be defensive and default to 443).
    const match = /^(.*?)(?::(\d+))?$/.exec(hostPort);
    const tlsHost = match?.[1];
    const tlsPort = Number(match?.[2] ?? 443);
    if (!tlsHost || !Number.isFinite(tlsPort)) continue;
    const base = `https://${tlsHost}${tlsPort === 443 ? "" : `:${tlsPort}`}`;
    for (const [path, handler] of Object.entries(web.Handlers ?? {})) {
      const proxy = handler?.Proxy;
      if (typeof proxy !== "string") continue;
      const proxied = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)(?:\/.*)?$/.exec(proxy);
      const localPort = Number(proxied?.[1]);
      if (!Number.isFinite(localPort) || out[localPort]) continue;
      const suffix = path === "/" ? "" : path.replace(/\/$/, "");
      out[localPort] = `${base}${suffix}`;
    }
  }
  return out;
}

/** Build the URL a tailnet client can open for one discovered server. */
export function tailnetServerUrl(input: {
  host: string;
  dnsName?: string;
  port?: number;
  httpsByPort?: Record<number, string>;
}): { url?: string; https?: boolean } {
  if (!input.port) return {};
  const https = input.httpsByPort?.[input.port];
  if (https) return { url: https, https: true };
  const host = input.dnsName || input.host;
  if (!host || host === "local") return {};
  // Tailscale encrypts transport, but Hub's add flow requires an https origin.
  // Reporting the http URL (rather than inventing one) lets Hub show the server
  // as "needs HTTPS" instead of silently saving something it cannot open.
  return { url: `http://${host}:${input.port}`, https: false };
}

/**
 * Execute a command on a tailnet peer over SSH. `command` defaults to
 * `repoos servers --json`; discovery asks for `tailscale serve status --json`
 * through the same seam so tests can fake both calls.
 */
export type RemoteExec = (
  host: string,
  user: string,
  timeoutMs: number,
  command?: string,
) => Promise<string>;

export function serversSshArgs(
  host: string,
  user: string,
  timeoutMs: number,
  command = "repoos servers --json",
): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
    `${user}@${host}`,
    command,
  ];
}

const defaultRemoteExec: RemoteExec = async (host, user, timeoutMs, command) => {
  const { stdout } = await execFileAsync("ssh", serversSshArgs(host, user, timeoutMs, command), {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
};

async function defaultTailscaleStatus(): Promise<string> {
  const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
    timeout: TAILSCALE_STATUS_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
}

async function defaultTailscaleServeStatus(): Promise<string> {
  const { stdout } = await execFileAsync("tailscale", ["serve", "status", "--json"], {
    timeout: TAILSCALE_STATUS_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
}

/** Resolve `promise`, or `fallback()` once `ms` elapses. Never rejects. */
async function within<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), Math.max(0, ms));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface CollectTailnetOptions {
  /** Test seam: replace the local `tailscale status --json` call. */
  tailscaleStatus?: () => Promise<string>;
  /** Test seam: replace the local `tailscale serve status --json` call. */
  localServeStatus?: () => Promise<string>;
  configuredHosts?: string[];
  remoteHosts?: RemoteValidationHost[];
  remoteValidation?: RemoteValidationConfig;
  remoteExec?: RemoteExec;
  /** Per-remote-command budget. Defaults to {@link HOST_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Whole-pass budget. Defaults to {@link DISCOVERY_DEADLINE_MS}. */
  deadlineMs?: number;
  /** Add `url`/`https` to every row that has a serviceable URL. */
  annotateUrls?: boolean;
  /** Test seam for the deadline clock. */
  now?: () => number;
}

export interface TailnetCollection {
  servers: ListedServer[];
  tailscaleUnavailable: boolean;
  /** This machine's Tailscale identity, when status parsed successfully. */
  self?: TailnetPeer;
}

/**
 * List local plus tailnet servers. Partial results are the contract: a failed
 * or slow peer becomes `{ host, unreachable: true, reason }` and never blocks
 * the rest.
 */
export async function collectTailnetServers(
  local: ListedServer[],
  options: CollectTailnetOptions = {},
): Promise<TailnetCollection> {
  const timeoutMs = options.timeoutMs ?? HOST_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const deadlineAt = now() + (options.deadlineMs ?? DISCOVERY_DEADLINE_MS);

  let statusJson: string | undefined;
  let info: TailnetInfo | undefined;
  let tailscaleUnavailable = false;
  try {
    statusJson = await within(
      (options.tailscaleStatus ?? defaultTailscaleStatus)(),
      Math.min(timeoutMs, TAILSCALE_STATUS_TIMEOUT_MS),
      () => {
        throw new Error("tailscale status timed out");
      },
    );
  } catch {
    tailscaleUnavailable = true;
  }
  if (statusJson !== undefined) {
    try {
      info = parseTailnetInfo(statusJson);
    } catch {
      tailscaleUnavailable = true;
    }
  }

  // A parsed status is authoritative even when it names no peers. Only a
  // missing/unreadable Tailscale CLI falls back to configured hosts (the same
  // behaviour the CLI has always had).
  const peers: TailnetPeer[] = tailscaleUnavailable
    ? (options.configuredHosts ?? []).map((host) => ({ host }))
    : (info?.peers ?? []);

  // Local serve mappings are read once; failure just means no HTTPS URL for
  // this machine's own servers (the rows still come back).
  let localHttpsByPort: Record<number, string> = {};
  if (options.annotateUrls && info) {
    try {
      localHttpsByPort = parseTailscaleServeUrls(
        await within(
          (options.localServeStatus ?? defaultTailscaleServeStatus)(),
          Math.min(timeoutMs, SERVE_STATUS_TIMEOUT_MS),
          () => "",
        ),
      );
    } catch {
      localHttpsByPort = {};
    }
  }

  const localRows = options.annotateUrls
    ? local.map((row) => ({
        ...row,
        ...tailnetServerUrl({
          host: info?.self?.host ?? "local",
          dnsName: info?.self?.dnsName,
          port: row.port,
          httpsByPort: localHttpsByPort,
        }),
      }))
    : local;

  const remoteExec = options.remoteExec ?? defaultRemoteExec;
  const configuredByHost = new Map((options.remoteHosts ?? []).map((host) => [host.host, host]));
  const remotes = await Promise.all(
    peers.map(async (peer): Promise<ListedServer[]> => {
      const hostConfig = configuredByHost.get(peer.host) ?? { host: peer.host };
      const user = options.remoteValidation
        ? remoteHostUser(options.remoteValidation, hostConfig)
        : hostConfig.user?.trim() || "root";
      const work = async (): Promise<ListedServer[]> => {
        try {
          // The two reads are independent; running them together keeps a host
          // inside the per-host budget instead of spending it twice.
          const [serversJson, serveJson] = await Promise.all([
            remoteExec(peer.host, user, timeoutMs, "repoos servers --json"),
            options.annotateUrls
              ? within(
                  remoteExec(
                    peer.host,
                    user,
                    Math.min(timeoutMs, SERVE_STATUS_TIMEOUT_MS),
                    "tailscale serve status --json",
                  ).catch(() => ""),
                  SERVE_STATUS_TIMEOUT_MS,
                  () => "",
                )
              : Promise.resolve(""),
          ]);
          const payload = JSON.parse(serversJson) as { servers?: Record<string, unknown>[] };
          if (!Array.isArray(payload.servers))
            throw new Error("remote response has no servers list");
          const httpsByPort = options.annotateUrls ? parseTailscaleServeUrls(serveJson) : {};
          return payload.servers.map(
            (server) =>
              ({
                ...server,
                host: peer.host,
                ...(options.annotateUrls
                  ? tailnetServerUrl({
                      host: peer.host,
                      dnsName: peer.dnsName,
                      port: typeof server.port === "number" ? server.port : undefined,
                      httpsByPort,
                    })
                  : {}),
              }) as ListedServer,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          return [
            {
              host: peer.host,
              unreachable: true,
              reason: /timed? ?out|timeout/i.test(reason) ? "timed out" : reason,
            },
          ];
        }
      };
      return within(work(), deadlineAt - now(), () => [
        { host: peer.host, unreachable: true, reason: "timed out" },
      ]);
    }),
  );
  return {
    servers: [...localRows, ...remotes.flat()],
    tailscaleUnavailable,
    ...(info?.self ? { self: info.self } : {}),
  };
}
