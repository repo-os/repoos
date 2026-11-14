/** `repoos servers` — list registered RepoOS control-plane processes. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findRepoRoot, loadConfig } from "../core/config.js";
import { resolveRemoteHosts } from "../core/remote-hosts.js";
import {
  listValidatedServerRegistry,
  pruneStaleServerRegistryEntries,
} from "../core/server-registry.js";
import { c } from "../cli/colors.js";

const execFileAsync = promisify(execFile);
const HOST_TIMEOUT_MS = 4_000;

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
  [key: string]: unknown;
}

interface TailnetStatus {
  Self?: { HostName?: string; DNSName?: string };
  Peer?: Record<string, { HostName?: string; DNSName?: string; Online?: boolean }>;
}

export function parseTailnetPeers(json: string): string[] {
  const status = JSON.parse(json) as TailnetStatus;
  const self = (status.Self?.HostName ?? status.Self?.DNSName ?? "")
    .replace(/\.$/, "")
    .split(".")[0];
  return [
    ...new Set(
      Object.values(status.Peer ?? {})
        .filter((peer) => peer.Online !== false)
        .map((peer) => (peer.HostName ?? peer.DNSName ?? "").replace(/\.$/, "").split(".")[0])
        .filter((host) => host && host !== self),
    ),
  ];
}

type RemoteExec = (host: string, timeoutMs: number) => Promise<string>;

const defaultRemoteExec: RemoteExec = async (host, timeoutMs) => {
  const { stdout } = await execFileAsync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
      host,
      "repoos servers --json",
    ],
    { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
  );
  return stdout.toString();
};

export async function collectTailnetServers(
  local: ListedServer[],
  options: {
    tailscaleStatus?: () => Promise<string>;
    configuredHosts?: string[];
    remoteExec?: RemoteExec;
    timeoutMs?: number;
  } = {},
): Promise<{ servers: ListedServer[]; tailscaleUnavailable: boolean }> {
  let peers: string[] = [];
  let tailscaleUnavailable = false;
  try {
    peers = parseTailnetPeers(
      await (
        options.tailscaleStatus ??
        (async () => {
          const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
            timeout: 2_000,
            maxBuffer: 2 * 1024 * 1024,
          });
          return stdout.toString();
        })
      )(),
    );
  } catch {
    tailscaleUnavailable = true;
    peers = options.configuredHosts ?? [];
  }
  const remoteExec = options.remoteExec ?? defaultRemoteExec;
  const remotes = await Promise.all(
    peers.map(async (host): Promise<ListedServer[]> => {
      try {
        const payload = JSON.parse(
          await remoteExec(host, options.timeoutMs ?? HOST_TIMEOUT_MS),
        ) as { servers?: Record<string, unknown>[] };
        if (!Array.isArray(payload.servers)) throw new Error("remote response has no servers list");
        return payload.servers.map((server) => ({ ...server, host }) as ListedServer);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return [
          {
            host,
            unreachable: true,
            reason: /timed? ?out|timeout/i.test(reason) ? "timed out" : reason,
          },
        ];
      }
    }),
  );
  return { servers: [...local, ...remotes.flat()], tailscaleUnavailable };
}

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60),
    s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export async function cmdServers(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  const prune = argv.includes("--prune");
  const tailscale = argv.includes("--tailscale");
  if (prune && tailscale) {
    console.error(c.yellow("  --prune is local-only; remove --tailscale to prune local servers."));
    return;
  }

  let pruned: number | undefined;
  if (prune) pruned = await pruneStaleServerRegistryEntries();
  const localRows = await listValidatedServerRegistry();
  const local: ListedServer[] = localRows.map((row) => ({
    host: "local",
    port: row.entry.port,
    pid: row.entry.pid,
    root: row.entry.root,
    projectName: row.entry.projectName,
    version: row.entry.version,
    startedAt: row.entry.startedAt,
    activeEngineers: row.entry.activeEngineers ?? 0,
    engineersUpdatedAt: row.entry.engineersUpdatedAt ?? null,
    uptimeSeconds: row.uptimeSeconds,
    valid: row.valid,
    staleReason: row.staleReason,
    healthRoot: row.healthRoot,
  }));
  const cfg = tailscale ? loadConfig(findRepoRoot()) : undefined;
  const result = tailscale
    ? await collectTailnetServers(local, {
        configuredHosts: resolveRemoteHosts(cfg?.remoteValidation).map((host) => host.host),
      })
    : { servers: local, tailscaleUnavailable: false };

  if (json) {
    console.log(
      JSON.stringify(
        {
          servers: result.servers,
          ...(pruned !== undefined ? { pruned } : {}),
          ...(result.tailscaleUnavailable ? { tailscaleUnavailable: true } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (pruned)
    console.log(
      c.dim(`  Pruned ${pruned} stale local registry entr${pruned === 1 ? "y" : "ies"}.`),
    );
  if (result.tailscaleUnavailable)
    console.log(
      c.yellow(
        "  Tailscale CLI unavailable; showing configured hosts where reachable and local servers.",
      ),
    );
  console.log(c.bold(tailscale ? "  RepoOS servers by host:\n" : "  Registered RepoOS servers:\n"));
  if (!result.servers.length) {
    console.log(c.dim("  No registered RepoOS servers."));
    console.log(
      c.dim("  Control-plane `repoos serve` processes register under ") +
        c.cyan("~/.repoos/servers/") +
        c.dim(" when listening."),
    );
    return;
  }
  for (const row of result.servers) {
    if (row.unreachable) {
      console.log(
        `  ${c.cyan(row.host.padEnd(16))}  ${c.yellow("unreachable")}  ${row.reason ?? "unknown error"}`,
      );
      continue;
    }
    const status =
      row.valid === false
        ? c.yellow(row.staleReason ? `stale (${row.staleReason})` : "stale")
        : c.green("ok");
    console.log(
      `  ${c.cyan(row.host.padEnd(16))}  ${String(row.port ?? "—").padStart(5)}  ${status}  ${c.bold(row.projectName ?? "RepoOS")}  ${c.dim(formatUptime(row.uptimeSeconds ?? null))}`,
    );
    if (row.root) console.log(`         ${c.dim(row.root)}`);
  }
}
