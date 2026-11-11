/**
 * `repoos restart` core — restart this repo's control-plane server whether it
 * was started by `repoos service`, by hand, or by an external supervisor
 * (launchd KeepAlive, systemd, etc.).
 */
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import { loadConfig, resolveServePort } from "./config.js";
import { getServiceStatus, restartService, repoosBinary } from "./service-manager.js";
import { canonicalRegistryRoot, readServerRegistryEntry } from "./server-registry.js";
import { readServeLocks } from "../commands/status.js";
import { locateRepoServer, type LocatedServer } from "./server-locate.js";
import {
  buildHandRunServeArgv,
  compiledCliEntry,
  extractServeFlagsFromCommand,
} from "./serve-lock-flags.js";
import { readProcessCommand, verifyPidServesRepo } from "./serve-pid-verify.js";
import {
  detectSupervisor,
  type SupervisorDetectResult,
  type SupervisorInfo,
} from "./supervisor-detect.js";
import { existsSync } from "node:fs";

export type RestartPath = "managed-service" | "external-supervisor" | "hand-run";

export interface HealthSnapshot {
  ok: boolean;
  root: string | null;
  serverVersion: string | null;
  activeEngineers: number;
}

export type { SupervisorInfo, SupervisorDetectResult };
export {
  detectSupervisor,
  parseLaunchctlListForPid,
  parseLaunchctlPrintCreator,
  parseSystemdPidStatus,
  launchctlKickstartCommand,
  launchctlRestartCommand,
  launchdDomainForUid,
} from "./supervisor-detect.js";

export interface PidOwnership {
  /** Unix uid owning the process, when known. */
  uid: number | null;
  /** True when this user can signal the process (same uid or root). */
  canSignal: boolean;
  /** EPERM from kill(0) — process belongs to another user. */
  otherUser: boolean;
}

export const DEFAULT_RESTART_WAIT_MS = 45_000;

/** `kill -0` / `kill` semantics without delivering a signal. */
export function pidOwnership(pid: number): PidOwnership {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { uid: null, canSignal: false, otherUser: false };
  }
  try {
    process.kill(pid, 0);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return { uid: null, canSignal: false, otherUser: false };
    if (code === "EPERM") return { uid: null, canSignal: false, otherUser: true };
    return { uid: null, canSignal: false, otherUser: false };
  }
  let uid: number | null = null;
  if (process.platform !== "win32") {
    try {
      const out = execFileSync("ps", ["-o", "uid=", "-p", String(pid)], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const parsed = Number(out);
      if (Number.isFinite(parsed)) uid = parsed;
    } catch {
      /* best effort */
    }
  }
  const me = typeof process.getuid === "function" ? process.getuid() : 0;
  const canSignal = uid === null ? true : uid === me;
  return { uid, canSignal, otherUser: uid !== null && uid !== me };
}

/** @deprecated use detectSupervisor */
export function detectExternalSupervisor(pid: number): SupervisorInfo | null {
  const r = detectSupervisor(pid);
  return r.kind === "external" ? r.info : null;
}

export async function classifyRestartPath(
  root: string,
  server: LocatedServer,
): Promise<RestartPath | "refuse-supervised-unknown"> {
  const managed = await getServiceStatus(root);
  if (managed?.status === "running") return "managed-service";
  const detected = detectSupervisor(server.pid);
  if (detected.kind === "external") return "external-supervisor";
  // A RepoOS service unit whose registry entry is missing or not `running`:
  // signalling it would race the service's KeepAlive respawn into a second server.
  if (detected.kind === "uncertain" || detected.kind === "managed") {
    return "refuse-supervised-unknown";
  }
  return "hand-run";
}

