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
import { buildHandRunServeArgv, compiledCliEntry } from "./serve-lock-flags.js";
import { verifyPidServesRepo } from "./serve-pid-verify.js";

export type RestartPath = "managed-service" | "external-supervisor" | "hand-run";

export interface HealthSnapshot {
  ok: boolean;
  root: string | null;
  serverVersion: string | null;
  activeEngineers: number;
}

export interface SupervisorInfo {
  platform: "launchd" | "systemd";
  /** OS job label / unit name (without .service suffix on systemd). */
  job: string;
  /** Full manual restart command when automated restart times out. */
  manualCommand: string;
}

export interface PidOwnership {
  /** Unix uid owning the process, when known. */
  uid: number | null;
  /** True when this user can signal the process (same uid or root). */
  canSignal: boolean;
  /** EPERM from kill(0) — process belongs to another user. */
  otherUser: boolean;
}

export const DEFAULT_RESTART_WAIT_MS = 45_000;

export type SupervisorDetectResult =
  | { kind: "external"; info: SupervisorInfo }
  | { kind: "none" }
  | { kind: "uncertain"; reason: string };

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

/**
 * Parse `launchctl print pid/<pid>` for an owning LaunchAgent/Daemon label.
 * Exported for tests with raw output.
 */
export function parseLaunchctlPidPrint(output: string): SupervisorInfo | null {
  const labelMatch = output.match(/\blabel\s*=\s*"([^"]+)"/);
  if (!labelMatch) return null;
  const label = labelMatch[1]!;
  const domainMatch = output.match(/\bdomain\s*=\s*(\S+)/);
  const domain = domainMatch?.[1] ?? "gui";
  const manualCommand = `launchctl kickstart -k ${domain}/${label}`;
  return { platform: "launchd", job: label, manualCommand };
}

/**
 * Parse `systemctl status <pid>` for a specific service unit (not user@.service).
 */
export function parseSystemdPidStatus(output: string): SupervisorInfo | null {
  const unit = output.match(/●\s+(\S+\.service)/);
  if (!unit) return null;
  const full = unit[1]!;
  const name = full.replace(/\.service$/, "");
  if (name.startsWith("user@") || name.endsWith(".slice") || name.endsWith(".scope")) {
    return null;
  }
  if (!/^[\w@.-]+$/.test(name)) return null;
  const userScope =
    /\/run\/user\//.test(output) || /\bsystemd --user\b/.test(output) || /--user\b/.test(output);
  const ctl = userScope ? "systemctl --user" : "systemctl";
  return {
    platform: "systemd",
    job: name,
    manualCommand: `${ctl} restart ${name}.service`,
  };
}

export function detectSupervisor(
  pid: number,
  execFile: typeof execFileSync = execFileSync,
): SupervisorDetectResult {
  if (process.platform === "darwin") {
    try {
      const out = execFile("launchctl", ["print", `pid/${pid}`], {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const info = parseLaunchctlPidPrint(out);
      if (info?.job.startsWith("com.repoos.serve.")) return { kind: "none" };
      if (info) return { kind: "external", info };
      return { kind: "none" };
    } catch (err) {
      const ppid = readPpid(pid, execFile);
      if (ppid === 1 || ppid === null) {
        return {
          kind: "uncertain",
          reason:
            `launchctl could not describe pid ${pid}` +
            (err instanceof Error && err.message ? ` (${err.message})` : "") +
            " — refusing to guess hand-run vs supervised",
        };
      }
      return { kind: "none" };
    }
  }
  if (process.platform === "linux") {
    try {
      const out = execFile("systemctl", ["status", String(pid)], {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const info = parseSystemdPidStatus(out);
      if (info?.job.startsWith("com.repoos.serve.")) return { kind: "none" };
      if (info) return { kind: "external", info };
      return { kind: "none" };
    } catch (err) {
      return {
        kind: "uncertain",
        reason:
          `systemctl could not describe pid ${pid}` +
          (err instanceof Error && err.message ? ` (${err.message})` : "") +
          " — refusing to guess hand-run vs supervised",
      };
    }
  }
  return { kind: "none" };
}

/** @deprecated use detectSupervisor */
export function detectExternalSupervisor(
  pid: number,
  execFile: typeof execFileSync = execFileSync,
): SupervisorInfo | null {
  const r = detectSupervisor(pid, execFile);
  return r.kind === "external" ? r.info : null;
}

function readPpid(pid: number, execFile: typeof execFileSync = execFileSync): number | null {
  if (process.platform === "win32") return null;
  try {
    const out = execFile("ps", ["-o", "ppid=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function classifyRestartPath(
  root: string,
  server: LocatedServer,
): Promise<RestartPath | "refuse-supervised-unknown"> {
  const managed = await getServiceStatus(root);
  if (managed?.status === "running") return "managed-service";
  const detected = detectSupervisor(server.pid);
  if (detected.kind === "external") return "external-supervisor";
  if (detected.kind === "uncertain") return "refuse-supervised-unknown";
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
): void {
  const { bin, needsCliEntry } = repoosBinary();
  const serveArgs = buildHandRunServeArgv(port, host, serveFlags);
  const args = needsCliEntry ? [compiledCliEntry(), ...serveArgs] : serveArgs;
  const child = spawn(bin, args, {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
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
  const healthForRoot =
    health.ok && health.root && canonicalRegistryRoot(health.root) === canonicalRegistryRoot(root);
  if (!healthForRoot && !verifyPid(server.pid, root)) {
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
          : "Could not determine how this server is supervised — refusing to restart automatically.",
      manualCommand: `kill ${server.pid}`,
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

  (opts.spawn ?? spawnHandRunServe)(
    root,
    server.port,
    server.host || "127.0.0.1",
    server.serveFlags,
  );

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
