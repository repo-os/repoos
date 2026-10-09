/**
 * Dev targets supervisor (#0747).
 *
 * A user declares the things they run while developing — an HMR web server, a
 * debug build — in `repoos.toml`'s `[[dev.targets]]`. This manager starts,
 * stops and restarts each one in the PROJECT'S ROOT CHECKOUT (never a task
 * worktree), keeps it alive independent of the browser, and reports
 * running/stopped/starting/failed state plus a tail of its output.
 *
 * Trust model: only a command declared in the committed `repoos.toml` can be
 * run. No request body ever supplies a command — the API names a target by
 * `name` and the manager looks the command up in config.
 *
 * This deliberately mirrors the preview supervisor (src/server/preview.ts):
 * same registry + persisted-file + orphan-cleanup shape, same
 * detached-process-group kill, same stderr capture. It is a second instance of
 * the same process model, not a new one.
 *
 * Zero runtime deps: node:child_process / node:fs / node:http only.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { RepoOSConfig, DevTargetConfig } from "../core/types.js";

/** The four states a dev target can be in. */
export type DevTargetStatus = "running" | "stopped" | "starting" | "failed";

/** How many output lines are kept per target, per the acceptance criteria. */
export const DEV_LOG_TAIL_LINES = 200;

/** How long a `server` target is given to answer its health check (ms). */
const HEALTH_TIMEOUT_MS = 30_000;
/** Poll interval while waiting for a health check to pass (ms). */
const HEALTH_POLL_MS = 500;
/** Grace period between SIGTERM and SIGKILL when stopping a target (ms). */
const KILL_GRACE_MS = 400;

/** Live state for one target. */
export interface DevTargetState {
  name: string;
  status: DevTargetStatus;
  /** Failure reason when status is `failed`. */
  error?: string;
  /** PID of the running (or last-run) process, when known. */
  pid?: number;
  /** ISO timestamp of the last start. */
  startedAt?: string;
  /** ISO timestamp of the last stop/exit. */
  stoppedAt?: string;
  /** Last DEV_LOG_TAIL_LINES of combined stdout/stderr. */
  log: string[];
}

/** A target plus its config and live state, as returned to the API/CLI. */
export interface DevTargetView extends DevTargetState {
  kind: "server" | "artifact";
  command: string;
  label: string;
  url?: string;
  artifactPath?: string;
}

/** Result of a start/stop/restart request. */
export interface DevActionResult {
  ok: boolean;
  target?: DevTargetView;
  error?: string;
}

/** Registry persisted between runs, so a crashed server's children can be reaped. */
interface RegistryFile {
  mainPid: number;
  targets: Record<string, DevTargetState>;
}

/** Runtime bookkeeping for one started target. */
interface RunningTarget {
  child: ChildProcess;
  processGroup: boolean;
  /** True for a `server` kind target (long-lived); false for an `artifact`. */
  server: boolean;
}

const now = (): string => new Date().toISOString();

export class DevTargetManager {
  private readonly config: RepoOSConfig;
  /** Persisted-ish state (status, log tail) keyed by target name. */
  private states = new Map<string, DevTargetState>();
  /** Live process handles for targets we started in this process. */
  private running = new Map<string, RunningTarget>();
  /** Starts in flight per target, so concurrent calls never double-spawn. */
  private inflight = new Map<string, Promise<DevActionResult>>();
  /**
   * Targets re-adopted across a reload handover (#0747): we have their PID
   * but no ChildProcess handle, so PID liveness is the only truth for them.
   */
  private adopted = new Set<string>();
  private readonly file: string;

  constructor(config: RepoOSConfig) {
    this.config = config;
    this.file = join(config.root, config.cacheDir, "dev-targets.json");
    this.loadStates();
  }

  /** The declared targets, in config order. */
  private targets(): DevTargetConfig[] {
    return this.config.dev?.targets ?? [];
  }

  /** Look up a declared target by name — the ONLY way a command is resolved. */
  private target(name: string): DevTargetConfig | undefined {
    return this.targets().find((t) => t.name === name);
  }

