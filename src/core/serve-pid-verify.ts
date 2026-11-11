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

/** True when `pid` is a repoos serve for `root` (symlink-safe). */
export function verifyPidServesRepo(
  pid: number,
  root: string,
  execFile: typeof execFileSync = execFileSync,
): boolean {
  const cmdline = readProcessCommand(pid, execFile);
  if (!cmdline || !isOrphanServeCommand(cmdline)) return false;
  const serveRoot = parseServeRoot(cmdline);
  if (!serveRoot) return false;
  try {
    return canonicalRegistryRoot(serveRoot) === canonicalRegistryRoot(root);
  } catch {
    return false;
  }
}
