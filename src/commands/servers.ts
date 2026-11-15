/** `repoos servers` — list registered RepoOS control-plane processes. */
import { findRepoRoot, loadConfig } from "../core/config.js";
import { resolveRemoteHosts } from "../core/remote-hosts.js";
import {
  listValidatedServerRegistry,
  pruneStaleServerRegistryEntries,
} from "../core/server-registry.js";
import { collectTailnetServers, type ListedServer } from "../core/tailnet-servers.js";
import { c } from "../cli/colors.js";

// Re-exported for callers (and tests) that used to import these from the CLI
// command before tailnet discovery moved into `src/core/tailnet-servers.ts` so
// the server endpoint can share it.
export {
  collectTailnetServers,
  parseTailnetPeers,
  serversSshArgs,
} from "../core/tailnet-servers.js";
export type { ListedServer, RemoteExec } from "../core/tailnet-servers.js";

function localJsonRow(row: Awaited<ReturnType<typeof listValidatedServerRegistry>>[number]) {
  return {
    port: row.entry.port,
    host: row.entry.host,
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
  };
}

function localStaleLabel(reason: string | null): string {
  if (reason === "dead-pid") return "stale (dead pid)";
  if (reason === "health-mismatch") return "stale (health root mismatch)";
  if (reason === "unreachable") return "stale (health unreachable)";
  return "stale";
}

function printLocalRow(row: Awaited<ReturnType<typeof listValidatedServerRegistry>>[number]): void {
  const e = row.entry;
  const status = row.valid ? c.green("ok") : c.yellow(localStaleLabel(row.staleReason));
  const engineers =
    typeof e.activeEngineers === "number" ? `  ${c.dim(`${e.activeEngineers} engineer(s)`)}` : "";
  console.log(
    `  ${c.cyan(String(e.port).padStart(5))}  ${status}  ${c.bold(e.projectName)}  ${c.dim(`pid ${e.pid}`)}  ${c.dim(formatUptime(row.uptimeSeconds))}${engineers}`,
  );
  console.log(`         ${c.dim(e.root)}`);
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
    allowlistGroup: row.entry.allowlistGroup,
    uptimeSeconds: row.uptimeSeconds,
    valid: row.valid,
    staleReason: row.staleReason,
    healthRoot: row.healthRoot,
  }));
  const cfg = tailscale ? loadConfig(findRepoRoot()) : undefined;
  const remoteHosts = resolveRemoteHosts(cfg?.remoteValidation);
  const result = tailscale
    ? await collectTailnetServers(local, {
        configuredHosts: remoteHosts.map((host) => host.host),
        remoteHosts,
        remoteValidation: cfg?.remoteValidation,
      })
    : { servers: local, tailscaleUnavailable: false };

  if (json) {
    console.log(
      JSON.stringify(
        {
          servers: tailscale ? result.servers : localRows.map(localJsonRow),
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
  if (!tailscale && !prune && pruned === undefined) {
    if (localRows.length === 0) {
      console.log(c.dim("  No registered RepoOS servers."));
      console.log(
        c.dim("  Control-plane `repoos serve` processes register under ") +
          c.cyan("~/.repoos/servers/") +
          c.dim(" when listening."),
      );
      return;
    }
    console.log(c.bold("  Registered RepoOS servers:\n"));
    for (const row of localRows) printLocalRow(row);
    return;
  }
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
