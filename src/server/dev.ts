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
 * A target's `command`, `url` and `healthCheck.url` may contain a `{port}`
 * placeholder (#0751). By default (#0802) RepoOS picks the port: the target's
 * configured `port` when it is free, otherwise a free OS-assigned one chosen at
 * start time (never a hardcoded range), so a dev server that would otherwise
 * clash with another app on the machine binds cleanly. Turning auto-pick off
 * pins the target to its `port`; a clash then fails with the plain-language
 * summary instead. Picking a port never stops another process. The substituted
 * port is remembered in the target's state, so the Dev page shows the REAL url
 * of a running target and a reload handover re-adopts it with the same port. A
 * target with no `{port}` behaves exactly as before — its fixed port or url is
 * untouched.
 *
 * A target may also declare companion services (#0843, the `[[dev.targets]]`
 * counterpart of the preview supervisor's `[[preview.services]]` #0681): each
 * named service boots BEFORE the target's main command, on its own
 * auto-picked port, and is health-gated. The target's fields substitute a
 * service's port by placeholder (`{api.port}` / `{api.url}`, token shared with
 * preview via `servicePortToken`) and by environment variable
 * (`REPOOS_DEV_<NAME>_PORT` / `REPOOS_DEV_<NAME>_URL`), so a full-stack target
 * — an API plus a web server proxying to it — needs no port pinned in config.
 * Stopping or restarting the target stops its services with it; a service
 * that crashes while the target runs marks the target failed with the
 * service's name in the reason, visibly.
 *
 * This deliberately mirrors the preview supervisor (src/server/preview.ts):
 * same registry + persisted-file + orphan-cleanup shape, same
 * detached-process-group kill, same stderr capture. It is a second instance of
 * the same process model, not a new one.
 *
 * Zero runtime deps: node:child_process / node:fs / node:http only.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { RepoOSConfig, DevServiceConfig, DevTargetConfig } from "../core/types.js";
import {
  DEV_LOG_MAX_LINES,
  failureSummary,
  PORT_IN_USE,
  type DevFailure,
} from "../core/dev-failure.js";
import { servicePortToken, expandServiceRefs } from "../core/dev-targets.js";

/** The four states a dev target can be in. */
export type DevTargetStatus = "running" | "stopped" | "starting" | "failed";

/**
 * How many output lines are kept per target — a full last-run log within a sane
 * cap (#0775), so the Dev page can scroll the whole run rather than a 6-line
 * tail. Ring-buffered in memory; only state changes (not every line) persist.
 */
export { DEV_LOG_MAX_LINES };

/**
 * @deprecated Use {@link DEV_LOG_MAX_LINES}. Kept as an alias so older imports
 * keep compiling; the cap is no longer a short "tail".
 */
export const DEV_LOG_TAIL_LINES = DEV_LOG_MAX_LINES;

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
  /**
   * The free port substituted for a `{port}` placeholder at the last start
   * (#0751). Persisted so a reload handover re-adopts the target with the same
   * port, and so `view()` can show the real url of a running target.
   */
  resolvedPort?: number;
  /**
   * The target's companion services (#0843), in the order they booted, with
   * their live state. Persisted with the target so a reload re-adopts the
   * ports and the Dev page can render the sub-rows.
   */
  services?: DevServiceState[];
  /** Last DEV_LOG_MAX_LINES of combined stdout/stderr. */
  log: string[];
}

/**
 * Live state for one companion service of a target (#0843). The `token` (the
 * sanitized placeholder name) is fixed at start and persisted, so `view()` can
 * rebuild the same `{<token>.port}` expansion the command was started with.
 */
export interface DevServiceState {
  name: string;
  /** Sanitized placeholder token, as used in `{<token>.port}` (#0843). */
  token: string;
  status: DevTargetStatus;
  /** Failure reason when status is `failed`. */
  error?: string;
  /** PID of the running (or last-run) service process, when known. */
  pid?: number;
  /** The port the service was given at the last start. */
  port?: number;
  /** Last DEV_LOG_MAX_LINES of the service's combined stdout/stderr. */
  log: string[];
}

/** A process holding a port a target could not bind (#0775). */
export interface DevPortHolder {
  pid: number;
  /** The holder's command line, for the user to judge what it is. */
  command: string;
  /**
   * True only when a PID RepoOS itself recorded (a dev target's process) holds
   * the port — the single case where the page may offer a Stop action. Anything
   * else is shown with its PID and command for the user to decide.
   */
  repoosOwned: boolean;
  /** The dev target whose recorded PID this is, when owned. */
  target?: string;
  /** True when the holder is left over from an earlier run (no live handle). */
  stale: boolean;
}

/**
 * The deterministic plain-language failure summary (#0775) the Dev page shows
 * above the log. `holder` is filled by the server when it can resolve the
 * process holding a contended port.
 */
export interface DevFailureView extends DevFailure {
  holder?: DevPortHolder;
  /** Whether the UI may offer a Stop action for the holder. */
  canStopHolder: boolean;
}

/**
 * A companion service of a target, as returned to the API/CLI (#0843). A
 * subtype of the persisted state — the view adds the expanded command and
 * readiness URL the state does not carry.
 */
export interface DevServiceView extends DevServiceState {
  /**
   * The service's readiness URL — its `healthCheck.url` with every port
   * substituted — when it declares one.
   */
  url?: string;
  /** The service's command with its own `{port}` (and sibling tokens) substituted. */
  command?: string;
}

/** A target plus its config and live state, as returned to the API/CLI. */
export interface DevTargetView extends DevTargetState {
  kind: "server" | "artifact" | "process";
  command: string;
  label: string;
  url?: string;
  /** The port the target uses — its resolved `{port}`, or a fixed port (#0802). */
  port?: number;
  artifactPath?: string;
  /** Companion services with their live state, when the target declares any (#0843). */
  services?: DevServiceView[];
  /** Plain-language failure summary, present only for a failed target (#0775). */
  failure?: DevFailureView;
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
  /**
   * True for a long-lived target — a `server` or a `process` (both keep
   * running until stopped); false for a one-shot `artifact` build that exits.
   */
  longLived: boolean;
}

const now = (): string => new Date().toISOString();

