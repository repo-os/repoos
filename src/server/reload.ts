/**
 * Auto-reload for `repoos serve` (task 0066).
 *
 * A long-lived serve process loads compiled JS from dist/ at startup and never
 * reloads, so after a task merges to main and `bun run build` writes a new
 * dist/, the running server keeps serving the OLD build — the live API/UI
 * silently diverge from main until a human restarts. This manager closes that
 * gap:
 *
 * - On boot it captures the build hash from dist/.build-info.json. If a newer
 *   build already landed on disk, it reloads immediately (stale-boot
 *   self-heal).
 * - It watches dist/.build-info.json (fs.watch on the dist dir, plus a
 *   low-frequency hash poll as a platform-proof fallback). A hash CHANGE
 *   schedules a reload — the same hash mechanism the CLI staleness guard uses,
 *   never mtimes or timers.
 * - A reload no longer defers for agent turns (0214): agent child stdout/stderr
 *   is durable (per-task log file in .repoos/agent-logs/), so the replacement
 *   server re-attaches to still-running children via the durable registry
 *   (.repoos/agents.json). A restart proceeds immediately regardless of how
 *   many agent turns are in flight.
 * - A close-out (0143) is a harder deferral: the pipeline itself runs builds
 *   and checks, so reloading under it would kill the server mid-close-out.
 *   While the close-out lock is held, a new build is PARKED instead — the UI
 *   is told a new version is available and the reload fires only when the
 *   user asks for it (POST /api/server/restart). A reload already in flight
 *   when a close-out begins is aborted at handover so the pipeline is never
 *   killed.
 * - Reload = spawn a replacement `repoos serve` on the same host/port
 *   (REPOOS_RELOAD=1 + a per-reload handshake secret), confirm it is up by
 *   polling /api/health for the handshake, then exit cleanly. The replacement
 *   retries its bind while the parent holds the port; the parent releases its
 *   listener (a brief graceful drain) so the replacement can bind, then exits
 *   only after the replacement is confirmed ready. If the replacement never
 *   becomes ready the parent re-binds and keeps serving — no outage.
 *   SO_REUSEPORT is attempted by the replacement for a zero-downtime handoff
 *   on platforms that support it; where it is unsupported (ENOTSUP on macOS,
 *   the platform this repo runs on) the drain path is used instead.
 *
 * Zero runtime deps: node:fs / node:path / node:http / node:child_process.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBuildStamp } from "../core/build.js";
import { isPortListening } from "./serve-reaper.js";

/** The answer POST /api/server/restart and the reload triggers report. */
export type ReloadState =
  | { state: "reloading"; reason?: string }
  | { state: "deferred"; running: number; reason?: string }
  | { state: "not-stale"; reason?: string };

export interface ReloadManagerOptions {
  /** Repo root the serve process is rooted at (the replacement is spawned here). */
  root: string;
  host: string;
  port: number;
  /** Build hash captured at boot — the hash of the code this process runs. */
  loadedHash: string | null;
  /** False when auto-reload is impossible (dev mode, preview child, ephemeral port). */
  enabled?: boolean;
  /** True when this process is itself a reload replacement (skip boot self-heal). */
  isReplacement?: boolean;
  /** Count of running agent turns — a reload is deferred while > 0. */
  isBusy: () => number;
  /**
   * True while a review→done close-out is running (0143). The close-out
   * pipeline builds/checks dist itself, so an auto-reload must never fire
   * under it. New builds it produces are parked (`build.available`) for a
   * user-triggered reload instead.
   */
  closingOut: () => boolean;
  /**
   * Fired once when a new build lands on disk while a close-out holds the
   * deferral — the build is parked for a user-triggered reload (via
   * POST /api/server/restart) rather than applied automatically. Receives the
   * on-disk build hash.
   */
  onBuildAvailable?: (hash: string) => void;
  /** Resolve the compiled CLI entrypoint used to spawn the replacement. */
  cliEntry: () => string | null;
  /** Release only the HTTP listener (the drain window); the process keeps running. */
  stopListening: () => Promise<void>;
  /** Re-bind the HTTP listener after an aborted reload. */
  listen: () => Promise<void>;
  /** The replacement is confirmed ready: tear down and exit this process. */
  onReloadConfirmed: () => Promise<void>;
  /** A reload failed and the old process kept serving. */
  onReloadFailed?: (reason: string) => void;
  /** Low-frequency hash poll interval in ms (fallback when fs.watch is unreliable). */
  pollMs?: number;
  /** How often a deferred reload is retried while the runner stays busy, in ms. */
  retryMs?: number;
  /** Grace before releasing the listener (gives SO_REUSEPORT a chance), in ms. */
  graceMs?: number;
  /** Total time to wait for the replacement's readiness handshake, in ms. */
  handshakeTimeoutMs?: number;
  /**
   * How long the replacement must stay healthy (handshake answered) before the
   * old process logs "replacement is up" and releases its listener. Guards the
   * #0096 incident shape: a replacement that answered once, was confirmed, then
   * died right after the old process exited, leaving the port listenerless.
   */
  confirmMs?: number;
  /** How long the old process re-binds its listener before giving up, in ms. */
  rebindTimeoutMs?: number;
  log?: (msg: string) => void;
}