  /** Every target with its current state, for status/list. */
  list(): DevTargetView[] {
    return this.targets().map((t) => this.view(t));
  }

  /** Config validation errors recorded by `loadConfig` (#0747). */
  configErrors(): string[] {
    return this.config.devTargetErrors ?? [];
  }

  get(name: string): DevTargetView | null {
    const t = this.target(name);
    return t ? this.view(t) : null;
  }

  /**
   * Start a target by name. Idempotent for an already-running target. The
   * process is detached from the server's stdio and (on POSIX) leads its own
   * process group, so it survives the browser closing and is torn down as a
   * unit on stop.
   */
  async start(name: string): Promise<DevActionResult> {
    const t = this.target(name);
    if (!t) return { ok: false, error: `Unknown dev target "${name}"` };
    const existing = this.running.get(name);
    if (existing) {
      // Already running (or a server we started that is still alive).
      const state = this.states.get(name);
      if (state && state.status === "running") {
        return { ok: true, target: this.view(t) };
      }
    }
    const inflight = this.inflight.get(name);
    if (inflight) return inflight;

    // An `artifact` target is a one-shot build that exits; a re-start must
    // begin from a clean slate rather than refuse because the prior run is
    // recorded as "failed".
    this.setState(name, { status: "starting", error: undefined, log: [] });
    const p = this.doStart(t);
    this.inflight.set(name, p);
    p.finally(() => this.inflight.delete(name)).catch(() => {
      /* handled by callers */
    });
    return p;
  }

