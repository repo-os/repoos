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
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

export interface ServeLockInfo {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
}

/**
 * Manages a single lockfile that tracks the live serve process for a repo.
 * At startup, detects and reaps stale processes. Prevents port conflicts.
 * Skip cleanup when spawned as a reload replacement (REPOOS_RELOAD=1) so
 * the parent can exit gracefully through its close handler.
 */
export class ServeReaper {
  private readonly lockPath: string;
  private readonly pid = process.pid;

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

  constructor(repoRoot: string, cacheDir: string = ".repoos") {
    this.lockPath = join(repoRoot, cacheDir, "serve.lock");
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
   * Detect if a port is already bound by a live serve process.
   * Returns a human-readable error message if there's a conflict, null otherwise.
   */
  detectConflict(port: number, host: string): string | null {
    // Preview children bind distinct ephemeral ports; the control-plane
    // conflict check (which reads the shared per-worktree lockfile) does not
    // apply and can false-positive on a reused port (see `previewChild`).
    if (this.previewChild) return null;
    if (!existsSync(this.lockPath)) return null;

    let info: ServeLockInfo | null = null;
    try {
      info = JSON.parse(readFileSync(this.lockPath, "utf8")) as ServeLockInfo;
    } catch {
      return null; // Can't read the lockfile — assume no conflict
    }

    if (!info || info.port !== port || info.host !== host) return null;

    if (this.isProcessAlive(info.pid, port)) {
      return (
        `Port ${port} is already bound by another repoos serve process (PID ${info.pid} started at ${info.startedAt}). ` +
        `Use 'kill ${info.pid}' to stop it, or choose a different port with --port.`
      );
    }

    // Stale lockfile for this port — clean it up
    this.removeLock();
    return null;
  }

  /**
   * Register the current process as serving on the given port.
   * Call this after successful bind. Idempotent.
   */
  register(port: number, host: string): void {
    // Preview children don't own the control-plane lockfile; writing it would
    // collide with the worktree's other preview cycles (see `previewChild`).
    if (this.previewChild) return;
    try {
      mkdirSync(dirname(this.lockPath), { recursive: true });
      const info: ServeLockInfo = {
        pid: this.pid,
        port,
        host,
        startedAt: new Date().toISOString(),
      };
      writeFileSync(this.lockPath, JSON.stringify(info, null, 2));
    } catch {
      // Registration is best-effort — never crash the server
    }
  }

  /**
   * Unregister the current process. Call on shutdown.
   * Idempotent: unregistering when not registered is a no-op.
   */
  unregister(): void {
    this.removeLock();
  }

  // ---- internals ----

  private removeLock(): void {
    try {
      rmSync(this.lockPath, { force: true });
    } catch {
      /* ignore */
    }
  }

  private killProcess(pid: number): void {
    try {
      // Use process.kill() which is portable across Unix/Mac/Windows.
      // Send SIGTERM first (graceful), then SIGKILL if needed.
      process.kill(pid, "SIGTERM");
      // Brief grace period for SIGTERM
      setTimeout(() => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* ignore — process already gone */
        }
      }, 100);
    } catch {
      /* ignore — process may already be gone */
    }
  }
}
