/**
 * Confirm a PID is this repo's `repoos serve` before `repoos restart` signals it.
 */
import { execFileSync } from "node:child_process";
import { isOrphanServeCommand } from "../server/serve-reaper.js";
import { parseServeRoot } from "../server/system.js";
import { canonicalRegistryRoot } from "./server-registry.js";

export function readProcessCommand(
  pid: number,
  execFile: typeof execFileSync = execFileSync,
): string | null {
  if (process.platform === "win32") return null;
  try {
    const cmdline = execFile("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return cmdline || null;
  } catch {
    return null;
  }
}

/** Process start time (ms since epoch) from `ps -o lstart=`, or null. */
export function readProcessStartMs(
  pid: number,
  execFile: typeof execFileSync = execFileSync,
): number | null {
  if (process.platform === "win32") return null;
  try {
    const out = execFile("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const t = Date.parse(out);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/** Slack between a process starting and its server writing the lock. */
const LOCK_START_SLACK_MS = 120_000;

/**
 * True when `pid` is a repoos serve for `root` (symlink-safe).
 *
 * The command line proves it when its root can be parsed (`…/dist/cli/index.js`).
 * An installed RepoOS (`…/node_modules/repoos/dist/cli/index.js`) or a bare
 * `repoos serve` shim yields the install dir, or nothing, so the lock this
 * repo's own cache dir holds is the ownership proof instead: pass its
 * `startedAt` and the pid is accepted when it is a `serve` process that began
 * no later than the lock was written (a recycled pid starts after the lock).
 */
export function verifyPidServesRepo(
  pid: number,
  root: string,
  execFile: typeof execFileSync = execFileSync,
  lockStartedAt?: string | null,
): boolean {
  const cmdline = readProcessCommand(pid, execFile);
  if (!cmdline) return false;
  if (isOrphanServeCommand(cmdline)) {
    const serveRoot = parseServeRoot(cmdline);
    if (serveRoot) {
      try {
        if (canonicalRegistryRoot(serveRoot) === canonicalRegistryRoot(root)) return true;
      } catch {
        /* fall through to the lock proof */
      }
    }
  }
  if (!lockStartedAt || !/\bserve\b/.test(cmdline)) return false;
  const lockMs = Date.parse(lockStartedAt);
  const startMs = readProcessStartMs(pid, execFile);
  if (!Number.isFinite(lockMs) || startMs === null) return false;
  return startMs <= lockMs + LOCK_START_SLACK_MS;
}
