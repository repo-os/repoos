/**
 * `repoos servers` — list locally registered `repoos serve` control-plane processes.
 *
 * Reads `~/.repoos/servers/<port>.json` (see docs/server-registry.md). Validates
 * each entry (pid alive + `/api/health` root match), supports `--prune` and `--json`.
 */
import {
  listValidatedServerRegistry,
  pruneStaleServerRegistryEntries,
  type ValidatedServerRegistryEntry,
} from "../core/server-registry.js";
import { c } from "../cli/colors.js";

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function staleLabel(reason: ValidatedServerRegistryEntry["staleReason"]): string {
  if (reason === "dead-pid") return "stale (dead pid)";
  if (reason === "health-mismatch") return "stale (health root mismatch)";
  if (reason === "unreachable") return "stale (health unreachable)";
  return "stale";
}

function printRow(row: ValidatedServerRegistryEntry): void {
  const e = row.entry;
  const status = row.valid ? c.green("ok") : c.yellow(staleLabel(row.staleReason));
  const engineers =
    typeof e.activeEngineers === "number" ? `  ${c.dim(`${e.activeEngineers} engineer(s)`)}` : "";
  console.log(
    `  ${c.cyan(String(e.port).padStart(5))}  ${status}  ${c.bold(e.projectName)}  ${c.dim(`pid ${e.pid}`)}  ${c.dim(formatUptime(row.uptimeSeconds))}${engineers}`,
  );
  console.log(`         ${c.dim(e.root)}`);
}

export async function cmdServers(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  const prune = argv.includes("--prune");

  let pruned: number | undefined;
  if (prune) {
    pruned = await pruneStaleServerRegistryEntries();
    if (!json && pruned > 0) {
      console.log(c.dim(`  Pruned ${pruned} stale registry entr${pruned === 1 ? "y" : "ies"}.`));
    }
  }

  const rows = await listValidatedServerRegistry();

  if (json) {
    console.log(
      JSON.stringify(
        {
          servers: rows.map((r) => ({
            port: r.entry.port,
            host: r.entry.host,
            pid: r.entry.pid,
            root: r.entry.root,
            projectName: r.entry.projectName,
            version: r.entry.version,
            startedAt: r.entry.startedAt,
            activeEngineers: r.entry.activeEngineers ?? 0,
            engineersUpdatedAt: r.entry.engineersUpdatedAt ?? null,
            uptimeSeconds: r.uptimeSeconds,
            valid: r.valid,
            staleReason: r.staleReason,
            healthRoot: r.healthRoot,
          })),
          pruned,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (rows.length === 0) {
    console.log(c.dim("  No registered RepoOS servers."));
    console.log(
      c.dim("  Control-plane `repoos serve` processes register under ") +
        c.cyan("~/.repoos/servers/") +
        c.dim(" when listening."),
    );
    return;
  }

  console.log(c.bold("  Registered RepoOS servers:\n"));
  for (const row of rows) {
    printRow(row);
  }
}