  private async doStart(t: DevTargetConfig): Promise<DevActionResult> {
    const cwd = this.config.root;
    const processGroup = process.platform !== "win32";

    let child: ChildProcess;
    try {
      child = spawn(t.command, {
        cwd,
        shell: true,
        detached: processGroup,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (err) {
      const message = `could not launch "${t.name}": ${(err as Error).message}`;
      this.setState(t.name, { status: "failed", error: message });
      this.appendLog(t.name, `[repoos] ${message}`);
      return { ok: false, error: message, target: this.view(t) };
    }

    const pid = child.pid;
    if (!pid) {
      const message = `could not launch "${t.name}" (no pid)`;
      this.setState(t.name, { status: "failed", error: message });
      return { ok: false, error: message, target: this.view(t) };
    }

    this.running.set(t.name, { child, processGroup, server: t.kind === "server" });
    this.adopted.delete(t.name);
    this.setState(t.name, { status: "starting", pid, startedAt: now(), error: undefined });

    this.pipe(child, t.name);

    // A target that exits on its own is observed here: an `artifact` that
    // exits 0 has succeeded; a `server` (or a non-zero exit) has failed —
    // unless we are the ones stopping it, in which case `stopping` is set and
    // the exit is expected.
    child.on("error", (err) => {
      this.appendLog(t.name, `[repoos] process error: ${err.message}`);
      if (this.running.get(t.name)?.child === child) {
        this.running.delete(t.name);
        this.setState(t.name, { status: "failed", error: err.message });
      }
    });
    child.on("exit", (code, signal) => {
      const entry = this.running.get(t.name);
      if (!entry || entry.child !== child) return; // superseded or already handled
      this.running.delete(t.name);
      const current = this.states.get(t.name);
      if (current?.status === "stopped") return; // deliberate stop
      const ok = code === 0;
      if (entry.server) {
        const reason = `process exited${code !== null ? ` with code ${code}` : ""}${
          signal ? ` (${signal})` : ""
        }`;
        this.setState(t.name, { status: "failed", error: reason, stoppedAt: now() });
        this.appendLog(t.name, `[repoos] ${reason}`);
      } else if (ok) {
        this.setState(t.name, { status: "running", error: undefined, stoppedAt: now() });
        this.appendLog(t.name, "[repoos] build finished (exit 0)");
      } else {
        const reason = `exited with code ${code ?? "?"}${signal ? ` (${signal})` : ""}`;
        this.setState(t.name, { status: "failed", error: reason, stoppedAt: now() });
        this.appendLog(t.name, `[repoos] ${reason}`);
      }
    });

    // An `artifact` target's terminal state is its exit; report success/failure
    // once it has, so the API reflects the build result rather than "starting".
    if (t.kind === "artifact") {
      await new Promise<void>((resolvePromise) => {
        child.once("exit", () => resolvePromise());
        child.once("error", () => resolvePromise());
      });
      const state = this.states.get(t.name);
      if (state?.status === "failed") {
        return { ok: false, error: state.error, target: this.view(t) };
      }
      return { ok: true, target: this.view(t) };
    }

    // A `server` target is ready when its health check passes (its configured
    // URL answers, or a healthCheck file exists). Without a health check, a
    // still-live process a moment later is treated as running.
    const ready = await this.waitForReady(t, child);
    if (!ready.ok) {
      await this.killProcess(t.name);
      if (this.states.get(t.name)?.status !== "failed") {
        this.setState(t.name, { status: "failed", error: ready.error });
      }
      this.appendLog(t.name, `[repoos] ${ready.error}`);
      return { ok: false, error: ready.error, target: this.view(t) };
    }
    if (this.states.get(t.name)?.status !== "failed") {
      this.setState(t.name, { status: "running", error: undefined });
    }
    return { ok: true, target: this.view(t) };
  }

  /**
   * Wait until a started `server` target is ready: its `healthCheck.url`
   * answers (or a `healthCheck.file` exists), or — with no health check — the
   * process is still alive after a short settle. Returns `{ ok:false }` with a
   * reason on failure, never throwing.
   */
  private async waitForReady(
    t: DevTargetConfig,
    child: ChildProcess,
  ): Promise<{ ok: boolean; error: string }> {
    const hc = t.healthCheck;
    if (hc?.file) {
      const path = this.resolveHealthPath(hc.file);
      if (!path) return { ok: false, error: `healthCheck file "${hc.file}" escapes the repo` };
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (existsSync(path)) return { ok: true, error: "" };
        if (!this.isAlive(child))
          return { ok: false, error: "process exited before the health file appeared" };
        await sleep(HEALTH_POLL_MS);
      }
      return { ok: false, error: `health file "${hc.file}" did not appear in time` };
    }
    const url = hc?.url ?? t.url;
    if (url) {
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await probeUrl(url)) return { ok: true, error: "" };
        if (!this.isAlive(child)) {
          return { ok: false, error: "process exited before it answered its health check" };
        }
        await sleep(HEALTH_POLL_MS);
      }
      return { ok: false, error: `${url} did not answer within ${HEALTH_TIMEOUT_MS / 1000}s` };
    }
    // No health check: give the process a moment to fail fast if it is going
    // to, then treat a live process as running.
    await sleep(HEALTH_POLL_MS);
    if (!this.isAlive(child)) return { ok: false, error: "process exited immediately" };
    return { ok: true, error: "" };
  }

  /**
   * Resolve a health-check file path inside the repo root. Rejects an absolute
   * path or one that escapes the root, so a config typo can never point the
   * check at an arbitrary location.
   */
  private resolveHealthPath(file: string): string | null {
    if (isAbsolute(file)) return null;
    const root = resolve(this.config.root);
    const full = resolve(root, file);
    const rel = relative(root, full);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    return full;
  }

  private isAlive(child: ChildProcess): boolean {
    return child.exitCode === null && child.signalCode === null && child.pid !== undefined;
  }

  /** Stop a target (idempotent). */
  async stop(name: string): Promise<DevActionResult> {
    const t = this.target(name);
    if (!t) return { ok: false, error: `Unknown dev target "${name}"` };
    this.adopted.delete(name);
    const entry = this.running.get(name);
    if (!entry) {
      // Nothing we started is alive: reflect that plainly. An `artifact`'s
      // completed build stays shown as its last result rather than being wiped,
      // but the process is not running.
      const state = this.states.get(name);
      if (state && state.status === "running") {
        this.setState(name, { status: "stopped", stoppedAt: now() });
      }
      return { ok: true, target: this.view(t) };
    }
    // Mark stopped FIRST so the exit handler treats this as deliberate.
    this.setState(name, { status: "stopped", error: undefined, stoppedAt: now() });
    await this.killProcess(name);
    return { ok: true, target: this.view(t) };
  }