export function fetchHealth(host: string, port: number, timeoutMs = 1500): Promise<HealthSnapshot> {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    const miss: HealthSnapshot = {
      ok: false,
      root: null,
      serverVersion: null,
      activeEngineers: 0,
    };
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
              serverVersion?: string;
              activeEngineers?: number;
            };
            resolve({
              ok: body.ok === true,
              root: typeof body.root === "string" ? body.root : null,
              serverVersion: typeof body.serverVersion === "string" ? body.serverVersion : null,
              activeEngineers: typeof body.activeEngineers === "number" ? body.activeEngineers : 0,
            });
          } catch {
            resolve(miss);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(miss);
    });
    req.on("error", () => resolve(miss));
  });
}

export interface CurrentPidResult {
  pid: number | null;
  source: "lockfile" | "registry" | null;
}

/** Resolve the PID currently serving `port` for `root`. */
export function readCurrentServePid(
  root: string,
  port: number,
  registryDir?: string,
): CurrentPidResult {
  const config = loadConfig(root);
  const lock = readServeLocks(root, config.cacheDir).find((l) => l.alive && l.port === port);
  if (lock) return { pid: lock.pid, source: "lockfile" };
  const reg = readServerRegistryEntry(port, registryDir);
  if (reg && canonicalRegistryRoot(reg.root) === canonicalRegistryRoot(root)) {
    return { pid: reg.pid, source: "registry" };
  }
  return { pid: null, source: null };
}

export interface WaitForRestartOptions {
  timeoutMs?: number;
  pollMs?: number;
  oldPid: number;
  registryDir?: string;
  fetch?: typeof fetchHealth;
  sleep?: (ms: number) => Promise<void>;
  /** Inject for tests — default reads lock/registry. */
  readPid?: (root: string, port: number) => number | null;
}

export interface WaitForRestartResult {
  ok: boolean;
  pid: number | null;
  version: string | null;
  reason?: string;
}

export async function waitForServerRestart(
  root: string,
  port: number,
  host: string,
  opts: WaitForRestartOptions,
): Promise<WaitForRestartResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_RESTART_WAIT_MS;
  const pollMs = opts.pollMs ?? 300;
  const fetch = opts.fetch ?? fetchHealth;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const readPid =
    opts.readPid ?? ((r: string, p: number) => readCurrentServePid(r, p, opts.registryDir).pid);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const health = await fetch(host, port);
    const pid = readPid(root, port);
    if (health.ok && canonicalRegistryRoot(health.root ?? "") === canonicalRegistryRoot(root)) {
      if (pid !== null && pid !== opts.oldPid) {
        return { ok: true, pid, version: health.serverVersion };
      }
    }
    await sleep(pollMs);
  }
  return {
    ok: false,
    pid: null,
    version: null,
    reason: `timed out after ${timeoutMs}ms waiting for /api/health and a new pid`,
  };
}

export async function waitForPidGone(
  pid: number,
  opts: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const pollMs = opts.pollMs ?? 100;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return true;
    }
    await sleep(pollMs);
  }
  return false;
}

export function stopPidExact(pid: number): void {
  if (pid === process.pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return;
    throw e;
  }
}

