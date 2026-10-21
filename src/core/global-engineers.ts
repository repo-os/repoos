/**
 * Machine-wide engineer accounting (#0871).
 *
 * `maxConcurrentAgents` is per server. On a laptop running two RepoOS projects
 * that means each server happily assumes it owns the whole machine, so two
 * agents' worth of builds become four. Every control-plane server refreshes
 * `activeEngineers` in its registry entry (`~/.repoos/servers/<port>.json`);
 * reading those files gives a start path a synchronous, HTTP-free view of the
 * other servers' load.
 *
 * Only live registered servers count. Preview children and ephemeral harness
 * servers never register, so they are invisible here by design.
 */
import type { ServerRegistryEntry } from "./server-registry.js";
import { canonicalRegistryRoot, isPidAlive, listServerRegistryEntries } from "./server-registry.js";

export interface RegisteredEngineerServer {
  port: number;
  pid: number;
  root: string;
  projectName: string;
  activeEngineers: number;
  /** True for the server asking — its engineers are counted locally. */
  own: boolean;
}

export interface GlobalEngineerCount {
  /** Live engineers in other registered servers on this machine. */
  others: number;
  /** Live engineers registered by this server's own entry. */
  own: number;
  /** Every live server with an engineer count, own server included. */
  servers: RegisteredEngineerServer[];
  at: string;
}

function countOf(entry: ServerRegistryEntry): number {
  const raw = entry.activeEngineers;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

/**
 * Sum live engineers across registered servers. `root` identifies the caller's
 * own server so its entry is reported separately rather than as "other".
 */
export function registeredEngineerCount(
  root: string,
  registryDir?: string,
  entries: ServerRegistryEntry[] = listServerRegistryEntries(registryDir),
): GlobalEngineerCount {
  const ownRoot = canonicalRegistryRoot(root);
  const servers: RegisteredEngineerServer[] = [];
  for (const entry of entries) {
    if (!isPidAlive(entry.pid)) continue;
    const own = canonicalRegistryRoot(entry.root) === ownRoot;
    servers.push({
      port: entry.port,
      pid: entry.pid,
      root: entry.root,
      projectName: entry.projectName,
      activeEngineers: countOf(entry),
      own,
    });
  }
  const own = servers.filter((s) => s.own).reduce((n, s) => n + s.activeEngineers, 0);
  const others = servers.filter((s) => !s.own).reduce((n, s) => n + s.activeEngineers, 0);
  return { own, others, servers, at: new Date().toISOString() };
}

/**
 * How many engineers this server may still start without exceeding the
 * machine-wide cap. At least one slot is always allowed: the cap is a
 * throttle, never a deadlock, and a stale other-server count must not stop
 * every future start.
 */
export function effectiveAgentCapacity(
  maxConcurrentAgents: number,
  otherEngineers: number,
): number {
  const max = Math.max(1, Math.floor(maxConcurrentAgents));
  const others = Math.max(0, Math.floor(otherEngineers));
  return Math.max(1, max - others);
}