  /** Restart a target: stop, then start fresh. */
  async restart(name: string): Promise<DevActionResult> {
    const t = this.target(name);
    if (!t) return { ok: false, error: `Unknown dev target "${name}"` };
    await this.stop(name);
    // Let the old process release its port/file before starting again.
    await sleep(KILL_GRACE_MS);
    return this.start(name);
  }

  /** Stop every target we started — used on server shutdown. */
  async stopAll(): Promise<void> {
    const names = [...this.running.keys()];
    for (const name of names) {
      this.setState(name, { status: "stopped", stoppedAt: now() });
      await this.killProcess(name);
    }
    this.persist();
  }

  /**
   * Boot-time reconciliation of dev target state left by a previous server.
   *
   * On a RELOAD handover (`isReload`), the replacement process re-adopts any
   * target whose recorded PID is still alive — a long-lived user process must
   * survive an internal build handover, not die with it — so it stays
   * `running` and remains stop/restart-able. On a real (cold) boot, a leftover
   * process from a crashed server is reaped so it cannot outlive the server
   * that owned it. Best-effort and fail-soft.
   */
  cleanupOrphans(isReload = false): void {
    if (!existsSync(this.file)) return;
    let payload: RegistryFile | null = null;
    try {
      payload = JSON.parse(readFileSync(this.file, "utf8")) as RegistryFile;
    } catch {
      /* corrupt registry — drop it */
    }
    if (payload?.targets) {
      for (const state of Object.values(payload.targets)) {
        if (state.status !== "running" && state.status !== "starting") continue;
        if (typeof state.pid !== "number" || state.pid <= 0) continue;
        if (isReload && isAlivePid(state.pid)) {
          // Subscribe to the target's live state; there is no ChildProcess
          // handle to observe, so the PID liveness check in `view()` is the
          // truth from here on.
          this.states.set(state.name, { ...state, status: "running" });
          this.adopted.add(state.name);
          continue;
        }
        if (isAlivePid(state.pid)) void this.killPid(state.pid, process.platform !== "win32");
      }
    }
    if (!isReload) this.states.clear();
    try {
      unlinkSync(this.file);
    } catch {
      /* ignore */
    }
  }

  // ---- internals ----

  /** Build the API/CLI view of a target from its config + live state. */
  private view(t: DevTargetConfig): DevTargetView {
    let state =
      this.states.get(t.name) ?? ({ name: t.name, status: "stopped", log: [] } as DevTargetState);
    // A target re-adopted across a reload has no ChildProcess handle — its PID
    // liveness is the only truth. If it has since died, report that honestly
    // rather than a stale "running".
    if (
      this.adopted.has(t.name) &&
      state.pid !== undefined &&
      !this.running.has(t.name) &&
      (state.status === "running" || state.status === "starting") &&
      !isAlivePid(state.pid)
    ) {
      state = { ...state, status: "stopped", stoppedAt: now() };
      this.states.set(t.name, state);
    }
    return {
      name: t.name,
      kind: t.kind,
      command: t.command,
      label: t.label ?? t.name,
      ...(t.url ? { url: t.url } : {}),
      ...(t.artifactPath ? { artifactPath: t.artifactPath } : {}),
      status: state.status,
      ...(state.error ? { error: state.error } : {}),
      ...(state.pid !== undefined ? { pid: state.pid } : {}),
      ...(state.startedAt ? { startedAt: state.startedAt } : {}),
      ...(state.stoppedAt ? { stoppedAt: state.stoppedAt } : {}),
      log: state.log.slice(-DEV_LOG_TAIL_LINES),
    };
  }

  private setState(name: string, patch: Partial<DevTargetState>): void {
    const prev = this.states.get(name);
    const next: DevTargetState = {
      name,
      status: patch.status ?? prev?.status ?? "stopped",
      log: patch.log ?? prev?.log ?? [],
      ...(prev ?? {}),
      ...patch,
    };
    // Never let a patch's undefined clobber a retained field.
    if (patch.error === undefined) delete (next as { error?: unknown }).error;
    this.states.set(name, next);
    this.persist();
  }

