/**
 * Memory-pressure readings behind a tiny injectable probe (#0871).
 *
 * Load average alone is a poor pressure signal on a thrashing machine: threads
 * pile up waiting on swap while the CPU sits idle, and the number says nothing
 * about the cause. Paging activity, low reclaimable memory, macOS pressure
 * state and Linux PSI indicate the machine paying a memory cost. Swap use and
 * the macOS compressor pool are advisory occupancy signals. If the platform
 * has no usable memory signals, the caller falls back to load average.
 *
 * Every external command is optional and failure-tolerant: a missing tool must
 * degrade the signal, never break a start or a stats sample.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, loadavg, platform, totalmem } from "node:os";
import { availableMemBytes } from "./sysmem.js";

import type { MemoryPressureVmLevel } from "./memory-activity.js";

export interface MemoryStatsReadings {
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  compressorBytes: number | null;
  /** macOS `memory_pressure` free percentage (0–100), when the tool reports it. */
  memoryFreePercent: number | null;
  /** True when the platform probe returned a usable swap/compressor reading. */
  memoryStatsAvailable: boolean;
  /** Combined swap-in/out bytes per second over the activity window (#0918). */
  swapIoBytesPerSec?: number | null;
  pageoutBytesPerSec?: number | null;
  activityWindowSec?: number | null;
  /** macOS sysctl memory pressure level when sampled (#0918). */
  memoryPressureLevel?: MemoryPressureVmLevel | null;
  /** Linux PSI memory `avg10` (0–100), when `/proc/pressure/memory` exists. */
  psiMemoryAvg10?: number | null;
}

export interface MemoryReadings extends MemoryStatsReadings {
  loadPerCpu: number;
  availableMemRatio: number;
  totalMemBytes: number;
}

/** Injectable seam so tests use fake pressure inputs, never the real machine. */
export interface MemoryPressureProbe {
  read(): MemoryReadings;
}

export type MemoryCommandRunner = (cmd: string, args: string[]) => string | null;

export function runMemoryPressureCommand(cmd: string, args: string[]): string | null {
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

const UNIT_BYTES: Record<string, number> = {
  B: 1,
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4,
};

export function parseSwapUsage(output: string): { usedBytes: number; totalBytes: number } | null {
  const total = output.match(/total\s*=\s*([\d.]+)\s*([KMGTB])/i);
  const used = output.match(/used\s*=\s*([\d.]+)\s*([KMGTB])/i);
  if (!total || !used) return null;
  const totalBytes = Number(total[1]) * (UNIT_BYTES[total[2].toUpperCase()] ?? 1);
  const usedBytes = Number(used[1]) * (UNIT_BYTES[used[2].toUpperCase()] ?? 1);
  if (!Number.isFinite(totalBytes) || !Number.isFinite(usedBytes)) return null;
  return { totalBytes, usedBytes };
}

/** Bytes the macOS kernel holds in the compressed-memory pool. */
export function parseVmStatCompressor(output: string): number | null {
  const pageSize = Number(output.match(/page size of (\d+) bytes/)?.[1]) || 4096;
  const pages = output.match(/Pages occupied by compressor:\s+(\d+)\./)?.[1];
  if (pages === undefined) return null;
  return Number(pages) * pageSize;
}

export function parseMemoryPressureFreePercent(output: string): number | null {
  const m = output.match(/System-wide memory free percentage:\s*(\d+)%/i);
  if (!m) return null;
  const pct = Number(m[1]);
  return Number.isFinite(pct) ? pct : null;
}

/** Parse Linux `/proc/meminfo` swap counters, in bytes. */
export function parseLinuxSwap(meminfo: string): { usedBytes: number; totalBytes: number } | null {
  const totalKb = Number(meminfo.match(/^SwapTotal:\s+(\d+)\s+kB/m)?.[1] ?? NaN);
  const freeKb = Number(meminfo.match(/^SwapFree:\s+(\d+)\s+kB/m)?.[1] ?? NaN);
  if (!Number.isFinite(totalKb) || !Number.isFinite(freeKb)) return null;
  return {
    totalBytes: totalKb * 1024,
    usedBytes: Math.max(0, (totalKb - freeKb) * 1024),
  };
}

/**
 * Platform memory stats. Returns `memoryStatsAvailable: false` when the OS
 * gives no swap/compressor reading at all (not merely "swap total is zero"),
 * which is the caller's cue to fall back to load average.
 */
export function readPlatformMemoryStats(
  p: NodeJS.Platform = platform(),
  runCommand: MemoryCommandRunner = runMemoryPressureCommand,
): MemoryStatsReadings {
  if (p === "darwin") {
    const swap = runCommand("vm.swapusage", []);
    const swapParsed = swap ? parseSwapUsage(swap) : null;
    const vmStat = runCommand("vm_stat", []);
    const compressorBytes = vmStat ? parseVmStatCompressor(vmStat) : null;
    const pressure = runCommand("memory_pressure", ["-Q"]);
    const memoryFreePercent = pressure ? parseMemoryPressureFreePercent(pressure) : null;
    const available = Boolean(swapParsed) || compressorBytes !== null;
    return {
      swapTotalBytes: swapParsed?.totalBytes ?? null,
      swapUsedBytes: swapParsed?.usedBytes ?? null,
      compressorBytes,
      memoryFreePercent,
      memoryStatsAvailable: available,
    };
  }
  if (p === "linux") {
    let meminfo = "";
    try {
      meminfo = readFileSync("/proc/meminfo", "utf8");
    } catch {
      /* probe unavailable */
    }
    const swap = meminfo ? parseLinuxSwap(meminfo) : null;
    return {
      swapTotalBytes: swap?.totalBytes ?? null,
      swapUsedBytes: swap?.usedBytes ?? null,
      compressorBytes: null,
      memoryFreePercent: null,
      memoryStatsAvailable: Boolean(swap),
    };
  }
  return {
    swapTotalBytes: null,
    swapUsedBytes: null,
    compressorBytes: null,
    memoryFreePercent: null,
    memoryStatsAvailable: false,
  };
}

/** Real machine probe. Exported for composition, not for tests to call. */
export function systemMemoryPressureProbe(
  runCommand: MemoryCommandRunner = runMemoryPressureCommand,
): MemoryPressureProbe {
  return {
    read() {
      const totalMemBytes = totalmem();
      const cpuCount = Math.max(1, cpus().length);
      const load = loadavg()[0] ?? 0;
      const available = Math.max(availableMemBytes(), 0);
      return {
        ...readPlatformMemoryStats(platform(), runCommand),
        loadPerCpu: load / cpuCount,
        availableMemRatio: totalMemBytes > 0 ? available / totalMemBytes : 1,
        totalMemBytes,
      };
    },
  };
}

export function sampleMemoryReadings(
  probe?: MemoryPressureProbe,
  runCommand: MemoryCommandRunner = runMemoryPressureCommand,
): MemoryReadings {
  const r = (probe ?? systemMemoryPressureProbe(runCommand)).read();
  return {
    ...r,
    totalMemBytes: Math.max(0, r.totalMemBytes),
    loadPerCpu: Number.isFinite(r.loadPerCpu) ? Math.max(0, r.loadPerCpu) : 0,
    availableMemRatio: Number.isFinite(r.availableMemRatio)
      ? Math.min(1, Math.max(0, r.availableMemRatio))
      : 0,
  };
}