export class DevTargetManager {
  private readonly config: RepoOSConfig;
  /** Persisted-ish state (status, log tail) keyed by target name. */
  private states = new Map<string, DevTargetState>();
  /** Live process handles for targets we started in this process. */
  private running = new Map<string, RunningTarget>();
  /**
   * Live process handles for each target's companion services (#0843), in
   * boot order. Keyed by the TARGET name — a service's lifecycle is entirely
   * owned by its target.
   */
  private serviceRuns = new Map<string, RunningTarget[]>();
  /** One shared, idempotent teardown in flight for each target stack. */
  private stackTeardowns = new Map<string, Promise<void>>();
  /** Starts in flight per target, so concurrent calls never double-spawn. */
  private inflight = new Map<string, Promise<DevActionResult>>();
  /**
   * Monotonic start generation per target (#0843). A `stop()` (or `stopAll()`)
   * bumps it, so an in-flight `doStart` sees itself superseded at its next
   * checkpoint and tears down instead of launching the stack after Stop has
   * already returned.
   */
  private startSeq = new Map<string, number>();
  /**
   * Per-target stop gates (#0843 review). `stop()` publishes one for the whole
   * duration of a teardown; `start()` waits on it, so the two can never
   * interleave and a stop's outcome always wins at the moment it returns.
   */
  private stopping = new Map<string, Promise<void>>();
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

  /** The declared companion services (#0843), in config order. */
  private serviceDefs(): DevServiceConfig[] {
    return this.config.dev?.services ?? [];
  }