  private appendLog(name: string, line: string): void {
    const prev = this.states.get(name);
    const log = [...(prev?.log ?? []), line].slice(-DEV_LOG_TAIL_LINES);
    this.states.set(name, {
      ...(prev ?? { name, status: "starting" as const, log: [] }),
      name,
      log,
    });
  }

  /** Forward a child's stdout+stderr into the per-target ring buffer. */
  private pipe(child: ChildProcess, name: string): void {
    const onData = (prefix: string) => (c: Buffer) => {
      for (const raw of c.toString("utf8").split("\n")) {
        const line = raw.replace(/\r$/, "");
        if (line.trim() === "") continue;
        this.appendLog(name, prefix ? `${prefix}${line}` : line);
      }
    };
    child.stdout?.on("data", onData(""));
    child.stderr?.on("data", onData(""));
  }

  private async killProcess(name: string): Promise<void> {
    const entry = this.running.get(name);
    if (!entry) return;
    this.running.delete(name);
    const pid = entry.child.pid;
    if (pid === undefined) return;
    await this.killPid(pid, entry.processGroup);
  }

  /** Graceful SIGTERM, then SIGKILL after a short grace period. */
  private async killPid(pid: number, processGroup: boolean): Promise<void> {
    const signal = (sig: NodeJS.Signals): boolean => {
      try {
        process.kill(processGroup ? -pid : pid, sig);
        return true;
      } catch {
        return false;
      }
    };
    if (!signal("SIGTERM")) return; // already gone
    await sleep(KILL_GRACE_MS);
    try {
      process.kill(processGroup ? -pid : pid, 0);
    } catch {
      return; // exited on SIGTERM
    }
    signal("SIGKILL");
  }

  private loadStates(): void {
    try {
      const payload = JSON.parse(readFileSync(this.file, "utf8")) as RegistryFile;
      for (const [name, state] of Object.entries(payload.targets ?? {})) {
        // A recorded "running" target from a previous server is NOT running in
        // this one — cleanupOrphans()/boot decides its fate. Seed as stopped.
        this.states.set(name, {
          ...state,
          name,
          status:
            state.status === "running" || state.status === "starting" ? "stopped" : state.status,
          log: Array.isArray(state.log) ? state.log.slice(-DEV_LOG_TAIL_LINES) : [],
        });
      }
    } catch {
      /* no persisted state */
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const payload: RegistryFile = {
        mainPid: process.pid,
        targets: Object.fromEntries(this.states),
      };
      writeFileSync(this.file, JSON.stringify(payload, null, 2));
    } catch {
      /* persistence is best-effort */
    }
  }
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Whether a PID is alive (best-effort; signal 0 sends nothing). */
function isAlivePid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Probe a URL for readiness. Never throws; a non-2xx is a failure. */
async function probeUrl(url: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolvePromise(ok);
    };
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      done(false);
      return;
    }
    const lib = target.protocol === "https:" ? import("node:https") : import("node:http");
    void lib
      .then((mod) => {
        const req = mod.get(url, (res) => {
          res.resume();
          const code = res.statusCode ?? 0;
          done(code >= 200 && code < 400);
        });
        req.on("error", () => done(false));
        req.setTimeout(3000, () => {
          req.destroy();
          done(false);
        });
      })
      .catch(() => done(false));
  });
}

/**
 * Whether a target's declared artifact path currently exists. Used by the UI
 * to render an `artifact` target's output presence without running anything.
 */
export function artifactExists(config: RepoOSConfig, target: DevTargetConfig): boolean {
  if (!target.artifactPath || isAbsolute(target.artifactPath)) return false;
  const root = resolve(config.root);
  const full = resolve(root, target.artifactPath);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) return false;
  try {
    return statSync(full).isFile() || statSync(full).isDirectory();
  } catch {
    return false;
  }
}
