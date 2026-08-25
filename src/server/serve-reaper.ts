/**
 * Reap stale and orphaned repoos serve processes (task 0168).
 *
 * Manages a single lockfile under `.repoos/serve.lock` that tracks the PID of
 * the serve process serving a given port. On startup, stale processes are
 * detected and reaped. Port binding conflicts are detected before any bind
 * attempt so serve refuses to coexist silently with a live server.
 *
 * Windows limitation: process alive-check is best-effort (kill -0 support
 * varies). The reaper is primarily for Unix/Mac. On Windows, rely on the
 * OS to reject EADDRINUSE if a port is already bound.
 *
 * Zero runtime deps: node:fs / node:child_process / node:path only.
 */
import { existsSync, realpathSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { execFile, execSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import net from "node:net";

export interface ServeLockInfo {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
}

/** Concurrency cap for the boot-time orphan sweep's per-process cwd lookups. */
const ORPHAN_SWEEP_CONCURRENCY = 16;
/** Consecutive missing-root checks before a serve process closes itself. */
const WATCH_MISSES_REQUIRED = 3;

/**
 * Manages a single lockfile that tracks the live serve process for a repo.
 * At startup, detects and reaps stale processes. Prevents port conflicts.
 * Skip cleanup when spawned as a reload replacement (REPOOS_RELOAD=1) so
 * the parent can exit gracefully through its close handler.
 */
export class ServeReaper {
  private readonly lockPath: string;
  private readonly pid = process.pid;
  private readonly repoRoot: string;
  /** Ephemeral test/harness servers must never touch the control-plane lock. */
  private readonly enabled: boolean;
  private registered = false;
  private rootWatch: ReturnType<typeof setInterval> | null = null;

  /**
   * A preview child (`repoos serve --port <ephemeral>` rooted at a task
   * worktree) is NOT the control-plane server, so the single-per-repo serve
   * lockfile and its stale-reaping/conflict logic don't apply to it. If it ran
   * `cleanupStale`, it would reap whatever sibling preview happens to be in the
   * worktree's lockfile (killing a booting preview mid-health-check → "did not
   * become ready"), and because ephemeral ports can be reused, `detectConflict`
   * could even refuse to bind a port that is already stale in the lockfile.
   * Disable the reaper entirely for preview children (#0183).
   */
  private readonly previewChild = process.env.REPOOS_PREVIEW_CHILD === "1";

  constructor(repoRoot: string, cacheDir: string = ".repoos", enabled: boolean = true) {
    this.repoRoot = repoRoot;
    this.lockPath = join(repoRoot, cacheDir, "serve.lock");
    this.enabled = enabled;
  }

  /**
   * Close this server when the checkout it serves disappears.  Fixture and
   * preview roots are frequently removed before their child process receives
   * its normal shutdown signal; a lockfile inside that deleted root can no
   * longer help a later startup reap it.  The watch is deliberately owned by
   * the server process, so it also covers standalone fixture `serve` calls.
   *
   * A real repo root can be momentarily invisible (a rename while the dir is
   * moved, a network-FS blip) without being gone — tearing the server down on
   * such a transient miss would kill the live control plane.  The root must
   * be missing for `missesRequired` consecutive checks before `onMissing`
   * fires; a deleted fixture/preview root stays gone, so this only delays the
   * self-close by `missesRequired × intervalMs`.
   */
  watchRoot(
    onMissing: () => void,
    intervalMs = 1_000,
    missesRequired = WATCH_MISSES_REQUIRED,
  ): () => void {
    this.stopWatchingRoot();
    let misses = 0;
    const check = (): void => {
      if (existsSync(this.repoRoot)) {
        misses = 0;
        return;
      }
      misses += 1;
      if (misses < missesRequired) return;
      this.stopWatchingRoot();
      onMissing();
    };
    this.rootWatch = setInterval(check, intervalMs);
    this.rootWatch.unref?.();
    return () => this.stopWatchingRoot();
  }

  /**
   * Check if a process with the given PID is still running and matches our
   * expected serve characteristics (the repoos CLI binary in the command line).
   * On Windows, the check is limited to existence (kill -0).
   */
  private isProcessAlive(pid: number, port: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;

    // For the current process, trust it's valid without checking
    if (pid === this.pid) return true;

    try {
      // Check if process exists (works on Unix and Windows)
      execSync(`kill -0 ${pid}`, { stdio: "ignore", timeout: 2000 });
    } catch {
      return false;
    }

    // On Windows, we can only verify existence, not the cmdline. Return true.
    if (process.platform === "win32") return true;

    // On Unix/Mac, verify it's a repoos serve process on the expected port
    try {
      const cmdline = execSync(`ps -p ${pid} -o command=`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      });
      return cmdline.includes("serve") && cmdline.includes(`--port ${port}`);
    } catch {
      return false;
    }
  }

  /**
   * Boot-time cleanup: detect and reap stale processes from the lockfile.
   * SKIPPED when spawned as a reload replacement (REPOOS_RELOAD=1) so the
   * parent process can exit gracefully without being killed mid-shutdown.
   * This is safe to call multiple times and always succeeds (best-effort).
   */
  cleanupStale(): void {
    if (!this.enabled) return;
    // A preview child must never reap other processes (see `previewChild`).
    if (this.previewChild) return;
    // Skip cleanup when spawned as a reload replacement — the parent process
    // is still running and will shut down gracefully. Killing it here would
    // bypass previews.stopAll() and runner.flushAll(), orphaning children.
    if (process.env.REPOOS_RELOAD === "1") return;

    if (!existsSync(this.lockPath)) return;

    let old: ServeLockInfo | null = null;
    try {
      old = JSON.parse(readFileSync(this.lockPath, "utf8")) as ServeLockInfo;
    } catch {
      // Corrupt lockfile — drop it
      this.removeLock();
      return;
    }

    if (!old || typeof old.pid !== "number" || typeof old.port !== "number") {
      this.removeLock();
      return;
    }

    // If the lockfile claims our own PID, it's stale from a prior launchd run
    // that recycled this PID — don't kill ourselves.
    if (old.pid === this.pid) {
      this.removeLock();
      return;
    }

    // If there's a stale process, try to reap it
    if (!this.isProcessAlive(old.pid, old.port)) {
      this.removeLock();
      return;
    }

    // Process is still running. Try to kill it since it's stale
    this.killProcess(old.pid);
    this.removeLock();
  }

  /**
   * Reap historical fixture/preview servers whose deleted root also took their
   * lockfile with it.  This is intentionally narrower than a generic process
   * sweep: it requires the RepoOS CLI's `serve` command shape AND a cwd under
   * the system temp dir that no longer exists — the exact shape of every
   * observed orphan (`/var/folders/.../repoos-release-*`, `.../repoos-autoprev-*`).
   * A user's live control plane, every healthy preview, and a sibling project
   * that happens to be briefly unmounted or renamed therefore remain untouched
   * (a real repo never lives under tmpdir).
   *
   * Async and best-effort so a boot full of accumulated orphans can never
   * block serve startup: the `ps` scan and the per-process `lsof` cwd lookups
   * run off the event loop, with the lookups capped in flight.  Returns the
   * number of processes killed.
   */
  async cleanupOrphanedRoots(): Promise<number> {
    if (!this.enabled) return 0;
    if (process.platform === "win32") return 0;
    let rows: string;
    try {
      rows = await execFileAsync("ps", ["-axo", "pid=,command="], 4_000);
    } catch {
      return 0;
    }
    const candidates: number[] = [];
    for (const row of rows.split("\n")) {
      const match = row.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const command = match[2];
      if (pid === this.pid || !isOrphanServeCommand(command)) continue;
      candidates.push(pid);
    }
    if (candidates.length === 0) return 0;
    let reaped = 0;
    await runBounded(candidates, ORPHAN_SWEEP_CONCURRENCY, async (pid) => {
      const cwd = await this.processCwdAsync(pid);
      if (!cwd || !isOrphanRoot(cwd)) return;
      // PID-recycling guard: the command-shape scan ran at sweep start, so a
      // PID could have been reused by an unrelated process in the interim.
      // Never signal a PID that no longer names a serve process at kill time.
      const command = await this.commandOf(pid);
      if (!command || !isOrphanServeCommand(command)) return;
      this.killProcess(pid);
      reaped += 1;
    });
    return reaped;
  }

  /**
   * Detect if a port is already bound by a live serve process.
   * Returns a human-readable error message if there's a conflict, null otherwise.
   *
   * Two independent signals are consulted:
   *   1. The live port probe (new): is *something* actually listening? Consulted
   *      first so a missing/stale/corrupt lockfile can no longer mask a live
   *      listener — the single source of truth for "is the port taken" is the
   *      port itself, not the lockfile (#0284).
   *   2. The lockfile (existing): when it names a live process for this exact
   *      port/host, that yields the most specific conflict (PID + start time).
   *
   * The probe matters because binding a port a lockfile-less-but-live process
   * owns would otherwise either EADDRINUSE with a confusing error or, worse,
   * silently steal a port mid-drain during another process's reload.
   */
  async detectConflict(port: number, host: string): Promise<string | null> {
    if (!this.enabled) return null;
    // Preview children bind distinct ephemeral ports; the control-plane
    // conflict check (which reads the shared per-worktree lockfile) does not
    // apply and can false-positive on a reused port (see `previewChild`).
    if (this.previewChild) return null;

    // "0.0.0.0" is a valid bind address but not a connectable one — probe the
    // loopback interface instead. Ephemeral (port 0) means "pick a free port",
    // so there is never a listener to probe.
    const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    const listening = port !== 0 ? await isPortListening(port, probeHost) : false;

    let info: ServeLockInfo | null = null;
    if (existsSync(this.lockPath)) {
      try {
        info = JSON.parse(readFileSync(this.lockPath, "utf8")) as ServeLockInfo;
      } catch {
        info = null; // corrupt — fall through to the probe result
      }
    }

    // A lockfile that names a live process for this exact port/host is the most
    // specific conflict: we can point the user at the offending PID.
    if (info && info.port === port && info.host === host && this.isProcessAlive(info.pid, port)) {
      return (
        `Port ${port} is already bound by another repoos serve process (PID ${info.pid} started at ${info.startedAt}). ` +
        `Use 'kill ${info.pid}' to stop it, or choose a different port with --port.`
      );
    }

    // A lockfile that exists for this exact port/host but names a dead process
    // is stale — clear it so a later startup (and our own register below)
    // starts from a clean slate. Only when the process is actually gone.
    if (info && info.port === port && info.host === host) {
      this.removeLock();
    }

    // A live listener the (missing/stale/corrupt) lockfile doesn't explain is
    // still a conflict: binding would either EADDRINUSE or steal a port some
    // live process — possibly another serve — already holds (#0284).
    if (listening) {
      return (
        `Port ${port} is already in use by a live process on ${probeHost}, but the serve lockfile is missing or stale. ` +
        `Refusing to bind rather than steal a port a live process owns — choose a different port with --port.`
      );
    }

    return null;
  }

  /**
   * Register the current process as serving on the given port.
   * Call this after successful bind. Idempotent.
   */
  register(port: number, host: string): void {
    // Preview children don't own the control-plane lockfile; writing it would
    // collide with the worktree's other preview cycles (see `previewChild`).
    if (!this.enabled || this.previewChild) return;
    try {
      mkdirSync(dirname(this.lockPath), { recursive: true });
      const info: ServeLockInfo = {
        pid: this.pid,
        port,
        host,
        startedAt: new Date().toISOString(),
      };
      writeFileSync(this.lockPath, JSON.stringify(info, null, 2));
      this.registered = true;
    } catch {
      // Registration is best-effort — never crash the server
    }
  }

  /**
   * Unregister the current process. Call on shutdown.
   * Idempotent: unregistering when not registered is a no-op.
   */
  unregister(): void {
    this.stopWatchingRoot();
    // An ephemeral server used the same repo root but never registered itself;
    // it must not delete the long-lived control plane's lock on close.
    if (!this.registered) return;
    this.removeLock();
    this.registered = false;
  }

  // ---- internals ----

  private removeLock(): void {
    try {
      rmSync(this.lockPath, { force: true });
    } catch {
      /* ignore */
    }
  }

  private stopWatchingRoot(): void {
    if (this.rootWatch === null) return;
    clearInterval(this.rootWatch);
    this.rootWatch = null;
  }

  /** Read a process cwd from lsof's machine-readable output, best-effort. */
  private async processCwdAsync(pid: number): Promise<string | null> {
    try {
      const out = await execFileAsync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], 2_000);
      const line = out.split("\n").find((entry) => entry.startsWith("n"));
      const cwd = line?.slice(1) || null;
      // macOS lsof suffixes a deleted cwd with " (deleted)" — exactly the case
      // the orphan sweep looks for, so strip it before the root checks.
      return cwd ? cwd.replace(/ \(deleted\)$/, "") : null;
    } catch {
      return null;
    }
  }

  /** The command line of `pid`, or null when the process is already gone. */
  private async commandOf(pid: number): Promise<string | null> {
    try {
      const out = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], 2_000);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  private killProcess(pid: number): void {
    try {
      // Use process.kill() which is portable across Unix/Mac/Windows.
      // Send SIGTERM first (graceful), then SIGKILL only if the process is
      // still alive at the deadline. Never SIGKILL a PID that exited in the
      // grace window — an unrelated process may have recycled it (#0216).
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore — process may already be gone */
      return;
    }
    setTimeout(() => {
      try {
        process.kill(pid, 0); // existence probe — throws ESRCH when gone
        process.kill(pid, "SIGKILL");
      } catch {
        /* ignore — already exited; do not SIGKILL a possibly-recycled PID */
      }
    }, 100);
  }
}