  /**
   * Resolve a target's `services` name list against the declared
   * `[[dev.services]]` rows, in listed order. `unresolved` names what no block
   * defines — the caller fails the start loudly instead of booting a partial
   * stack, exactly like the preview supervisor's unknown-service check.
   */
  private resolveServices(t: DevTargetConfig): {
    defs: DevServiceConfig[];
    unresolved: string[];
  } {
    const defs: DevServiceConfig[] = [];
    const unresolved: string[] = [];
    const declared = this.serviceDefs();
    for (const name of t.services ?? []) {
      const def = declared.find((s) => s.name === name);
      if (!def) {
        unresolved.push(name);
        continue;
      }
      defs.push(def);
    }
    return { defs, unresolved };
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
   * Every target with its state, log and — for a failed target — the full
   * plain-language failure summary (#0775), including the process holding a
   * contended port. Async because resolving the port holder shells out.
   */
  async listDetailed(): Promise<DevTargetView[]> {
    return Promise.all(this.list().map((v) => this.enrichFailure(v)));
  }

  /** One target, failure-enriched, or null when unknown. */
  async getDetailed(name: string): Promise<DevTargetView | null> {
    const t = this.target(name);
    if (!t) return null;
    return this.enrichFailure(this.view(t));
  }

  /**
   * The failure summary for a target, or null when it is not failed. Used by
   * the explain route and the stop-holder action.
   */
  async describeFailure(name: string): Promise<DevFailureView | null> {
    const detailed = await this.getDetailed(name);
    return detailed?.failure ?? null;
  }

  /**
   * Stop the process holding a port a failed target could not bind (#0775).
   * Only ever kills a PID RepoOS recorded for one of its own dev targets — a
   * foreign process is left alone, with its PID and command shown instead.
   * The holder's whole stack stops: when the holder is a companion service,
   * its target and sibling services stop with it, so freeing a service's port
   * cannot leave the rest running (#0843 review).
   */
  async stopHolder(name: string): Promise<DevActionResult> {
    const t = this.target(name);
    if (!t) return { ok: false, error: `Unknown dev target "${name}"` };
    const failure = await this.describeFailure(name);
    const holder = failure?.holder;
    if (!holder) {
      return { ok: false, error: `No port conflict detected for "${t.label ?? name}".` };
    }
    if (!holder.repoosOwned || !holder.target) {
      return {
        ok: false,
        error: `Process ${holder.pid} was not started by RepoOS — stop it yourself with the command shown.`,
      };
    }
    // Stop the WHOLE stack that owns the port — the target process and its
    // companion services. A declared target goes through the gated `stop()`;
    // a persisted target no longer in config is torn down directly.
    if (this.target(holder.target)) await this.stop(holder.target);
    else await this.stopStack(holder.target);
    // A target re-adopted across a reload has no live handle, so the teardown
    // above does not kill its own process; make sure the holder itself is gone.
    if (isAlivePid(holder.pid)) {
      await this.killPid(holder.pid, process.platform !== "win32");
    }
    return { ok: true, target: this.view(t) };
  }

  /**
   * Fill a failed target's port-conflict summary with the process holding the
   * port. Best-effort: when `lsof` is unavailable or finds nothing, the
   * deterministic summary still renders without a holder.
   */
  private async enrichFailure(view: DevTargetView): Promise<DevTargetView> {
    const f = view.failure;
    if (!f || f.kind !== PORT_IN_USE || f.port === undefined) return view;
    const found = await this.lookupPortHolder(f.port);
    if (!found) return view;
    const owner = this.pidOwner(found.pid);
    const holder: DevPortHolder = {
      pid: found.pid,
      command: found.command,
      repoosOwned: owner !== null,
      stale: owner ? owner.stale : false,
      ...(owner ? { target: owner.target } : {}),
    };
    return { ...view, failure: { ...f, holder, canStopHolder: owner !== null } };
  }

  /**
   * The process listening on `port`, with its command line. Uses `lsof` where
   * available (macOS/Linux), an `ss` fallback on Linux, and `netstat` on
   * Windows. Best-effort: null when no tool can resolve it, in which case the
   * page still shows the deterministic summary without a PID.
   */
  private async lookupPortHolder(port: number): Promise<{ pid: number; command: string } | null> {
    const pid = await this.firstPidOnPort(port);
    if (pid === undefined) return null;
    const command = await this.processCommand(pid);
    return { pid, command: command.trim() || `(pid ${pid})` };
  }

  private async firstPidOnPort(port: number): Promise<number | undefined> {
    const fromLsof = await this.firstPidFromLsof(port);
    if (fromLsof !== undefined) return fromLsof;
    if (process.platform === "win32") {
      const out = await captureCommand("netstat", ["-ano", "-p", "tcp"]);
      return parseNetstatListenerPid(out, port);
    }
    return this.firstPidFromSs(port);
  }

  private async firstPidFromLsof(port: number): Promise<number | undefined> {
    const out = await captureCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return out
      .split("\n")
      .map((l) => Number(l.trim()))
      .find((n) => Number.isInteger(n) && n > 0);
  }

  /** Linux fallback when `lsof` is not installed. */
  private async firstPidFromSs(port: number): Promise<number | undefined> {
    const out = await captureCommand("ss", ["-ltnpH", `sport = :${port}`]);
    const m = out.match(/pid=(\d+)/);
    return m ? Number(m[1]) : undefined;
  }

  /** The holder's command line, via `ps` (POSIX) or `tasklist` (Windows). */
  private async processCommand(pid: number): Promise<string> {
    if (process.platform === "win32") {
      const out = await captureCommand("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
      const m = out.match(/^"([^"]+)"/m);
      return m ? m[1] : "";
    }
    return captureCommand("ps", ["-o", "command=", "-p", String(pid)]);
  }

  /**
   * The dev target whose recorded PID is `pid`, if any — the basis for treating
   * a port holder as RepoOS-owned. `stale` means there is no live handle for it,
   * so it is a leftover from an earlier run rather than a currently-supervised
   * process.
   */
  private pidOwner(pid: number): { target: string; stale: boolean } | null {
    return devPidOwner(this.states, new Set(this.running.keys()), pid);
  }

  /** The port a target is configured to use, when it declares one. */
  private portHint(t: DevTargetConfig, state: DevTargetState): number | undefined {
    if (state.resolvedPort !== undefined) return state.resolvedPort;
    if (t.port !== undefined) return t.port;
    const url = t.healthCheck?.url ?? t.url;
    if (!url) return undefined;
    try {
      const port = new URL(url).port;
      return port ? Number(port) : undefined;
    } catch {
      return undefined;
    }
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
    // Wait out any stop in progress (and any stop that begins while we wait),
    // so a start can never launch in the middle of a stop and leave the target
    // running after Stop returned (#0843 review).
    for (let stopping = this.stopping.get(name); stopping; stopping = this.stopping.get(name)) {
      await stopping;
    }
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

    // Claim a new start generation (#0843): a stop bumps this same counter to
    // cancel the start before it launches anything.
    const seq = (this.startSeq.get(name) ?? 0) + 1;
    this.startSeq.set(name, seq);
    // An `artifact` target is a one-shot build that exits; a re-start must
    // begin from a clean slate rather than refuse because the prior run is
    // recorded as "failed".
    this.setState(name, { status: "starting", error: undefined, log: [] });
    const p = this.doStart(t, seq);
    this.inflight.set(name, p);
    p.finally(() => this.inflight.delete(name)).catch(() => {
      /* handled by callers */
    });
    return p;
  }

  private async doStart(t: DevTargetConfig, seq: number): Promise<DevActionResult> {
    const cwd = this.config.root;
    const processGroup = process.platform !== "win32";
    /**
     * True once a concurrent stop has superseded this start (#0843 review).
     * Checked at every await boundary so a Stop that arrives while a port is
     * being reserved cannot be outrun by the rest of the startup.
     */
    const superseded = (): boolean => this.startSeq.get(t.name) !== seq;

    // A degraded target (a service crashed while it ran) still has a live main
    // process, and a stale stop can leave a lagging one: starting over it would
    // leak that process untracked, so clear the slate first. A deliberate stop
    // already removed the handles, so this is the only path that can find one.
    if (this.running.has(t.name) || this.serviceRuns.has(t.name) || this.adopted.has(t.name)) {
      await this.stopStack(t.name);
    }
    if (superseded()) return this.abortSupersededStart(t);

    /** Fail the whole start: tear down what booted, record, log, report. */
    const fail = async (message: string): Promise<DevActionResult> => {
      // A stop that landed during an await already owns the outcome; report the
      // neutral stopped state rather than a failure the user did not cause.
      if (superseded()) return this.abortSupersededStart(t);
      await this.stopStack(t.name, { reason: message });
      this.appendLog(t.name, `[repoos] ${message}`);
      return { ok: false, error: message, target: this.view(t) };
    };

    // #0843: companion services boot FIRST, each on its own port, so the main
    // command's `{api.port}` substitution names a live API by the time it runs.
    // A service that fails readiness fails the target with the service's name
    // in the reason, and everything started so far is torn down.
    const resolved = this.resolveServices(t);
    if (resolved.unresolved.length) {
      return fail(
        `target "${t.name}" references unknown dev service(s) ` +
          `${resolved.unresolved.map((n) => `"${n}"`).join(", ")} — ` +
          "declare each with a [[dev.services]] block in repoos.toml",
      );
    }

    /**
     * Placeholder tokens for the reserved service ports, in boot order —
     * registered as soon as a port is reserved, so a later service (and the
     * main command) can reference an earlier one by `{<token>.port}`.
     */
    const tokens: Record<string, number> = {};
    // Reject placeholder collisions BEFORE booting anything: two distinct names
    // that normalize to the same token (`api-v1` and `api_v1`) make the
    // documented `{<token>.port}` reference ambiguous, so fail loudly rather
    // than silently disambiguating it (#0843 review).
    const seenTokens = new Map<string, string>();
    for (const def of resolved.defs) {
      const token = servicePortToken(def.name) || "service";
      const clash = seenTokens.get(token);
      if (clash) {
        return fail(
          `services "${clash}" and "${def.name}" both map to the placeholder ` +
            `"{${token}.port}" — rename one so each has a distinct token`,
        );
      }
      seenTokens.set(token, def.name);
    }

    for (const def of resolved.defs) {
      if (superseded()) return this.abortSupersededStart(t);
      // The token names the service's port in every sibling's placeholders,
      // sanitized identically to `[[preview.services]]`.
      const token = servicePortToken(def.name) || "service";

      // Register the service BEFORE any fallible step (port reservation, cwd
      // resolution, spawn), so a startup failure is recorded against THIS
      // service instead of leaving it an unexplained "stopped" row
      // (#0843 review).
      this.setServiceStates(t.name, [
        ...(this.states.get(t.name)?.services ?? []).filter((s) => s.name !== def.name),
        { name: def.name, token, status: "starting", log: [] },
      ]);
      /** Record `def` as failed — with the reason — before failing the target. */
      const failService = async (message: string): Promise<DevActionResult> => {
        this.patchServiceState(t.name, def.name, { status: "failed", error: message });
        return fail(message);
      };

      let servicePort: number;
      // #0802 handling mirrored per service: auto-pick (the default) prefers
      // the configured `port` when it is free and falls back to an
      // OS-assigned one; auto-pick off pins the port, and an occupied one
      // fails with a message naming the service instead of silently moving.
      if (def.autoPort === false) {
        if (def.port === undefined) {
          return failService(`service "${def.name}" has auto-pick off but no port is set`);
        }
        try {
          servicePort = await reservePort(def.port, { fixed: true });
        } catch {
          return failService(`service "${def.name}" port ${def.port} is already in use`);
        }
      } else {
        try {
          servicePort = await reservePort(def.port);
        } catch (err) {
          return failService(
            `could not reserve a port for service "${def.name}": ${(err as Error).message}`,
          );
        }
      }
      tokens[token] = servicePort;
      this.patchServiceState(t.name, def.name, { port: servicePort });
      if (superseded()) return this.abortSupersededStart(t);

      const serviceCwd = def.cwd ? resolveWithin(cwd, def.cwd) : cwd;
      if (!serviceCwd) {
        return failService(`service "${def.name}" cwd "${def.cwd}" escapes the project root`);
      }
      // Snapshot the health file BEFORE the service spawns, so a stale marker
      // left by a previous run cannot satisfy the readiness gate (#0843 review).
      const healthPath = def.healthCheck?.file
        ? this.resolveHealthPath(def.healthCheck.file, serviceCwd)
        : null;
      const healthBaseline = healthFileStamp(healthPath);
      // PORT names the service's own reserved port; every sibling reserved so
      // far (and itself) is also reachable by environment variable, the way
      // the preview supervisor passes `REPOOS_PREVIEW_*`. A declared `env`
      // wins last, so a user override cannot be silently defaulted.
      const env: Record<string, string> = {
        PORT: String(servicePort),
        HOST: DEV_HOST,
        ...tokenEnv(tokens),
        ...(def.env ?? {}),
      };

      if (superseded()) return this.abortSupersededStart(t);
      let child: ChildProcess;
      try {
        child = spawn(expandServiceRefs(def.command, servicePort, tokens), {
          cwd: serviceCwd,
          shell: true,
          detached: processGroup,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, ...env },
        });
      } catch (err) {
        return failService(`could not launch service "${def.name}": ${(err as Error).message}`);
      }
      if (!child.pid) {
        return failService(`could not launch service "${def.name}" (no pid)`);
      }

      this.patchServiceState(t.name, def.name, { status: "starting", pid: child.pid });
      this.serviceRuns.set(t.name, [
        ...(this.serviceRuns.get(t.name) ?? []),
        { child, processGroup, longLived: true },
      ]);
      this.pipeService(child, t.name, def.name);

      // A service that exits on its own before its target stops has failed —
      // while the target is RUNNING that degradation is named visibly; while
      // it is STARTING the readiness gate below reports the precise reason.
      child.on("error", (err) => {
        this.appendServiceLog(t.name, def.name, `[repoos] process error: ${err.message}`);
      });
      child.on("exit", (code, signal) => {
        const runs = this.serviceRuns.get(t.name) ?? [];
        const idx = runs.findIndex((r) => r.child === child);
        if (idx === -1) return; // superseded, or a deliberate stop cleaned up
        const current = this.states.get(t.name);
        if (this.stackTeardowns.has(t.name) || current?.status === "stopped") return;
        const reason = `service "${def.name}" exited${
          code !== null ? ` with code ${code}` : ""
        }${signal ? ` (${signal})` : ""}`;
        void this.stopStack(t.name, { reason, failedService: def.name });
        this.appendLog(t.name, `[repoos] ${reason}`);
      });

      const ready = await this.waitForServiceReady(
        def,
        child,
        servicePort,
        tokens,
        serviceCwd,
        t.name,
        healthBaseline,
      );
      if (superseded()) return this.abortSupersededStart(t);
      if (!ready.ok) {
        this.appendServiceLog(t.name, def.name, `[repoos] ${ready.error}`);
        // A sibling's exit may have failed the target while this gate was
        // polling: its reason names the service that died, so it wins over
        // this gate's generic abort notice (#0843 review round 3). This
        // service itself is left to be torn down as stopped, not blamed.
        const prior = this.states.get(t.name);
        if (prior?.status === "failed" && prior.error) return fail(prior.error);
        return failService(`service "${def.name}" ${ready.error}`);
      }
      this.patchServiceState(t.name, def.name, { status: "running", error: undefined });
    }

    // #0843 review round 2: a service that exited after passing its readiness
    // gate — while its sibling gated, or while the target's own gate was about
    // to run — has already degraded the target below. Returning "success" with
    // a failed service would be the worst of both worlds, so stop here: the
    // services go down with the failed start and the reason (naming the
    // service) stands.
    const degraded = this.states.get(t.name);
    if (degraded?.status === "failed") {
      await fail(degraded.error ?? "a companion service failed during startup");
      return { ok: false, error: this.states.get(t.name)?.error, target: this.view(t) };
    }

    // #0751/#0802: a target whose command/url/healthCheck uses `{port}` gets a
    // port chosen now. Auto-pick (the default) prefers the target's configured
    // `port` when it is free and otherwise falls back to a free OS-assigned
    // port; auto-pick off uses the configured port as-is, so a clash fails with
    // the plain-language summary rather than being silently moved. A target
    // with no placeholder keeps its declared command and url untouched.
    let resolvedPort: number | undefined;
    if (usesPortPlaceholder(t)) {
      try {
        resolvedPort = t.autoPort === false ? t.port : await reservePort(t.port);
      } catch (err) {
        return fail(`could not reserve a port for "${t.name}": ${(err as Error).message}`);
      }
      if (resolvedPort === undefined) {
        return fail(
          `could not resolve a port for "${t.name}": auto-pick is off but no port is set`,
        );
      }
    }
    // #0843 review round 3: the reservation above is the last await before the
    // target spawns, and a service exit delivered during it has already
    // failed the target (the handler sees "starting") — which the
    // `setState(starting)` below would otherwise clear, returning "success"
    // with a dead service. Honor the standing failure instead: the services
    // go down with the failed start and the reason (naming the service)
    // stands. Exits delivered later are caught by the readiness gate's
    // degraded checks; nothing else can fail the target across the sync span
    // from here to that setState.
    const standing = this.states.get(t.name);
    if (standing?.status === "failed") {
      return fail(standing.error ?? "a companion service failed during startup");
    }
    if (superseded()) return this.abortSupersededStart(t);
    const command = expandServiceRefs(t.command, resolvedPort, tokens);

    let child: ChildProcess;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        detached: processGroup,
        stdio: ["ignore", "pipe", "pipe"],
        // #0843: every companion service's port is also reachable by env var,
        // the way `[[preview.services]]` passes `REPOOS_PREVIEW_*` to a target.
        env: { ...process.env, ...(Object.keys(tokens).length ? tokenEnv(tokens) : {}) },
      });
    } catch (err) {
      // A failed start tears the companion services down with it (#0843
      // review round 1) — they are owned by the target, and a half-booted
      // stack must not outlive the start that failed.
      await fail(`could not launch "${t.name}": ${(err as Error).message}`);
      return { ok: false, error: this.states.get(t.name)?.error, target: this.view(t) };
    }

    const pid = child.pid;
    if (!pid) {
      await fail(`could not launch "${t.name}" (no pid)`);
      return { ok: false, error: this.states.get(t.name)?.error, target: this.view(t) };
    }

    this.running.set(t.name, { child, processGroup, longLived: t.kind !== "artifact" });
    this.adopted.delete(t.name);
    this.setState(t.name, {
      status: "starting",
      pid,
      startedAt: now(),
      error: undefined,
      resolvedPort,
    });

    this.pipe(child, t.name);

    // A target that exits on its own is observed here: an `artifact` that
    // exits 0 has succeeded; a long-lived `server`/`process` (or a non-zero
    // exit) has failed — unless we are the ones stopping it, in which case
    // `stopping` is set and the exit is expected.
    child.on("error", (err) => {
      this.appendLog(t.name, `[repoos] process error: ${err.message}`);
      if (this.running.get(t.name)?.child === child && !this.stackTeardowns.has(t.name)) {
        void this.stopStack(t.name, { reason: err.message });
      }
    });
    child.on("exit", (code, signal) => {
      const entry = this.running.get(t.name);
      if (!entry || entry.child !== child) return; // superseded or already handled
      const current = this.states.get(t.name);
      if (this.stackTeardowns.has(t.name) || current?.status === "stopped") return;
      const ok = code === 0;
      if (!entry.longLived && ok) {
        this.appendLog(t.name, "[repoos] build finished (exit 0)");
        void this.stopStack(t.name, { completed: true });
      } else {
        const reason = entry.longLived
          ? `process exited${code !== null ? ` with code ${code}` : ""}${
              signal ? ` (${signal})` : ""
            }`
          : `exited with code ${code ?? "?"}${signal ? ` (${signal})` : ""}`;
        void this.stopStack(t.name, { reason });
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
      if (superseded()) return this.abortSupersededStart(t);
      const state = this.states.get(t.name);
      // A service that crashed while this build ran makes the stack failed even
      // if the build itself exited 0 (#0843 review) — never report success with
      // a dead companion.
      const failedService = (state?.services ?? []).find((s) => s.status === "failed");
      if (state?.status === "failed" || failedService) {
        // A failed build tears its companion services down with it (#0843
        // review round 1) — the start they were booted for failed.
        const reason =
          state?.status === "failed"
            ? (state.error ?? "build failed")
            : (failedService?.error ?? `service "${failedService?.name}" failed`);
        await this.stopStack(t.name, { reason });
        return { ok: false, error: this.states.get(t.name)?.error, target: this.view(t) };
      }
      // Artifact services are scoped to the build invocation and must not
      // survive its successful exit.
      await this.stopStack(t.name, { completed: true });
      return { ok: true, target: this.view(t) };
    }

    // A long-lived target (a `server` or a `process`) is ready when its health
    // check passes (its configured URL answers, or a healthCheck file exists).
    // Without a health check, a still-live process a moment later is running —
    // which is exactly how a `process` target is healthy.
    const ready = await this.waitForReady(t, child, resolvedPort, tokens);
    if (!ready.ok) {
      if (superseded()) return this.abortSupersededStart(t);
      await this.stopStack(t.name, { reason: ready.error });
      this.appendLog(t.name, `[repoos] ${ready.error}`);
      return { ok: false, error: ready.error, target: this.view(t) };
    }
    if (superseded()) return this.abortSupersededStart(t);
    if (this.states.get(t.name)?.status !== "failed") {
      this.setState(t.name, { status: "running", error: undefined });
    }
    // #0843 review round 2: never report success while a failure stands — an
    // exit racing the last readiness poll has already marked the target
    // failed (the process is gone), and the start answer must agree.
    const finalState = this.states.get(t.name);
    if (finalState?.status === "failed") {
      await this.stopStack(t.name, { reason: finalState.error ?? "the target failed" });
      return { ok: false, error: finalState.error ?? "the target failed", target: this.view(t) };
    }
    return { ok: true, target: this.view(t) };
  }

  /**
   * Wait until a started long-lived target — a `server` or a `process` — is
   * ready: its `healthCheck.url` answers (or a `healthCheck.file` exists), or —
   * with no health check (always the case for a `process`) — the process is
   * still alive after a short settle. Returns `{ ok:false }` with a reason on
   * failure, never throwing.
   */
  private async waitForReady(
    t: DevTargetConfig,
    child: ChildProcess,
    resolvedPort?: number,
    tokens: Record<string, number> = {},
  ): Promise<{ ok: boolean; error: string }> {
    /** Abort the poll the moment something else has failed the target. */
    const degraded = (): { ok: boolean; error: string } | null => {
      const state = this.states.get(t.name);
      if (state?.status === "failed") {
        return { ok: false, error: state.error ?? "the target failed during startup" };
      }
      // A companion can exit while the asynchronous target health probe is
      // in flight, before its exit callback updates persisted state. Check
      // the owned child handles as well as the status snapshot before accepting
      // readiness.
      const deadRun = (this.serviceRuns.get(t.name) ?? []).find((run) => !this.isAlive(run.child));
      const deadService = state?.services?.find((service) => service.pid === deadRun?.child.pid);
      if (!deadRun || !deadService) return null;
      const reason = `service "${deadService.name}" exited unexpectedly`;
      void this.stopStack(t.name, { reason, failedService: deadService.name });
      return { ok: false, error: reason };
    };
    const hc = t.healthCheck;
    if (hc?.file) {
      const path = this.resolveHealthPath(hc.file);
      if (!path) return { ok: false, error: `healthCheck file "${hc.file}" escapes the repo` };
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (existsSync(path)) return { ok: true, error: "" };
        // #0843 review round 2: a companion service's crash degrades the
        // target — its reason ends this wait instead of burning the timeout.
        if (degraded()) return degraded()!;
        if (!this.isAlive(child))
          return { ok: false, error: "process exited before the health file appeared" };
        await sleep(HEALTH_POLL_MS);
      }
      return { ok: false, error: `health file "${hc.file}" did not appear in time` };
    }
    // #0751: a `{port}` in the health check url (or the target's own url) is the
    // SAME port the command was given, so readiness is probed on the real port.
    // #0843: a `{<service>.port}` reference resolves to the service's reserved
    // port the same way.
    const url =
      t.url || hc?.url
        ? expandServiceRefs(hc?.url ?? t.url ?? "", resolvedPort, tokens)
        : undefined;
    if (url) {
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const answers = await probeUrl(url);
        if (degraded()) return degraded()!;
        if (answers) return { ok: true, error: "" };
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
    if (degraded()) return degraded()!;
    if (!this.isAlive(child)) return { ok: false, error: "process exited immediately" };
    return { ok: true, error: "" };
  }

  /**
   * Wait until a started companion service (#0843) is ready, with the same
   * contract as a target's readiness gate: its `healthCheck.url` answers (with
   * the service's own `{port}` and any sibling `{<token>.port}` substituted),
   * or a `healthCheck.file` exists (resolved against the SERVICE's cwd) AND is
   * newer than its pre-spawn stamp — a stale marker from an earlier run does
   * not count — or, with no health check at all, the process is still alive
   * after a short settle. Returns `{ ok:false }` with a reason on failure, never
   * throwing; the caller prefixes the reason with the service's name.
   */
  private async waitForServiceReady(
    def: DevServiceConfig,
    child: ChildProcess,
    port: number,
    tokens: Record<string, number>,
    cwd: string,
    target: string,
    healthBaseline: number | null,
  ): Promise<{ ok: boolean; error: string }> {
    /** Abort when a sibling's crash has (or the target state has) failed. */
    const degraded = (): boolean => this.states.get(target)?.status === "failed";
    const hc = def.healthCheck;
    if (hc?.file) {
      const path = this.resolveHealthPath(hc.file, cwd);
      if (!path)
        return { ok: false, error: `healthCheck file "${hc.file}" escapes the project root` };
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        // Liveness first, then freshness: an exited service is never ready, and
        // a file that predates this start is not this run's readiness signal.
        if (this.isAlive(child) && healthFileIsFresh(path, healthBaseline))
          return { ok: true, error: "" };
        if (degraded())
          return { ok: false, error: "startup aborted: a sibling companion service failed" };
        if (!this.isAlive(child)) {
          return { ok: false, error: "exited before the health file appeared" };
        }
        await sleep(HEALTH_POLL_MS);
      }
      return { ok: false, error: `health file "${hc.file}" did not appear in time` };
    }
    const url = hc?.url ? expandServiceRefs(hc.url, port, tokens) : undefined;
    if (url) {
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await probeUrl(url)) return { ok: true, error: "" };
        if (degraded())
          return { ok: false, error: "startup aborted: a sibling companion service failed" };
        if (!this.isAlive(child)) {
          return { ok: false, error: "exited before it answered its health check" };
        }
        await sleep(HEALTH_POLL_MS);
      }
      return { ok: false, error: `${url} did not answer within ${HEALTH_TIMEOUT_MS / 1000}s` };
    }
    await sleep(HEALTH_POLL_MS);
    if (degraded())
      return { ok: false, error: "startup aborted: a sibling companion service failed" };
    if (!this.isAlive(child)) return { ok: false, error: "exited immediately" };
    return { ok: true, error: "" };
  }

  /**
   * Resolve a health-check file path inside `base` (the repo root for a
   * target, the service's cwd for a companion service #0843). Rejects an
   * absolute path or one that escapes the base, so a config typo can never
   * point the check at an arbitrary location.
   */
  private resolveHealthPath(file: string, base = this.config.root): string | null {
    return resolveWithin(base, file);
  }

  private isAlive(child: ChildProcess): boolean {
    return child.exitCode === null && child.signalCode === null && child.pid !== undefined;
  }

  /**
   * Stop a target (idempotent). Its companion services (#0843) stop with it —
   * the live handles first, then (for a target re-adopted across a reload,
   * which holds no handles) the service PIDs recorded while they were still
   * considered live.
   */
  async stop(name: string): Promise<DevActionResult> {
    const t = this.target(name);
    if (!t) return { ok: false, error: `Unknown dev target "${name}"` };
    // Publish a stop gate BEFORE the first await: a `start()` arriving while
    // this stop is still tearing the target down must wait it out rather than
    // claim a new generation and launch mid-stop, which would leave the target
    // running after Stop returned (#0843 review).
    let releaseStop!: () => void;
    const gate = new Promise<void>((resolveGate) => (releaseStop = resolveGate));
    this.stopping.set(name, gate);
    try {
      return await this.stopInternal(t);
    } finally {
      releaseStop();
      if (this.stopping.get(name) === gate) this.stopping.delete(name);
    }
  }

  /** The body of {@link stop}, run behind the per-target stop gate. */
  private async stopInternal(t: DevTargetConfig): Promise<DevActionResult> {
    await this.stopStack(t.name);
    const inflight = this.inflight.get(t.name);
    if (inflight) await inflight.catch(() => {});
    return { ok: true, target: this.view(t) };
  }

  /**
   * Tear down a target's running stack — its process and its companion
   * services — and mark its state stopped. Works from persisted state, so the
   * port-conflict Stop action can free a port held by a target that is no
   * longer declared in config (#0843 review).
   */
  private stopStack(
    name: string,
    outcome: { reason?: string; failedService?: string; completed?: boolean } = {},
  ): Promise<void> {
    const existing = this.stackTeardowns.get(name);
    if (existing) return existing;
    // Cancel an in-flight start (#0843 review): bump the generation so the
    // running `doStart` stops at its next checkpoint. Without this, a Stop that
    // arrives while the first service port is being reserved would find no
    // process to kill yet and the start would go on to launch the whole stack.
    if (!outcome.completed) this.startSeq.set(name, (this.startSeq.get(name) ?? 0) + 1);
    this.adopted.delete(name);
    const targetEntry = this.running.get(name);
    const serviceEntries = this.serviceRuns.get(name) ?? [];
    this.running.delete(name);
    this.serviceRuns.delete(name);

    const previous = this.states.get(name);
    const pids = new Map<number, boolean>();
    const remember = (pid: number | undefined, processGroup: boolean): void => {
      if (typeof pid !== "number" || pid <= 0) return;
      pids.set(pid, (pids.get(pid) ?? false) || processGroup);
    };
    remember(targetEntry?.child.pid, targetEntry?.processGroup ?? process.platform !== "win32");
    remember(previous?.pid, process.platform !== "win32");
    for (const entry of serviceEntries) remember(entry.child.pid, entry.processGroup);
    for (const service of previous?.services ?? []) {
      remember(service.pid, process.platform !== "win32");
    }

    const isFailure = Boolean(outcome.reason);
    const services = (previous?.services ?? []).map((service) => {
      const failed =
        isFailure && (service.name === outcome.failedService || service.status === "failed");
      return {
        ...service,
        status: failed ? ("failed" as const) : ("stopped" as const),
        ...(failed ? {} : { error: undefined }),
        pid: undefined,
        ...(service.name === outcome.failedService && outcome.reason
          ? { error: outcome.reason }
          : {}),
      };
    });
    this.setState(name, {
      status: isFailure ? "failed" : outcome.completed ? "running" : "stopped",
      error: outcome.reason,
      pid: undefined,
      stoppedAt: now(),
      services,
    });

    const teardown = Promise.all(
      [...pids].map(async ([pid, processGroup]) => {
        if (isAlivePid(pid)) await this.killPid(pid, processGroup);
      }),
    ).then(() => undefined);
    this.stackTeardowns.set(name, teardown);
    void teardown.finally(() => {
      if (this.stackTeardowns.get(name) === teardown) this.stackTeardowns.delete(name);
    });
    return teardown;
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
    const names = [
      ...new Set([
        ...this.running.keys(),
        ...this.adopted,
        ...this.serviceRuns.keys(),
        ...this.inflight.keys(),
      ]),
    ];
    for (const name of names) {
      await this.stopStack(name);
      const inflight = this.inflight.get(name);
      if (inflight) await inflight.catch(() => {});
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
    for (const state of Object.values(payload?.targets ?? {})) {
      const targetAlive = typeof state.pid === "number" && state.pid > 0 && isAlivePid(state.pid);
      const deadService = (state.services ?? []).find(
        (service) =>
          (service.status === "running" || service.status === "starting") &&
          typeof service.pid === "number" &&
          service.pid > 0 &&
          !isAlivePid(service.pid),
      );
      if (
        isReload &&
        targetAlive &&
        (state.status === "running" || state.status === "starting") &&
        !deadService
      ) {
        this.states.set(state.name, { ...state, status: "running" });
        this.adopted.add(state.name);
        continue;
      }
      // Reload, cold boot, stale failed state, and partial stacks all use the
      // same idempotent teardown as live exits and explicit Stop.
      this.states.set(state.name, state);
      const reason =
        state.status === "failed"
          ? state.error
          : deadService
            ? `service "${deadService.name}" exited unexpectedly`
            : undefined;
      void this.stopStack(state.name, {
        ...(reason ? { reason } : {}),
        ...(deadService ? { failedService: deadService.name } : {}),
      });
      if (deadService && reason) this.appendLog(state.name, `[repoos] ${reason}`);
    }
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
    // liveness is the only truth. Route disappearance through stack teardown
    // so its still-live services cannot remain unmanaged.
    if (
      this.adopted.has(t.name) &&
      state.pid !== undefined &&
      !this.running.has(t.name) &&
      (state.status === "running" || state.status === "starting") &&
      !isAlivePid(state.pid)
    ) {
      void this.stopStack(t.name, { reason: "target exited unexpectedly" });
      state = this.states.get(t.name) ?? state;
    }
    // The re-adopted target's companion services have no handles either
    // (#0843 review round 1): the same lazy PID-liveness check is the truth,
    // and a service found dead is marked failed and degrades the target
    // visibly, just like the live-path exit handler would.
    if (this.adopted.has(t.name) && !this.running.has(t.name)) {
      const dead = (state.services ?? []).filter(
        (s) =>
          (s.status === "running" || s.status === "starting") &&
          typeof s.pid === "number" &&
          s.pid > 0 &&
          !isAlivePid(s.pid),
      );
      if (dead.length) {
        const first = dead[0]!;
        const reason = `service "${first.name}" exited unexpectedly`;
        void this.stopStack(t.name, { reason, failedService: first.name });
        state = this.states.get(t.name) ?? state;
      }
    }
    // #0751: show the real command and url of a running target — the `{port}`
    // substituted at the last start — rather than the templated declaration. A
    // target with no placeholder (no `resolvedPort`) keeps its declared values.
    // #0843: a `{<service>.port}`/`{<service>.url}` reference resolves the same
    // way, from the tokens each service recorded when it booted.
    const tokens: Record<string, number> = {};
    for (const s of state.services ?? []) {
      if (typeof s.port === "number") tokens[s.token] = s.port;
    }
    const command = expandServiceRefs(t.command, state.resolvedPort, tokens);
    const url = t.url ? expandServiceRefs(t.url, state.resolvedPort, tokens) : undefined;
    const port = this.portHint(t, state);
    // Companion services (#0843): pair each declared name with its live state,
    // so a never-started target still shows its services as stopped rows.
    let services: DevServiceView[] | undefined;
    if (t.services?.length) {
      services = t.services.map((name) => {
        const def = this.serviceDefs().find((s) => s.name === name);
        const src: DevServiceState =
          state.services?.find((s) => s.name === name) ??
          ({
            name,
            token: servicePortToken(def?.name ?? name) || "service",
            status: "stopped" as const,
            log: [],
          } as DevServiceState);
        const srcTokens = src.port !== undefined ? { ...tokens, [src.token]: src.port } : tokens;
        return {
          ...src,
          // The readiness url is only public once the service resolved a real
          // port — before that it is a `{port}` template, not a usable url.
          ...(def?.healthCheck?.url && src.port !== undefined
            ? { url: expandServiceRefs(def.healthCheck.url, src.port, srcTokens) }
            : {}),
          command: expandServiceRefs(def?.command ?? "", src.port, srcTokens),
        };
      });
    }
    const view: DevTargetView = {
      name: t.name,
      kind: t.kind,
      command,
      label: t.label ?? t.name,
      ...(url ? { url } : {}),
      ...(port !== undefined ? { port } : {}),
      ...(t.artifactPath ? { artifactPath: t.artifactPath } : {}),
      ...(services ? { services } : {}),
      status: state.status,
      ...(state.error ? { error: state.error } : {}),
      ...(state.pid !== undefined ? { pid: state.pid } : {}),
      ...(state.startedAt ? { startedAt: state.startedAt } : {}),
      ...(state.stoppedAt ? { stoppedAt: state.stoppedAt } : {}),
      log: state.log.slice(-DEV_LOG_MAX_LINES),
    };
    if (state.status === "failed") {
      // The deterministic summary is available synchronously; `enrichFailure`
      // adds the process holding a contended port when the API layer asks.
      view.failure = {
        ...failureSummary({
          label: view.label,
          error: state.error,
          log: state.log,
          portHint: this.portHint(t, state),
        }),
        canStopHolder: false,
      };
    }
    return view;
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
    if (patch.pid === undefined && Object.hasOwn(patch, "pid")) delete next.pid;
    this.states.set(name, next);
    this.persist();
  }

  private appendLog(name: string, line: string): void {
    const prev = this.states.get(name);
    const log = [...(prev?.log ?? []), line].slice(-DEV_LOG_MAX_LINES);
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

  /** Replace a target's list of companion-service states (#0843). */
  private setServiceStates(target: string, services: DevServiceState[]): void {
    this.setState(target, { services });
  }

  /** Patch one companion service's state by name (#0843). */
  private patchServiceState(
    target: string,
    service: string,
    patch: Partial<DevServiceState>,
  ): void {
    const prev = this.states.get(target);
    if (!prev) return;
    const services = (prev.services ?? []).map((s) => {
      if (s.name !== service) return s;
      const merged: DevServiceState = { ...s, ...patch };
      // Same convention as the target state: a patch that carries no error
      // never retains a stale one (the key is dropped, not set undefined).
      if (patch.error === undefined) delete merged.error;
      if (patch.pid === undefined && Object.hasOwn(patch, "pid")) delete merged.pid;
      return merged;
    });
    this.setState(target, { services });
  }

  /** Append one line to a companion service's ring buffer (#0843). */
  private appendServiceLog(target: string, service: string, line: string): void {
    const prev = this.states.get(target);
    if (!prev) return;
    const services = (prev.services ?? []).map((s) =>
      s.name === service ? { ...s, log: [...s.log, line].slice(-DEV_LOG_MAX_LINES) } : s,
    );
    this.states.set(target, { ...prev, services });
  }

  /** Forward a service child's stdout+stderr into its own ring buffer (#0843). */
  private pipeService(child: ChildProcess, target: string, service: string): void {
    const onData = (c: Buffer) => {
      for (const raw of c.toString("utf8").split("\n")) {
        const line = raw.replace(/\r$/, "");
        if (line.trim() === "") continue;
        this.appendServiceLog(target, service, line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
  }

  /**
   * Tear down a start that a concurrent stop superseded (#0843 review): kill
   * anything it booted and report the neutral stopped state, rather than a
   * failure the user did not cause. `stop()` already owns the target's state,
   * so this only settles what the unwinding start had not reached yet.
   */
  private async abortSupersededStart(t: DevTargetConfig): Promise<DevActionResult> {
    const state = this.states.get(t.name);
    await this.stopStack(t.name, state?.status === "failed" ? { reason: state.error } : {});
    const finalState = this.states.get(t.name);
    return {
      ok: finalState?.status !== "failed",
      ...(finalState?.status === "failed" && finalState.error ? { error: finalState.error } : {}),
      target: this.view(t),
    };
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
          log: Array.isArray(state.log) ? state.log.slice(-DEV_LOG_MAX_LINES) : [],
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

/** The placeholder host for services — shared with the preview supervisor. */
const DEV_HOST = "127.0.0.1";

/**
 * The environment block naming every reserved service port (#0843): each
 * service's port/URL by `REPOOS_DEV_<TOKEN>_PORT` / `REPOOS_DEV_<TOKEN>_URL`,
 * the dev counterpart of the preview supervisor's `REPOOS_PREVIEW_*`. A
 * service's siblings (and the main command) can read a live port without
 * parsing placeholders.
 */
function tokenEnv(tokens: Record<string, number>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [token, port] of Object.entries(tokens)) {
    const upper = token.toUpperCase();
    env[`REPOOS_DEV_${upper}_PORT`] = String(port);
    env[`REPOOS_DEV_${upper}_URL`] = `http://${DEV_HOST}:${port}`;
  }
  return env;
}

/**
 * Resolve a configured relative path inside `base` (the repo root for a
 * target cwd, a service's cwd for its health-check file). Null when the value
 * is empty, absolute, or escapes the base — so a config typo can never point
 * the runtime at an arbitrary location.
 */
function resolveWithin(base: string, relPath: string | undefined): string | null {
  if (!relPath) return null;
  if (isAbsolute(relPath)) return null;
  const root = resolve(base);
  const full = resolve(root, relPath);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}

/**
 * The mtime of a health-check file, or null when it does not exist. Captured
 * BEFORE a process starts (#0843 review), so a marker left by an earlier run is
 * distinguishable from one this run wrote.
 */
function healthFileStamp(path: string | null): number | null {
  if (!path) return null;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** Whether a health file now exists and is NEWER than its pre-start stamp. */
function healthFileIsFresh(path: string, baseline: number | null): boolean {
  try {
    const mtime = statSync(path).mtimeMs;
    return baseline === null || mtime > baseline;
  } catch {
    return false;
  }
}

const execFileAsync = promisify(execFile);

/**
 * Run a read-only command and capture stdout. Never throws: a non-zero exit
 * (`lsof` exits 1 when no process holds the port) returns whatever stdout it
 * produced, and a missing binary returns "".
 */
async function captureCommand(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 5000, maxBuffer: 1_000_000 });
    return stdout;
  } catch (err) {
    const out = (err as { stdout?: string }).stdout;
    return typeof out === "string" ? out : "";
  }
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

/**
 * Which dev target (if any) recorded `pid` — either as the target's own process
 * or as one of its companion services (#0843) — and whether that target has no
 * live handle (a leftover from an earlier run). A service PID resolves to its
 * TARGET, so the port-conflict Stop action can stop the whole stack. Exported
 * for the port-holder ownership test (#0775); the manager itself is the only
 * caller.
 */
export function devPidOwner(
  states: ReadonlyMap<string, DevTargetState>,
  live: ReadonlySet<string>,
  pid: number,
): { target: string; stale: boolean } | null {
  for (const [name, state] of states) {
    if (state.pid === pid) return { target: name, stale: !live.has(name) };
    if ((state.services ?? []).some((s) => s.pid === pid)) {
      return { target: name, stale: !live.has(name) };
    }
  }
  return null;
}

/**
 * The PID listening on `port` from Windows `netstat -ano -p tcp` output. Split
 * out so the Windows fallback path is unit-tested off-Windows (#0775).
 */
export function parseNetstatListenerPid(output: string, port: number): number | undefined {
  for (const line of output.split("\n")) {
    if (!/\bLISTENING\b/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    const local = cols[1] ?? "";
    if (!local.endsWith(`:${port}`)) continue;
    const pid = Number(cols[cols.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return undefined;
}

/** The `{port}` token a dev target's fields may carry (#0751). */
export const DEV_PORT_PLACEHOLDER = "{port}";

/** Whether any of a target's templated fields use the `{port}` placeholder. */
export function usesPortPlaceholder(t: DevTargetConfig): boolean {
  return (
    t.command.includes(DEV_PORT_PLACEHOLDER) ||
    (t.url?.includes(DEV_PORT_PLACEHOLDER) ?? false) ||
    (t.healthCheck?.url?.includes(DEV_PORT_PLACEHOLDER) ?? false)
  );
}

/**
 * Replace `{port}` in one templated field. With no resolved port the string is
 * returned untouched, so a target that never starts (or has no placeholder)
 * keeps exactly the value it declared.
 */
export function expandPort(
  template: string | undefined,
  port: number | undefined,
): string | undefined {
  if (template === undefined) return undefined;
  if (port === undefined) return template;
  return template.replaceAll(DEV_PORT_PLACEHOLDER, String(port));
}

/**
 * A free port, released just before the target's process binds — the same
 * approach `[[preview.targets]]` uses (#0751). Choosing the port here (rather
 * than a fixed one in config) is what keeps a dev server from clashing with
 * another app on the machine.
 *
 * #0802: when the target declares a preferred port, bind it first and keep it
 * if it is free; an `EADDRINUSE` falls back to an OS-assigned port. That gives
 * a stable URL when the port is available and a non-clashing one when it is
 * not. The fallback never signals the process holding the port — only a port
 * is reserved, nothing is stopped.
 *
 * #0843: `fixed` opts a PINNED reserved port (a companion service with
 * auto-pick off) out of the fallback — an occupied port then rejects, so the
 * caller can fail with a message naming the service instead of silently
 * moving it.
 */
function reservePort(preferred?: number, options: { fixed?: boolean } = {}): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const attempt = (port: number, allowFallback: boolean): void => {
      const srv = createTcpServer();
      srv.once("error", (err) => {
        if (allowFallback && (err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          attempt(0, false);
          return;
        }
        reject(err);
      });
      srv.listen(port, "127.0.0.1", () => {
        const actual = (srv.address() as { port: number }).port;
        srv.close(() => resolvePort(actual));
      });
    };
    if (options.fixed && preferred !== undefined) {
      attempt(preferred, false);
      return;
    }
    attempt(preferred ?? 0, preferred !== undefined);
  });
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
