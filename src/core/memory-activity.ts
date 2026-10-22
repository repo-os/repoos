/**
 * Paging and swap *activity* behind the pressure guard (#0918).
 *
 * Occupancy ratios (swap used/total, compressor share) rise on idle macOS
 * laptops without cost until pages are touched. The guard blocks on sustained
 * swap I/O, pageout rates, low free-memory percentage, and Linux PSI — not on
 * quiet high occupancy alone.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";
import { parseMemoryPressureFreePercent } from "./memory-pressure.js";

export interface VmStatCounters {
  pageSize: number;
  pageouts: number;
  swapins: number;
  swapouts: number;
}

export interface LinuxVmstatCounters {
  pswpin: number;
  pswpout: number;
}

export interface MemoryActivitySample {
  atMs: number;
  pageSize: number;
  pageouts: number;
  swapins: number;
  swapouts: number;
}

export interface MemoryActivityRates {
  /** Combined swap-in and swap-out bytes per second over the window. */
  swapIoBytesPerSec: number | null;
  pageoutBytesPerSec: number | null;
  /** Seconds the rates cover; null when not enough samples yet. */
  windowSec: number | null;
}

export type MemoryPressureVmLevel = "normal" | "warn" | "critical";

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

/** macOS `vm_stat` swap and pageout counters (monotonic since boot). */
export function parseVmStatCounters(output: string): VmStatCounters | null {
  const pageSize = Number(output.match(/page size of (\d+) bytes/)?.[1]) || 4096;
  const counter = (labels: string[]): number | null => {
    for (const label of labels) {
      const raw = output.match(new RegExp(`${label}:\\s+(\\d+)\\.`, "i"))?.[1];
      if (raw !== undefined) return Number(raw);
    }
    return null;
  };
  const pageouts = counter(["Pageouts"]);
  const swapins = counter(["Swapins"]);
  const swapouts = counter(["Swapouts"]);
  if (pageouts === null && swapins === null && swapouts === null) return null;
  return {
    pageSize,
    pageouts: pageouts ?? 0,
    swapins: swapins ?? 0,
    swapouts: swapouts ?? 0,
  };
}

/** Linux `/proc/vmstat` swap page counters. */
export function parseLinuxVmstatCounters(content: string): LinuxVmstatCounters | null {
  const field = (name: string): number | null => {
    const raw = content.match(new RegExp(`^${name}\\s+(\\d+)`, "m"))?.[1];
    return raw === undefined ? null : Number(raw);
  };
  const pswpin = field("pswpin");
  const pswpout = field("pswpout");
  if (pswpin === null && pswpout === null) return null;
  return { pswpin: pswpin ?? 0, pswpout: pswpout ?? 0 };
}

/**
 * macOS `kern.memorystatus_vm_pressure_level` (1 normal, 2 warn, 4 critical).
 * Exported for tests with an injectable reader.
 */
export function parseDarwinMemoryPressureLevel(raw: string): MemoryPressureVmLevel | null {
  const level = Number(raw.trim());
  if (!Number.isFinite(level)) return null;
  if (level >= 4) return "critical";
  if (level >= 2) return "warn";
  if (level === 1) return "normal";
  return null;
}

/** Linux PSI memory `avg10` (0–100). */
export function parseLinuxPsiMemoryAvg10(content: string): number | null {
  const line = content.match(/^some\s+avg10=([\d.]+)/m)?.[1];
  if (!line) return null;
  const avg10 = Number(line);
  return Number.isFinite(avg10) ? avg10 : null;
}

export function activityRatesBetween(
  earlier: MemoryActivitySample,
  later: MemoryActivitySample,
): MemoryActivityRates {
  const deltaSec = (later.atMs - earlier.atMs) / 1000;
  if (deltaSec <= 0) {
    return { swapIoBytesPerSec: null, pageoutBytesPerSec: null, windowSec: null };
  }
  const pageSize = later.pageSize || earlier.pageSize;
  const swapPages =
    Math.max(0, later.swapins - earlier.swapins) + Math.max(0, later.swapouts - earlier.swapouts);
  const pageoutPages = Math.max(0, later.pageouts - earlier.pageouts);
  return {
    swapIoBytesPerSec: (swapPages * pageSize) / deltaSec,
    pageoutBytesPerSec: (pageoutPages * pageSize) / deltaSec,
    windowSec: deltaSec,
  };
}

/**
 * Keeps recent counter samples and returns rates over the configured window.
 * Injectable `now` and `readSample` keep tests deterministic.
 */
export class RollingMemoryActivityTracker {
  private samples: MemoryActivitySample[] = [];