/**
 * True when a TCP connection can be established to host:port — i.e. some
 * process is actually listening there. This is the ground truth for "is the
 * port taken", consulted alongside the lockfile so a missing/stale/corrupt
 * lockfile can't mask a live listener (#0284). Best-effort and async: any
 * connect error (connection refused, timeout, unroutable host) resolves false,
 * and an invalid port resolves false immediately.
 */
export function isPortListening(port: number, host: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      resolve(false);
      return;
    }
    const socket = net.connect({ port, host });
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * True when a process command line has the RepoOS CLI `serve` shape — the
 * compiled `.../cli/index.js serve` or dev `.../src/cli/index.ts serve`.  The
 * orphan sweep requires this shape in addition to a deleted temp-dir root, so
 * unrelated processes are never touched.
 */
export function isOrphanServeCommand(command: string): boolean {
  return /cli[/\\]index\.(?:js|ts)/.test(command) && /\sserve(?:\s|$)/.test(command);
}

let cachedTempDirs: string[] | null = null;

/**
 * The system temp dir and its real path.  macOS exposes `/var` as a symlink
 * to `/private/var`, and lsof reports the resolved path, so both forms are
 * kept and compared.
 */
function systemTempDirs(): string[] {
  if (cachedTempDirs) return cachedTempDirs;
  const raw = tmpdir();
  const dirs = new Set([raw]);
  try {
    dirs.add(realpathSync(raw));
  } catch {
    /* the temp dir always exists */
  }
  cachedTempDirs = [...dirs];
  return cachedTempDirs;
}

/** True when `cwd` is at or under the system temp dir. */
function isUnderSystemTempDir(cwd: string): boolean {
  return systemTempDirs().some((d) => cwd === d || cwd.startsWith(d + sep));
}

/**
 * True when `cwd` is a deleted root under the system temp dir — the exact
 * shape of every observed orphan (fixture/preview temp dirs).  A real repo —
 * the live control plane, a preview worktree, any sibling project — never
 * lives under tmpdir, so a briefly-unmounted or renamed repo cannot be
 * mistaken for an orphan and killed.  Exported for testing.
 */
export function isOrphanRoot(cwd: string): boolean {
  if (existsSync(cwd)) return false;
  return isUnderSystemTempDir(cwd);
}

/** `execFile` promisified for the boot-time orphan sweep. */
function execFileAsync(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "utf8", timeout: timeoutMs }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** Run `fn` over `items` with at most `concurrency` promises in flight. */
async function runBounded<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      await fn(next);
    }
  });
  await Promise.all(workers);
}
