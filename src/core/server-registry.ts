/**
 * Machine-wide registry of locally running `repoos serve` control-plane processes.
 *
 * One JSON file per port under `~/.repoos/servers/<port>.json`, written when the
 * listener binds and removed on clean shutdown. Distinct from `~/.repoos/services.json`
 * (launchd/systemd managed services). Hub and `repoos servers` read this directory.
 *
 * Zero runtime deps: node:fs / node:path / node:os / node:child_process / node:http.
 */
import { execSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { isLinkedWorktreeRoot, projectDisplayName } from "./config.js";
import type { Logger } from "./logger.js";
import type { RepoOSConfig } from "./types.js";

export const SERVER_REGISTRY_SCHEMA = 1;

export interface ServerRegistryEntry {
  schema: typeof SERVER_REGISTRY_SCHEMA;
  port: number;
  host: string;
  pid: number;
  root: string;
  projectName: string;
  version: string;
  startedAt: string;
  kind: "server";
  /**
   * Engineers currently running in that server (#0871). Refreshed on a timer so
   * every RepoOS server on the machine can size its own concurrency against the
   * others without an HTTP round-trip in a start path.
   */
  activeEngineers?: number;
  engineersUpdatedAt?: string;
}

/** Override for tests (`REPOOS_SERVERS_REGISTRY_DIR`). */
export function serversRegistryDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.REPOOS_SERVERS_REGISTRY_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".repoos", "servers");
}

export function serverRegistryEntryPath(port: number, dir?: string): string {
  return join(dir ?? serversRegistryDir(), `${port}.json`);
}

export function canonicalRegistryRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return resolve(root);
  }
}

/**
 * Whether this `startServer` instance should register in `~/.repoos/servers`.
 * Preview children, preview-overrides serves, task worktrees, ephemeral port 0,
 * and `REPOOS_NO_REGISTRY=1` are excluded.
 */
export function shouldRegisterServerRegistry(
  config: Pick<RepoOSConfig, "root" | "previewOverrides">,
  opts: { requestedPort: number },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.REPOOS_NO_REGISTRY === "1") return false;
  if (env.REPOOS_PREVIEW_CHILD === "1") return false;
  if ((config.previewOverrides?.length ?? 0) > 0) return false;
  if (isLinkedWorktreeRoot(config.root)) return false;
  /** Harness `startServer({ port: 0 })` — OS assigns a real port but must not register. */
  if (opts.requestedPort === 0) return false;
  return true;
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    execSync(`kill -0 ${pid}`, { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function ensureRegistryDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    try {
      chmodSync(dir, 0o700);
    } catch {
      /* best effort */
    }
  }
}