  constructor(
    readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  record(sample: MemoryActivitySample): MemoryActivityRates {
    this.samples.push(sample);
    const cutoff = sample.atMs - this.windowMs;
    while (this.samples.length > 1 && this.samples[0]!.atMs < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length < 2) {
      return { swapIoBytesPerSec: null, pageoutBytesPerSec: null, windowSec: null };
    }
    const first = this.samples[0]!;
    const last = this.samples[this.samples.length - 1]!;
    const rates = activityRatesBetween(first, last);
    const spanMs = last.atMs - first.atMs;
    if (spanMs < this.windowMs * 0.5) {
      return { swapIoBytesPerSec: null, pageoutBytesPerSec: null, windowSec: null };
    }
    return rates;
  }

  reset(): void {
    this.samples = [];
  }
}

export interface PlatformActivityReadings {
  swapIoBytesPerSec: number | null;
  pageoutBytesPerSec: number | null;
  activityWindowSec: number | null;
  memoryFreePercent: number | null;
  memoryPressureLevel: MemoryPressureVmLevel | null;
  psiMemoryAvg10: number | null;
}

const defaultTrackers = new Map<number, RollingMemoryActivityTracker>();

function trackerForWindow(windowMs: number): RollingMemoryActivityTracker {
  let tracker = defaultTrackers.get(windowMs);
  if (!tracker) {
    tracker = new RollingMemoryActivityTracker(windowMs);
    defaultTrackers.set(windowMs, tracker);
  }
  return tracker;
}

/** Read paging activity on this machine (stateful rolling window). */
export function readPlatformMemoryActivity(
  windowSec: number,
  deps: {
    platform?: NodeJS.Platform;
    runCommand?: (cmd: string, args: string[]) => string | null;
    readFile?: (path: string) => string;
    tracker?: RollingMemoryActivityTracker;
    now?: () => number;
  } = {},
): PlatformActivityReadings {
  const p = deps.platform ?? platform();
  const runCommand = deps.runCommand ?? run;
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const windowMs = Math.max(5, windowSec) * 1000;
  const tracker = deps.tracker ?? trackerForWindow(windowMs);
  const now = deps.now ?? (() => Date.now());

  let memoryFreePercent: number | null = null;
  let memoryPressureLevel: MemoryPressureVmLevel | null = null;
  let psiMemoryAvg10: number | null = null;
  let rates: MemoryActivityRates = {
    swapIoBytesPerSec: null,
    pageoutBytesPerSec: null,
    windowSec: null,
  };

  if (p === "darwin") {
    const vmStat = runCommand("vm_stat", []);
    const counters = vmStat ? parseVmStatCounters(vmStat) : null;
    if (counters) {
      rates = tracker.record({
        atMs: now(),
        pageSize: counters.pageSize,
        pageouts: counters.pageouts,
        swapins: counters.swapins,
        swapouts: counters.swapouts,
      });
    }
    const pressureQ = runCommand("memory_pressure", ["-Q"]);
    memoryFreePercent = pressureQ ? parseMemoryPressureFreePercent(pressureQ) : null;
    const levelRaw = runCommand("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]);
    memoryPressureLevel = levelRaw ? parseDarwinMemoryPressureLevel(levelRaw) : null;
  } else if (p === "linux") {
    let vmstat = "";
    try {
      vmstat = readFile("/proc/vmstat");
    } catch {
      /* unavailable */
    }
    const counters = vmstat ? parseLinuxVmstatCounters(vmstat) : null;
    if (counters) {
      const pageSizeRaw = runCommand("getconf", ["PAGESIZE"]);
      const pageSize = Number(pageSizeRaw?.trim()) || 4096;
      rates = tracker.record({
        atMs: now(),
        pageSize,
        pageouts: 0,
        swapins: counters.pswpin,
        swapouts: counters.pswpout,
      });
    }
    try {
      psiMemoryAvg10 = parseLinuxPsiMemoryAvg10(readFile("/proc/pressure/memory"));
    } catch {
      /* PSI optional */
    }
  }

  return {
    swapIoBytesPerSec: rates.swapIoBytesPerSec,
    pageoutBytesPerSec: rates.pageoutBytesPerSec,
    activityWindowSec: rates.windowSec,
    memoryFreePercent,
    memoryPressureLevel,
    psiMemoryAvg10,
  };
}

/** Test helper: reset the process-wide default tracker between cases. */
export function resetDefaultActivityTracker(): void {
  for (const tracker of defaultTrackers.values()) tracker.reset();
  defaultTrackers.clear();
}
