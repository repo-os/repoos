/**
 * Memory facts the OS won't give you straight. `os.freemem()` counts only
 * fully-idle pages — on macOS that is near-zero at all times because the kernel
 * fills unused RAM with reclaimable cache and inactive pages. This module
 * reports the number that actually matters: how much the OS can hand back on
 * demand without swapping.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { freemem, platform } from "node:os";

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    });
  } catch {
    return null;
  }
}

/**
 * Bytes the OS can reclaim on demand without swapping:
 * free + inactive + speculative + purgeable (macOS, via `vm_stat`), or
 * `MemAvailable` (Linux, via `/proc/meminfo`). Falls back to `os.freemem()`
 * when the platform probe is unavailable or fails.
 */
export function availableMemBytes(): number {
  const p = platform();
  if (p === "darwin") {
    const out = run("vm_stat", []);
    if (out) {
      const pageSize = Number(out.match(/page size of (\d+) bytes/)?.[1]) || 4096;
      const pages = (label: string): number =>
        Number(out.match(new RegExp(`${label}:\\s+(\\d+)\\.`))?.[1]) || 0;
      const reclaimable =
        pages("Pages free") +
        pages("Pages inactive") +
        pages("Pages speculative") +
        pages("Pages purgeable");
      if (reclaimable > 0) return reclaimable * pageSize;
    }
  } else if (p === "linux") {
    try {
      const avail = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)\s+kB/m);
      if (avail) return Number(avail[1]) * 1024;
    } catch {
      /* fall through */
    }
  }
  return freemem();
}