function readEntryFile(path: string): ServerRegistryEntry | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ServerRegistryEntry;
    if (parsed?.schema !== SERVER_REGISTRY_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Before bind: refuse when the registry names a live process on this port for a
 * different repo root. Stale entries (dead pid) are removed.
 */
export function checkServerRegistryPortConflict(
  port: number,
  root: string,
  registryDir?: string,
): string | null {
  const dir = registryDir ?? serversRegistryDir();
  const path = serverRegistryEntryPath(port, dir);
  const existing = readEntryFile(path);
  if (!existing) return null;

  const ours = canonicalRegistryRoot(root);
  const theirs = canonicalRegistryRoot(existing.root);

  if (!isPidAlive(existing.pid)) {
    try {
      unlinkSync(path);
    } catch {
      /* best effort */
    }
    return null;
  }

  if (theirs !== ours) {
    return (
      `Port ${port} is already registered for another RepoOS server (PID ${existing.pid}, project "${existing.projectName}", root ${existing.root}). ` +
      `Stop that process or choose a different port with --port.`
    );
  }

  return null;
}

export function writeServerRegistryEntry(entry: ServerRegistryEntry, registryDir?: string): void {
  const dir = registryDir ?? serversRegistryDir();
  ensureRegistryDir(dir);
  const path = serverRegistryEntryPath(entry.port, dir);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(entry, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * Remove a registry file only when it still names this process (or `opts.pid`).
 * After a reload handover the replacement overwrites the file with its PID; the
 * exiting parent must not delete that entry.
 */
export function removeServerRegistryEntry(
  port: number,
  registryDir?: string,
  opts?: { pid?: number },
): void {
  const path = serverRegistryEntryPath(port, registryDir ?? serversRegistryDir());
  const ownerPid = opts?.pid ?? process.pid;
  try {
    const existing = readEntryFile(path);
    if (!existing || existing.pid !== ownerPid) return;
    unlinkSync(path);
  } catch {
    /* best effort */
  }
}

export function listServerRegistryEntryPaths(registryDir?: string): string[] {
  const dir = registryDir ?? serversRegistryDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name));
}

export function readServerRegistryEntry(
  port: number,
  registryDir?: string,
): ServerRegistryEntry | null {
  return readEntryFile(serverRegistryEntryPath(port, registryDir));
}

/** Every readable registry entry, regardless of whether its process is alive. */
export function listServerRegistryEntries(registryDir?: string): ServerRegistryEntry[] {
  const entries: ServerRegistryEntry[] = [];
  for (const path of listServerRegistryEntryPaths(registryDir)) {
    const entry = readEntryFile(path);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * Refresh the engineer count on this server's own registry file (#0871). Only
 * the process that owns the entry may update it — after a reload handover the
 * replacement owns it, and the exiting parent must not overwrite the new count.
 */
export function updateServerRegistryEngineerCount(
  port: number,
  activeEngineers: number,
  registryDir?: string,
): void {
  const existing = readEntryFile(serverRegistryEntryPath(port, registryDir));
  if (!existing || existing.pid !== process.pid) return;
  const count = Math.max(0, Math.floor(activeEngineers));
  if (existing.activeEngineers === count) return;
  try {
    writeServerRegistryEntry(
      {
        ...existing,
        activeEngineers: count,
        engineersUpdatedAt: new Date().toISOString(),
      },
      registryDir,
    );
  } catch {
    /* count refresh is best-effort — never fail a start because of it */
  }
}

export type ServerRegistryStaleReason = "dead-pid" | "health-mismatch" | "unreachable";

export interface ValidatedServerRegistryEntry {
  entry: ServerRegistryEntry;
  valid: boolean;
  staleReason: ServerRegistryStaleReason | null;
  healthRoot: string | null;
  uptimeSeconds: number | null;
}

export function uptimeSecondsFromStartedAt(startedAt: string): number | null {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

/** GET /api/health and return `root` when `ok` is true. */
export function fetchHealthRoot(
  host: string,
  port: number,
  timeoutMs = 1500,
): Promise<string | null> {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    const req = http.get(
      `http://${probeHost}:${port}/api/health`,
      { timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              ok?: boolean;
              root?: string;
            };
            if (body.ok && typeof body.root === "string") resolve(body.root);
            else resolve(null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

export async function validateServerRegistryEntry(
  entry: ServerRegistryEntry,
): Promise<ValidatedServerRegistryEntry> {
  const uptimeSeconds = uptimeSecondsFromStartedAt(entry.startedAt);
  if (!isPidAlive(entry.pid)) {
    return {
      entry,
      valid: false,
      staleReason: "dead-pid",
      healthRoot: null,
      uptimeSeconds,
    };
  }
  const healthRoot = await fetchHealthRoot(entry.host, entry.port);
  if (!healthRoot) {
    return {
      entry,
      valid: false,
      staleReason: "unreachable",
      healthRoot: null,
      uptimeSeconds,
    };
  }
  if (canonicalRegistryRoot(healthRoot) !== canonicalRegistryRoot(entry.root)) {
    return {
      entry,
      valid: false,
      staleReason: "health-mismatch",
      healthRoot,
      uptimeSeconds,
    };
  }
  return {
    entry,
    valid: true,
    staleReason: null,
    healthRoot,
    uptimeSeconds,
  };
}

export async function listValidatedServerRegistry(
  registryDir?: string,
): Promise<ValidatedServerRegistryEntry[]> {
  const paths = listServerRegistryEntryPaths(registryDir);
  const out: ValidatedServerRegistryEntry[] = [];
  for (const path of paths) {
    const entry = readEntryFile(path);
    if (!entry) continue;
    out.push(await validateServerRegistryEntry(entry));
  }
  out.sort((a, b) => a.entry.port - b.entry.port);
  return out;
}

/**
 * Remove registry files that are stale: dead PID, or live PID that fails health
 * validation (unreachable or root mismatch).
 */
export async function pruneStaleServerRegistryEntries(registryDir?: string): Promise<number> {
  const dir = registryDir ?? serversRegistryDir();
  let removed = 0;
  for (const path of listServerRegistryEntryPaths(dir)) {
    const entry = readEntryFile(path);
    if (!entry) {
      try {
        rmSync(path);
        removed += 1;
      } catch {
        /* ignore */
      }
      continue;
    }
    if (!isPidAlive(entry.pid)) {
      try {
        unlinkSync(path);
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }
  for (const path of listServerRegistryEntryPaths(dir)) {
    const entry = readEntryFile(path);
    if (!entry) continue;
    const validated = await validateServerRegistryEntry(entry);
    if (!validated.valid) {
      try {
        unlinkSync(path);
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

export interface RegisterRunningServerInput {
  port: number;
  host: string;
  root: string;
  version: string;
  startedAt: string;
  pid?: number;
  registryDir?: string;
}

/** Register (or refresh) after the HTTP listener is bound. Best-effort. */
export function registerRunningServer(input: RegisterRunningServerInput): void {
  const entry: ServerRegistryEntry = {
    schema: SERVER_REGISTRY_SCHEMA,
    port: input.port,
    host: input.host,
    pid: input.pid ?? process.pid,
    root: canonicalRegistryRoot(input.root),
    projectName: projectDisplayName(input.root),
    version: input.version,
    startedAt: input.startedAt,
    kind: "server",
    activeEngineers: 0,
    engineersUpdatedAt: new Date().toISOString(),
  };
  writeServerRegistryEntry(entry, input.registryDir);
}

export function refreshRunningServerProjectName(
  port: number,
  root: string,
  registryDir?: string,
): void {
  const existing = readServerRegistryEntry(port, registryDir);
  if (!existing || existing.pid !== process.pid) return;
  const projectName = projectDisplayName(root);
  if (existing.projectName === projectName) return;
  writeServerRegistryEntry({ ...existing, projectName }, registryDir);
}

let registryErrorLogged = false;

/** Log a registry failure at most once per process. */
export function logServerRegistryError(logger: Logger, action: string, err: unknown): void {
  if (registryErrorLogged) return;
  registryErrorLogged = true;
  const msg = err instanceof Error ? err.message : String(err);
  logger.system("warn", `running-server registry ${action} failed (ignored): ${msg}`);
}