/** True when running from src/ (dev mode) rather than compiled dist/. */
export function isDevBuild(): boolean {
  const pathSep = process.platform === "win32" ? "\\\\" : "/";
  return fileURLToPath(import.meta.url).includes(`${pathSep}src${pathSep}`);
}

/** Read the build hash from dist/.build-info.json, or null when absent. */
export function readBuildHash(root: string): string | null {
  const file = join(root, "dist", ".build-info.json");
  try {
    const info = JSON.parse(readFileSync(file, "utf8")) as { hash?: unknown };
    return typeof info.hash === "string" && info.hash ? info.hash : null;
  } catch {
    return null;
  }
}

/**
 * Read the build timestamp from dist/.build-stamp.json, or null. Kept separate
 * from the hash marker so `.build-info.json` stays byte-identical across
 * rebuilds of identical source — see readBuildStamp in core/build.ts.
 */
export function readBuildAt(root: string): string | null {
  return readBuildStamp(root);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const DEFAULT_POLL_MS = 5000;
const DEFAULT_RETRY_MS = 2000;
const DEFAULT_GRACE_MS = 2000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000;
/** Sustained-health window before a replacement handoff is confirmed. */
const DEFAULT_CONFIRM_MS = 750;
const RELOAD_POLL_MS = 150;
const REBIND_TIMEOUT_MS = 5000;
const WATCH_DEBOUNCE_MS = 60;
/**
 * Backoff after a failed handoff (#0271 incident): a replacement that fails
 * to become ready gets retried on the very next poll tick with no cooldown.
 * If builds keep landing (several close-outs in quick succession) that
 * becomes an unbounded retry loop — a full server boot, every ~5s, forever —
 * which is what actually took the control plane down (29 failed attempts
 * back to back). Doubles per consecutive failure, capped, and resets on the
 * next successful handoff.
 */
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/** GET a URL and JSON.parse it; resolves null on any failure (never throws). */
function probeJson(url: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        data += c;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) as Record<string, unknown>);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

export class ReloadManager {
  private readonly options: ReloadManagerOptions;
  private readonly loadedHash: string | null;
  private fsWatcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private reloading = false;
  private pending = false;
  private stopped = false;
  private child: ChildProcess | null = null;
  private childExited = false;
  /** Whether we released our own HTTP listener for the replacement to bind. */
  private drained = false;
  /** Consecutive failed handoffs. Reset on the next successful one. */
  private consecutiveFailures = 0;
  /** Automatic (non-manual) reloads are refused until this time, post-failure. */
  private backoffUntil = 0;
  /**
   * Hash of a build parked by a close-out (0143). Never auto-reloaded — it
   * waits for the user to trigger POST /api/server/restart.
   */
  private buildAvailableHash: string | null = null;
  /** On-disk build timestamp of the parked build (dist/.build-info.json). */
  private buildAvailableAt: string | null = null;

  constructor(options: ReloadManagerOptions) {
    this.options = options;
    this.loadedHash = options.loadedHash;
  }

