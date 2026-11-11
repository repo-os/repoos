/**
 * Locate this repo's running control-plane server via its serve lockfile and
 * `~/.repoos/servers/` — the same sources `repoos stop` and `repoos status` use.
 * Never returns a server for a different repo root.
 */
import { loadConfig } from "./config.js";
import {
  canonicalRegistryRoot,
  listServerRegistryEntries,
  readServerRegistryEntry,
  validateServerRegistryEntry,
  type ServerRegistryEntry,
} from "./server-registry.js";
import { readServeLocks } from "../commands/status.js";
import { verifyPidServesRepo } from "./serve-pid-verify.js";
import { fetchHealthRoot } from "./server-registry.js";

export interface LocatedServer {
  port: number;
  host: string;
  pid: number;
  version: string | null;
  serveFlags: string[];
  /** Where the PID was resolved — lockfile is authoritative when live. */
  source: "lockfile" | "registry";
}

export interface LocateServerOptions {
  portFilter?: number;
  registryDir?: string;
}

/**
 * Read the live PID for `port` from the validated registry entry when present.
 */
async function registryPidForPort(
  root: string,
  port: number,
  registryDir?: string,
): Promise<ServerRegistryEntry | null> {
  const entry = readServerRegistryEntry(port, registryDir);
  if (!entry) return null;
  if (canonicalRegistryRoot(entry.root) !== canonicalRegistryRoot(root)) return null;
  const validated = await validateServerRegistryEntry(entry);
  return validated.valid ? entry : null;
}

/**
 * Find a reachable RepoOS serve for `root`. Prefers a live serve lock whose
 * port answers `/api/health` for this root; falls back to a healthy registry
 * entry for the same root.
 */
export async function locateRepoServer(
  root: string,
  opts: LocateServerOptions = {},
): Promise<LocatedServer | null> {
  const config = loadConfig(root);
  const canonical = canonicalRegistryRoot(root);
  let locks = readServeLocks(root, config.cacheDir);
  if (opts.portFilter !== undefined) {
    locks = locks.filter((l) => l.port === opts.portFilter);
  }

  for (const lock of locks) {
    if (!lock.alive || lock.port === null) continue;
    const host = lock.host ?? "127.0.0.1";
    // /api/health has no pid, so it cannot vouch for lock.pid (recycled pid):
    // always verify the pid itself serves this repo.
    if (!verifyPidServesRepo(lock.pid, root)) continue;
    const reg = await registryPidForPort(root, lock.port, opts.registryDir);
    return {
      port: lock.port,
      host,
      pid: lock.pid,
      version: reg?.version ?? null,
      serveFlags: lock.serveFlags,
      source: "lockfile",
    };
  }

  let entries = listServerRegistryEntries(opts.registryDir).filter(
    (e) => canonicalRegistryRoot(e.root) === canonical,
  );
  if (opts.portFilter !== undefined) {
    entries = entries.filter((e) => e.port === opts.portFilter);
  }
  for (const entry of entries) {
    const validated = await validateServerRegistryEntry(entry);
    if (!validated.valid) continue;
    if (!verifyPidServesRepo(entry.pid, root)) continue;
    return {
      port: entry.port,
      host: entry.host,
      pid: entry.pid,
      version: entry.version,
      serveFlags: [],
      source: "registry",
    };
  }

  return null;
}