export function spawnHandRunServe(
  root: string,
  port: number,
  host: string,
  serveFlags: readonly string[] = [],
): { ok: true } | { ok: false; error: string } {
  try {
    const { bin, needsCliEntry } = repoosBinary();
    const entry = compiledCliEntry();
    if (needsCliEntry && !existsSync(entry)) {
      return { ok: false, error: `Cannot find CLI entry at ${entry}` };
    }
    const serveArgs = buildHandRunServeArgv(port, host, serveFlags);
    const args = needsCliEntry ? [entry, ...serveArgs] : serveArgs;
    const child = spawn(bin, args, {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.on("error", (err) => {
      // Detached spawn: ENOENT on bin surfaces here after we already returned — log for diagnosis.
      if (process.env.REPOOS_DEBUG) {
        console.error(`spawnHandRunServe: ${err.message}`);
      }
    });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface RestartRepoServerOptions {
  portFilter?: number;
  registryDir?: string;
  waitTimeoutMs?: number;
  /** Inject for tests */
  locate?: typeof locateRepoServer;
  restartManaged?: typeof restartService;
  classify?: (
    root: string,
    server: LocatedServer,
  ) => Promise<RestartPath | "refuse-supervised-unknown">;
  ownership?: typeof pidOwnership;
  supervisor?: typeof detectExternalSupervisor;
  stop?: typeof stopPidExact;
  spawn?: typeof spawnHandRunServe;
  resolveServeFlags?: (server: LocatedServer) => string[];
  wait?: typeof waitForServerRestart;
  health?: typeof fetchHealth;
  onBeforeStop?: (ctx: { activeEngineers: number; path: RestartPath }) => void;
  verifyPid?: typeof verifyPidServesRepo;
  waitPidGone?: typeof waitForPidGone;
}

export interface RestartRepoServerResult {
  ok: boolean;
  path?: RestartPath;
  message?: string;
  oldPid?: number;
  newPid?: number;
  oldVersion?: string | null;
  newVersion?: string | null;
  manualCommand?: string;
  activeEngineers?: number;
}

export async function restartRepoServer(
  root: string,
  opts: RestartRepoServerOptions = {},
): Promise<RestartRepoServerResult> {
  const locate = opts.locate ?? locateRepoServer;
  const server = await locate(root, {
    portFilter: opts.portFilter,
    registryDir: opts.registryDir,
  });
  if (!server) {
    const config = loadConfig(root);
    const port = opts.portFilter ?? resolveServePort(root, config);
    return {
      ok: false,
      message: `No running RepoOS server found for this repo (port ${port}). Start one with \`repoos serve\` or \`repoos service start\`.`,
    };
  }

  const ownership = (opts.ownership ?? pidOwnership)(server.pid);
  if (ownership.otherUser || !ownership.canSignal) {
    return {
      ok: false,
      oldPid: server.pid,
      message:
        `Server pid ${server.pid} belongs to another user — refusing to restart without sudo. ` +
        `Stop it with the supervisor account or ask an administrator.`,
    };
  }

  const health = await (opts.health ?? fetchHealth)(server.host, server.port);
  const verifyPid = opts.verifyPid ?? verifyPidServesRepo;
  // /api/health carries no pid, so it cannot vouch for `server.pid`: a recycled
  // pid plus another server answering on the port would pass. Always verify.
  if (!verifyPid(server.pid, root)) {
    return {
      ok: false,
      oldPid: server.pid,
      message: `Refusing to signal pid ${server.pid}: it is not a verified repoos serve for this repo (stale lock or recycled pid).`,
    };
  }
  if (
    health.ok &&
    health.root &&
    canonicalRegistryRoot(health.root) !== canonicalRegistryRoot(root)
  ) {
    return {
      ok: false,
      message: `Port ${server.port} answers /api/health for a different repo (${health.root}) — refusing to touch it.`,
    };
  }

  const path = await (opts.classify ?? classifyRestartPath)(root, server);
  if (path === "refuse-supervised-unknown") {
    const detected = detectSupervisor(server.pid);
    return {
      ok: false,
      oldPid: server.pid,
      message:
        detected.kind === "uncertain"
          ? detected.reason
          : detected.kind === "managed"
            ? `pid ${server.pid} is the RepoOS service ${detected.job}, but the service manager does not report it running — use \`repoos service restart\` instead of signalling it.`
            : "Could not determine how this server is supervised — refusing to restart automatically.",
      manualCommand: detected.kind === "managed" ? "repoos service restart" : `kill ${server.pid}`,
    };
  }

  const oldPid = server.pid;
  const oldVersion = health.serverVersion ?? server.version;

  opts.onBeforeStop?.({ activeEngineers: health.activeEngineers, path });

  if (path === "managed-service") {
    const result = await (opts.restartManaged ?? restartService)(root);
    if (!result.ok) {
      return { ok: false, path, message: result.error ?? "Managed service restart failed" };
    }
    const waited = await (opts.wait ?? waitForServerRestart)(root, server.port, server.host, {
      oldPid,
      timeoutMs: opts.waitTimeoutMs,
      registryDir: opts.registryDir,
      fetch: opts.health,
    });
    if (!waited.ok) {
      return {
        ok: false,
        path,
        oldPid,
        oldVersion,
        message: waited.reason ?? "Server did not come back healthy",
        manualCommand: "repoos service restart",
      };
    }
    return {
      ok: true,
      path,
      oldPid,
      newPid: waited.pid ?? undefined,
      oldVersion,
      newVersion: waited.version,
      activeEngineers: health.activeEngineers,
    };
  }

  if (path === "external-supervisor") {
    const supervisor = (opts.supervisor ?? detectExternalSupervisor)(oldPid);
    try {
      (opts.stop ?? stopPidExact)(oldPid);
    } catch (e) {
      return {
        ok: false,
        path,
        message: e instanceof Error ? e.message : String(e),
      };
    }
    const waited = await (opts.wait ?? waitForServerRestart)(root, server.port, server.host, {
      oldPid,
      timeoutMs: opts.waitTimeoutMs,
      registryDir: opts.registryDir,
      fetch: opts.health,
    });
    if (!waited.ok) {
      return {
        ok: false,
        path,
        oldPid,
        oldVersion,
        message: waited.reason ?? "Supervisor did not respawn the server in time",
        manualCommand: supervisor?.manualCommand,
      };
    }
    return {
      ok: true,
      path,
      oldPid,
      newPid: waited.pid ?? undefined,
      oldVersion,
      newVersion: waited.version,
      activeEngineers: health.activeEngineers,
    };
  }

  // hand-run
  try {
    (opts.stop ?? stopPidExact)(oldPid);
  } catch (e) {
    return {
      ok: false,
      path,
      message: e instanceof Error ? e.message : String(e),
    };
  }
  const gone = await (opts.waitPidGone ?? waitForPidGone)(oldPid, { timeoutMs: 8000 });
  if (!gone) {
    return {
      ok: false,
      path,
      oldPid,
      oldVersion,
      message: `Server pid ${oldPid} did not exit within 8s — refusing to start a second serve on port ${server.port}.`,
    };
  }

  const resolveFlags =
    opts.resolveServeFlags ??
    ((s: LocatedServer) => {
      if (s.serveFlags.length > 0) return [...s.serveFlags];
      const cmd = readProcessCommand(s.pid);
      return cmd ? extractServeFlagsFromCommand(cmd) : [];
    });
  const spawnResult = (opts.spawn ?? spawnHandRunServe)(
    root,
    server.port,
    server.host || "127.0.0.1",
    resolveFlags(server),
  );
  if (!spawnResult.ok) {
    return {
      ok: false,
      path,
      oldPid,
      oldVersion,
      message: `Failed to start hand-run server: ${spawnResult.error}`,
      manualCommand: `cd ${root} && repoos serve --port ${server.port}`,
    };
  }

  const waitRestart = opts.wait ?? waitForServerRestart;

  const waited = await waitRestart(root, server.port, server.host, {
    oldPid,
    timeoutMs: opts.waitTimeoutMs ?? DEFAULT_RESTART_WAIT_MS,
    registryDir: opts.registryDir,
    fetch: opts.health,
  });
  if (!waited.ok) {
    const port = server.port;
    const quoted = /^[\w./-]+$/.test(root) ? root : `'${root.replaceAll("'", "'\\''")}'`;
    return {
      ok: false,
      path,
      oldPid,
      oldVersion,
      message: waited.reason ?? "Server did not come back healthy",
      manualCommand: `cd ${quoted} && repoos serve --port ${port} --host ${server.host || "127.0.0.1"}${server.serveFlags.length ? ` ${server.serveFlags.join(" ")}` : ""}`,
    };
  }
  return {
    ok: true,
    path,
    oldPid,
    newPid: waited.pid ?? undefined,
    oldVersion,
    newVersion: waited.version,
    activeEngineers: health.activeEngineers,
  };
}