  get enabled(): boolean {
    return this.options.enabled !== false;
  }

  /** True while the manager is actively handing over to a replacement process. */
  get isReloading(): boolean {
    return this.reloading;
  }

  /**
   * The build parked by a close-out (0143), if any — hash plus its on-disk
   * build timestamp (dist/.build-info.json generatedAt). Exposed so /api/health
   * can report it and a (re)connecting UI can surface the "new build available"
   * notice without ever having seen the one-shot build.available SSE event.
   * Null while nothing is parked.
   */
  get buildAvailable(): { hash: string; buildAt: string | null } | null {
    return this.buildAvailableHash === null
      ? null
      : { hash: this.buildAvailableHash, buildAt: this.buildAvailableAt };
  }

  /** Begin watching dist/.build-info.json (fs.watch + fallback hash poll). */
  start(): void {
    if (!this.enabled) return;
    this.startWatching();
    this.pollTimer = setInterval(() => this.onPoll(), this.options.pollMs ?? DEFAULT_POLL_MS);
    this.pollTimer.unref?.();
  }

  /** Stop watching and cancel timers. Idempotent. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.fsWatcher) {
      try {
        this.fsWatcher.close();
      } catch {
        /* ignore */
      }
      this.fsWatcher = null;
    }
  }

  /**
   * Stale-boot self-heal: if a newer build landed while we were starting,
   * reload immediately (deferred while an agent runs). The replacement child
   * (REPOOS_RELOAD=1) skips this — it boots fresh on the current build.
   */
  bootSelfHeal(): void {
    if (this.stopped || !this.enabled) return;
    if (this.options.isReplacement) return;
    const current = readBuildHash(this.options.root);
    if (current !== null && this.loadedHash !== null && current !== this.loadedHash) {
      void this.requestReload("stale boot");
    }
  }

  /**
   * Public trigger used by the watcher, the boot self-heal, and
   * POST /api/server/restart. Fires the reload when stale and idle; defers
   * while an agent turn runs; reports not-stale when nothing is out of date.
   *
   * `manual` (POST /api/server/restart, a human explicitly asking) bypasses
   * the post-failure backoff below — automatic triggers (the poll, boot
   * self-heal) respect it so a run of failed handoffs doesn't retry every
   * ~5s forever (#0271 incident).
   */
  requestReload(reason: string, opts: { manual?: boolean } = {}): ReloadState {
    if (!this.enabled) return { state: "not-stale", reason: "auto-reload disabled" };
    if (this.stopped) return { state: "not-stale", reason: "server is shutting down" };
    if (this.reloading) return { state: "reloading", reason };
    const running = this.options.isBusy();
    if (!opts.manual && Date.now() < this.backoffUntil) {
      return {
        state: "deferred",
        running,
        reason: `backing off after ${this.consecutiveFailures} failed reload attempt(s) — retrying automatically at ${new Date(this.backoffUntil).toISOString()}, or POST /api/server/restart to retry now`,
      };
    }
    // Close-out deferral (0143): the close-out pipeline merges the branch and
    // runs build/screenshots/check, all of which would be killed if the server
    // reloaded itself mid-flight. Park the new build and surface it to the UI —
    // the user reloads when they choose (POST /api/server/restart).
    if (this.options.closingOut()) {
      const current = readBuildHash(this.options.root);
      if (this.loadedHash !== null && current !== null && current !== this.loadedHash) {
        this.parkBuild(current);
      }
      return { state: "deferred", running, reason };
    }
    // Agent-turn deferral removed (0214): in-flight agent children are now
    // durable — stdout/stderr writes to a per-task log file and the new server
    // re-attaches via adoptRunningAgents(). The restart proceeds immediately.
    const current = readBuildHash(this.options.root);
    if (this.loadedHash === null || current === null || current === this.loadedHash) {
      return { state: "not-stale", reason };
    }
    void this.reload(reason);
    return { state: "reloading", reason };
  }

  /**
   * The SSE event funnel calls this so a drained runner unblocks a deferred
   * reload. `review` events count: an agent review is a spawned turn too, and
   * one finishing can be what makes the server idle.
   */
  onEvent(e: { type: string }): void {
    if (e.type === "agent.exited" || e.type === "review") this.tryFirePending();
  }

  private onPoll(): void {
    if (this.stopped || this.reloading) return;
    const current = readBuildHash(this.options.root);
    if (current === null || this.loadedHash === null || current === this.loadedHash) return;
    // A close-out landed a new build on disk: park it for the user instead of
    // reloading under the pipeline that is orchestrating the close-out. This
    // runs even while a busy-deferral is armed — the park supersedes it.
    if (this.options.closingOut()) {
      this.parkBuild(current);
      return;
    }
    if (this.pending) return;
    // A build parked by a finished close-out is not auto-reloadable — only a
    // fresh hash beyond it (a normal dev build) triggers live reload.
    if (current === this.buildAvailableHash) return;
    void this.requestReload("build changed (poll)");
  }

  private tryFirePending(): void {
    if (!this.pending || this.reloading || this.stopped || this.options.isBusy() !== 0) return;
    // A close-out started while the reload was deferred: the build it produces
    // must wait for the user, not auto-fire on drain.
    if (this.options.closingOut()) {
      this.pending = false;
      this.clearRetry();
      const current = readBuildHash(this.options.root);
      if (current !== null && this.loadedHash !== null && current !== this.loadedHash) {
        this.parkBuild(current);
      }
      return;
    }
    this.pending = false;
    this.clearRetry();
    void this.reload("deferred reload: agents drained");
  }

  /**
   * Park a build that landed during a close-out: it is served only once the
   * user triggers a reload. Idempotent per hash. Supersedes any armed
   * busy-deferral so an eventual drain does not auto-fire it.
   */
  private parkBuild(hash: string): void {
    if (this.buildAvailableHash === hash) return;
    this.buildAvailableHash = hash;
    this.buildAvailableAt = readBuildAt(this.options.root);
    if (this.pending) {
      this.pending = false;
      this.clearRetry();
    }
    this.options.onBuildAvailable?.(hash);
  }

  private startWatching(): void {
    const dir = join(this.options.root, "dist");
    if (!existsSync(dir)) return;
    try {
      this.fsWatcher = watch(dir, (_event, filename) => {
        if (filename && filename.toString() !== ".build-info.json") return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          this.onPoll();
        }, WATCH_DEBOUNCE_MS);
      });
    } catch {
      // fs.watch unavailable on the platform — the hash poll covers us.
      this.fsWatcher = null;
    }
  }

  private async reload(reason: string): Promise<void> {
    if (this.reloading || this.stopped) return;
    this.reloading = true;
    this.pending = false;
    this.clearRetry();
    const entry = this.options.cliEntry();
    if (!entry) {
      this.reloading = false;
      this.log("reload: could not locate the repoos CLI — staying on this build");
      return;
    }
    const secret = randomBytes(16).toString("hex");
    this.childExited = false;
    this.drained = false;
    let child: ChildProcess;
    try {
      child = spawn(
        process.execPath,
        [entry, "serve", "--port", String(this.options.port), "--host", this.options.host],
        {
          cwd: this.options.root,
          // A replacement can start server-owned children (notably previews)
          // before a failed handover is detected. Give it its own process group
          // so failure cleanup can terminate that whole replacement tree rather
          // than leaving descendants alive under an otherwise-live ancestor.
          // Without this, the periodic orphan sweep cannot safely classify the
          // leftovers: their immediate parent is still alive.
          detached: process.platform !== "win32",
          // The replacement must inherit the durable streams of the process
          // supervisor (for example nohup's server.out). Pipes belong to this
          // old process; once it hands over and exits, a later console write
          // in the replacement can hit EPIPE and leave the control port down.
          stdio: ["ignore", "inherit", "inherit"],
          env: { ...process.env, REPOOS_RELOAD: "1", REPOOS_RELOAD_SECRET: secret },
        },
      );
    } catch (err) {
      this.reloading = false;
      this.log(`reload: could not spawn the replacement: ${(err as Error).message}`);
      return;
    }
    this.child = child;
    child.on("error", (err) => {
      this.childExited = true;
      this.log(`reload: replacement pid ${child.pid ?? "unknown"} spawn error: ${err.message}`);
    });
    child.on("exit", (code, signal) => {
      this.childExited = true;
      this.log(
        `reload: replacement pid ${child.pid ?? "unknown"} exited (code=${code ?? "null"}, signal=${signal ?? "none"})`,
      );
    });

    this.log(
      `reload: spawning replacement pid ${child.pid ?? "unknown"} on ${this.options.host}:${this.options.port} (${reason})`,
    );
    const confirmed = await this.waitForReplacement(secret);

    // #0096: a confirmed handshake is only trustworthy when the replacement
    // process is still alive at the moment of handover. If it died during the
    // sustained-health window or right at confirmation, we must NOT log
    // "replacement is up" or exit — we re-bind and keep serving instead.
    if (confirmed && !this.childExited && this.options.closingOut()) {
      // A close-out started while the replacement was warming up. Handing over
      // now would kill the server mid-pipeline (0143), so abort the reload:
      // kill the replacement, re-bind, and park the new build for the user.
      // `reloading` stays true until cleanup finishes — see the failure branch
      // below for why resetting it earlier is unsafe (#leak).
      await this.killChild();
      const rebound = await this.tryRebind();
      this.reloading = false;
      const current = readBuildHash(this.options.root);
      if (current !== null && this.loadedHash !== null && current !== this.loadedHash) {
        this.parkBuild(current);
      }
      this.log(
        `reload: handover aborted — close-out in progress${rebound === "bound" ? "" : ` — ${rebound} (server may be down)`}`,
      );
    } else if (confirmed && !this.childExited) {
      // A real handoff: whatever run of failures preceded it is over.
      this.consecutiveFailures = 0;
      this.backoffUntil = 0;
      this.stopped = true;
      child.unref?.();
      this.log(
        `reload: replacement is up on ${this.options.host}:${this.options.port} — handing over`,
      );
      await this.options.onReloadConfirmed();
    } else {
      // #leak: `reloading` must stay true for the whole cleanup, not just the
      // spawn+wait phase. Resetting it before killChild()/tryRebind() complete
      // reopens the reload() re-entry guard mid-cleanup — a poll tick or
      // fs.watch event firing in that window starts a NEW reload(), which
      // overwrites `this.child` with the new attempt before this failed
      // attempt's killChild() reads it. killChild() then kills the WRONG
      // (newer) child while the original failed replacement leaks forever,
      // unmanaged. Under load (many poll ticks racing a slow cleanup) this
      // fires repeatedly and accumulates orphaned `repoos serve` processes.
      await this.killChild();
      const rebound = await this.tryRebind();
      this.reloading = false;
      // Backoff (#0271 incident): a genuine failure to become ready — not a
      // close-out abort, that's handled in the branch above — arms a cooldown
      // so the next AUTOMATIC trigger (poll tick, boot self-heal) doesn't
      // retry in ~5s. Doubles per consecutive failure, capped at
      // BACKOFF_MAX_MS; a manual POST /api/server/restart still bypasses it.
      this.consecutiveFailures++;
      const backoffMs = Math.min(
        BACKOFF_BASE_MS * 2 ** (this.consecutiveFailures - 1),
        BACKOFF_MAX_MS,
      );
      this.backoffUntil = Date.now() + backoffMs;
      this.log(
        `reload: replacement failed to become ready${rebound === "bound" ? "" : ` — ${rebound} (server may be down)`}` +
          ` — backing off ${Math.round(backoffMs / 1000)}s (${this.consecutiveFailures} consecutive failure${this.consecutiveFailures === 1 ? "" : "s"})`,
      );
      this.options.onReloadFailed?.(
        rebound === "bound"
          ? "replacement did not become ready"
          : `replacement failed and ${rebound}`,
      );
    }
    this.child = null;
  }

  /**
   * Poll /api/health for the replacement's handshake until it answers or the
   * window closes. While the parent holds the port the replacement cannot bind
   * (no SO_REUSEPORT sharing on this platform), so after a short grace we
   * release our own listener — the drain window — and keep polling. Any answer
   * from the parent itself has no handshake, so a spurious self-poll never
   * confirms a replacement.
   *
   * A single handshake answer is NOT enough (#0096): the replacement must stay
   * healthy for the confirm window so a briefly-up-then-dying replacement is
   * treated as a failed reload — the parent re-binds and keeps serving rather
   * than handing over to a process that will leave the port listenerless.
   */
  private async waitForReplacement(secret: string): Promise<boolean> {
    const deadline = Date.now() + (this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);
    const graceUntil = Date.now() + (this.options.graceMs ?? DEFAULT_GRACE_MS);
    const confirmMs = this.options.confirmMs ?? DEFAULT_CONFIRM_MS;
    const url = `http://${this.options.host}:${this.options.port}/api/health?reload=${secret}`;
    let firstConfirmedAt = 0;
    while (Date.now() < deadline) {
      if (this.childExited) return false;
      const body = await probeJson(url);
      if (body && body.reloadHandshake === true) {
        if (firstConfirmedAt === 0) firstConfirmedAt = Date.now();
        if (Date.now() - firstConfirmedAt >= confirmMs) return true;
      }
      if (!this.drained && (body === null || Date.now() >= graceUntil)) {
        this.drained = true;
        await this.options.stopListening();
      }
      await sleep(RELOAD_POLL_MS);
    }
    return false;
  }

  private async killChild(): Promise<void> {
    const child = this.child;
    if (!child || this.childExited) return;
    const pid = child.pid;
    const killTree = (signal: NodeJS.Signals): void => {
      // A detached Unix child is the leader of a new process group. A negative
      // PID signals the group, including any previews it created while trying
      // to boot. Windows has no compatible process-group signal API, so retain
      // Node's direct-child behaviour there.
      if (process.platform !== "win32" && pid && pid > 0) {
        try {
          process.kill(-pid, signal);
          return;
        } catch {
          // The group may already be gone; direct signalling below preserves
          // the existing best-effort cleanup semantics.
        }
      }
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    };
    try {
      killTree("SIGTERM");
    } catch {
      return; // already gone
    }
    await sleep(400);
    try {
      child.kill(0);
    } catch {
      return; // exited on SIGTERM
    }
    try {
      killTree("SIGKILL");
    } catch {
      /* ignore */
    }
  }

  /**
   * Re-bind the listener after an aborted reload so the old process keeps
   * serving. Returns `"bound"` when the listener is back, or a reason string
   * describing why it could not be recovered.
   *
   * #0284: a bind attempt by an unrelated `repoos serve` landing in our drain
   * window can steal the port out from under us — we released the listener in
   * waitForReplacement, it grabbed it, and now we can never re-bind (each
   * attempt EADDRINUSEs). Distinguishing that from a transient failure lets
   * the old process surface a loud, actionable error instead of silently
   * looping as a listenerless zombie. We probe the port once the retry window
   * closes: if *something else* is listening there now, the port was stolen
   * rather than merely not-yet-freed.
   */
  private async tryRebind(): Promise<"bound" | string> {
    if (!this.drained) return "bound"; // we never released the listener
    const deadline = Date.now() + (this.options.rebindTimeoutMs ?? REBIND_TIMEOUT_MS);
    while (Date.now() < deadline) {
      try {
        await this.options.listen();
        return "bound";
      } catch {
        await sleep(200);
      }
    }
    const probeHost = this.options.host === "0.0.0.0" ? "127.0.0.1" : this.options.host;
    const stolen = await isPortListening(this.options.port, probeHost);
    return stolen
      ? `port ${this.options.port} was stolen by another process during the reload drain`
      : `could not re-bind port ${this.options.port} within ${this.options.rebindTimeoutMs ?? REBIND_TIMEOUT_MS}ms`;
  }

  private armRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(
      () => this.tryFirePending(),
      this.options.retryMs ?? DEFAULT_RETRY_MS,
    );
    this.retryTimer.unref?.();
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.clearRetry();
  }

  private log(msg: string): void {
    this.options.log?.(msg);
  }
}
