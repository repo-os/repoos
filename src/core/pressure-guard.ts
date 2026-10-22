/**
 * Pressure guard (#0836, #0871, #0918).
 *
 * The guard holds new work when the machine is paying a memory cost: sustained
 * swap I/O or pageout rates, low reclaimable memory, macOS memory-pressure
 * warnings, or Linux PSI — not merely high but quiet swap/compressor occupancy.
 * Load average is only a fallback when memory readings are unavailable.
 *
 * Running engineers are never killed. The guard only defers *starts* and
 * browser steps, with a reason the UI and queue markers can show.
 */
import type { RepoOSConfig } from "./types.js";
import { readPlatformMemoryActivity } from "./memory-activity.js";
import {
  pressureActivityWindowSec,
  pressureGuardEnabled,
  pressureMaxCompressorRatio,
  pressureMaxLoadPerCpu,
  pressureMaxPageoutBytesPerSec,
  pressureMaxPsiMemoryAvg10,
  pressureMaxSwapIoBytesPerSec,
  pressureMaxSwapUsedRatio,
  pressureMinAvailableMemRatio,
  pressureMinMemoryFreePercent,
} from "./resource-limits.js";
import {
  sampleMemoryReadings,
  type MemoryPressureProbe,
  type MemoryReadings,
} from "./memory-pressure.js";

export type PressureLevel = "normal" | "warning" | "critical";

export interface PressureSnapshot {
  level: PressureLevel;
  /** Reclaimable memory as a fraction of RAM. */
  availableMemRatio: number;
  loadPerCpu: number;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  swapUsedRatio: number | null;
  compressorBytes: number | null;
  /** Compressor pool as a fraction of total RAM. */
  compressorRatio: number | null;
  memoryFreePercent: number | null;
  totalMemBytes: number;
  swapIoBytesPerSec: number | null;
  pageoutBytesPerSec: number | null;
  activityWindowSec: number | null;
  psiMemoryAvg10: number | null;
  /** `memory` when swap/compressor readings drove the verdict, else `load`. */
  source: "memory" | "load";
  /** Critical reasons only — non-empty means new work is held. */
  reasons: string[];
  /** Advisory conditions that do not hold work (e.g. load high, memory fine). */
  warnings: string[];
  /** The critical reason joined for display; null when work may proceed. */
  reason: string | null;
}

export interface PressureThresholds {
  maxLoadPerCpu: number;
  minAvailableMemRatio: number;
  maxSwapUsedRatio: number;
  maxCompressorRatio: number;
  activityWindowSec: number;
  maxSwapIoBytesPerSec: number;
  maxPageoutBytesPerSec: number;
  minMemoryFreePercent: number;
  maxPsiMemoryAvg10: number;
}

/** Near a threshold (75% of the way) is worth surfacing before it bites. */
const WARNING_FACTOR = 0.75;

const ACTIVITY_DIAG =
  "Check Activity Monitor (Memory tab), `vm_stat 1`, or `memory_pressure -Q` on macOS; " +
  "`/proc/pressure/memory` and `vmstat 1` on Linux.";

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes.toFixed(0)} B`;
}

function fmtBytesPerSec(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec)}/s`;
}

function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function pressureThresholds(config?: RepoOSConfig): PressureThresholds {
  return {
    maxLoadPerCpu: config ? pressureMaxLoadPerCpu(config) : 4,
    minAvailableMemRatio: config ? pressureMinAvailableMemRatio(config) : 0.08,
    maxSwapUsedRatio: config ? pressureMaxSwapUsedRatio(config) : 0.5,
    maxCompressorRatio: config ? pressureMaxCompressorRatio(config) : 0.35,
    activityWindowSec: config ? pressureActivityWindowSec(config) : 30,
    maxSwapIoBytesPerSec: config ? pressureMaxSwapIoBytesPerSec(config) : 1024 * 1024,
    maxPageoutBytesPerSec: config ? pressureMaxPageoutBytesPerSec(config) : 256 * 1024,
    minMemoryFreePercent: config ? pressureMinMemoryFreePercent(config) : 10,
    maxPsiMemoryAvg10: config ? pressureMaxPsiMemoryAvg10(config) : 25,
  };
}

/** True when the caller gave us (or the probe reported) real memory signals. */
function hasMemorySignals(sample: Partial<PressureSnapshot> & Partial<MemoryReadings>): boolean {
  if (typeof sample.memoryStatsAvailable === "boolean") return sample.memoryStatsAvailable;
  if (sample.swapUsedBytes !== undefined && sample.swapUsedBytes !== null) return true;
  if (sample.swapTotalBytes !== undefined && sample.swapTotalBytes !== null) return true;
  if (sample.compressorBytes !== undefined && sample.compressorBytes !== null) return true;
  if (sample.swapUsedRatio !== undefined && sample.swapUsedRatio !== null) return true;
  if (sample.compressorRatio !== undefined && sample.compressorRatio !== null) return true;
  return false;
}

function ratioOf(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(1, used / total));
}

function activityWindowLabel(windowSec: number | null | undefined, fallback: number): string {
  const sec = windowSec ?? fallback;
  return `${sec} s`;
}

/**
 * Pure verdict from a reading set. Exported so the guard, the stats panel and
 * tests all evaluate the same thresholds.
 */
export function evaluatePressure(
  sample: Partial<MemoryReadings> & Partial<PressureSnapshot>,
  thresholds: PressureThresholds = pressureThresholds(),
): PressureSnapshot {
  const totalMemBytes = sample.totalMemBytes ?? 0;
  const availableMemRatio = sample.availableMemRatio ?? 1;
  const loadPerCpu = sample.loadPerCpu ?? 0;
  const swapTotalBytes = sample.swapTotalBytes ?? null;
  const swapUsedBytes = sample.swapUsedBytes ?? null;
  const compressorBytes = sample.compressorBytes ?? null;
  const swapUsedRatio = sample.swapUsedRatio ?? ratioOf(swapUsedBytes, swapTotalBytes);
  const compressorRatio =
    sample.compressorRatio ??
    (compressorBytes !== null && totalMemBytes > 0 ? compressorBytes / totalMemBytes : null);
  const memoryStatsAvailable = hasMemorySignals(sample);
  const source: "memory" | "load" = memoryStatsAvailable ? "memory" : "load";
  const memoryFreePercent = sample.memoryFreePercent ?? null;
  const swapIoBytesPerSec = sample.swapIoBytesPerSec ?? null;
  const pageoutBytesPerSec = sample.pageoutBytesPerSec ?? null;
  const activityWindowSec = sample.activityWindowSec ?? null;
  const psiMemoryAvg10 = sample.psiMemoryAvg10 ?? null;
  const memoryPressureLevel = sample.memoryPressureLevel ?? null;

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (availableMemRatio < thresholds.minAvailableMemRatio) {
    reasons.push(
      `available memory is low (${fmtPct(availableMemRatio)} of RAM, need at least ` +
        `${fmtPct(thresholds.minAvailableMemRatio)}) — waiting for memory to free up before starting more work`,
    );
  } else if (availableMemRatio < thresholds.minAvailableMemRatio / WARNING_FACTOR) {
    warnings.push(
      `available memory is getting tight (${fmtPct(availableMemRatio)} of RAM, ` +
        `limit ${fmtPct(thresholds.minAvailableMemRatio)})`,
    );
  }

  if (memoryFreePercent !== null && memoryFreePercent < thresholds.minMemoryFreePercent) {
    reasons.push(
      `system-wide free memory is ${memoryFreePercent}% (below ${thresholds.minMemoryFreePercent}%) — ` +
        `holding new work until memory pressure eases. ${ACTIVITY_DIAG}`,
    );
  }

  if (memoryPressureLevel === "warn" || memoryPressureLevel === "critical") {
    warnings.push(`memory_pressure level is ${memoryPressureLevel}`);
  }

  if (psiMemoryAvg10 !== null && psiMemoryAvg10 > thresholds.maxPsiMemoryAvg10) {
    reasons.push(
      `Linux PSI memory pressure avg10 is ${psiMemoryAvg10.toFixed(1)}% (limit ` +
        `${thresholds.maxPsiMemoryAvg10}%) — holding new work until memory pressure eases`,
    );
  }

  const windowLabel = activityWindowLabel(activityWindowSec, thresholds.activityWindowSec);

  if (swapIoBytesPerSec !== null && swapIoBytesPerSec >= thresholds.maxSwapIoBytesPerSec) {
    reasons.push(
      `swap in/out ${fmtBytesPerSec(swapIoBytesPerSec)} over ${windowLabel} (limit ` +
        `${fmtBytesPerSec(thresholds.maxSwapIoBytesPerSec)}) — holding new work until paging eases. ${ACTIVITY_DIAG}`,
    );
  } else if (
    swapIoBytesPerSec !== null &&
    swapIoBytesPerSec >= thresholds.maxSwapIoBytesPerSec * WARNING_FACTOR
  ) {
    warnings.push(
      `swap I/O is elevated (${fmtBytesPerSec(swapIoBytesPerSec)} over ${windowLabel})`,
    );
  }

  if (pageoutBytesPerSec !== null && pageoutBytesPerSec >= thresholds.maxPageoutBytesPerSec) {
    reasons.push(
      `pageouts ${fmtBytesPerSec(pageoutBytesPerSec)} over ${windowLabel} (limit ` +
        `${fmtBytesPerSec(thresholds.maxPageoutBytesPerSec)}) — holding new work until paging eases. ${ACTIVITY_DIAG}`,
    );
  } else if (
    pageoutBytesPerSec !== null &&
    pageoutBytesPerSec >= thresholds.maxPageoutBytesPerSec * WARNING_FACTOR
  ) {
    warnings.push(
      `pageout rate is elevated (${fmtBytesPerSec(pageoutBytesPerSec)} over ${windowLabel})`,
    );
  }

  if (swapUsedRatio !== null) {
    if (swapUsedRatio >= thresholds.maxSwapUsedRatio) {
      const amount =
        swapUsedBytes !== null && swapTotalBytes !== null
          ? ` (${fmtBytes(swapUsedBytes)} of ${fmtBytes(swapTotalBytes)} swap, ${fmtPct(swapUsedRatio)})`
          : ` (${fmtPct(swapUsedRatio)} of swap)`;
      warnings.push(`swap use is high${amount} — not holding on occupancy alone`);
    } else if (swapUsedRatio >= thresholds.maxSwapUsedRatio * WARNING_FACTOR) {
      warnings.push(
        `swap use is climbing (${fmtPct(swapUsedRatio)}, limit ${fmtPct(thresholds.maxSwapUsedRatio)})`,
      );
    }
  }

  if (compressorRatio !== null) {
    if (compressorRatio >= thresholds.maxCompressorRatio) {
      const amount = compressorBytes !== null ? ` (${fmtBytes(compressorBytes)} of RAM)` : "";
      warnings.push(
        `memory compressor is holding ${fmtPct(compressorRatio)} of RAM${amount} — ` +
          "not holding on occupancy alone",
      );
    } else if (compressorRatio >= thresholds.maxCompressorRatio * WARNING_FACTOR) {
      warnings.push(
        `memory compressor use is high (${fmtPct(compressorRatio)}, ` +
          `limit ${fmtPct(thresholds.maxCompressorRatio)})`,
      );
    }
  }

  if (loadPerCpu > thresholds.maxLoadPerCpu) {
    const detail =
      `system load is high (${loadPerCpu.toFixed(1)}× per CPU, limit ` +
      `${thresholds.maxLoadPerCpu}×)`;
    if (source === "load") {
      reasons.push(`${detail} — waiting for headroom before starting more work`);
    } else {
      warnings.push(`${detail}, but memory pressure is normal — not holding starts`);
    }
  }

  const reason = reasons.length > 0 ? reasons.join("; ") : null;
  const level: PressureLevel =
    reasons.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "normal";
  return {
    level,
    availableMemRatio,
    loadPerCpu,
    swapUsedBytes,
    swapTotalBytes,
    swapUsedRatio,
    compressorBytes,
    compressorRatio,
    memoryFreePercent,
    totalMemBytes,
    swapIoBytesPerSec,
    pageoutBytesPerSec,
    activityWindowSec,
    psiMemoryAvg10,
    source,
    reasons,
    warnings,
    reason,
  };
}

function mergeActivityReadings(readings: MemoryReadings, config?: RepoOSConfig): MemoryReadings {
  if (readings.swapIoBytesPerSec !== undefined || readings.pageoutBytesPerSec !== undefined) {
    return readings;
  }
  const windowSec = config ? pressureActivityWindowSec(config) : 30;
  const activity = readPlatformMemoryActivity(windowSec);
  return {
    ...readings,
    swapIoBytesPerSec: activity.swapIoBytesPerSec,
    pageoutBytesPerSec: activity.pageoutBytesPerSec,
    activityWindowSec: activity.activityWindowSec,
    memoryFreePercent: activity.memoryFreePercent ?? readings.memoryFreePercent,
    memoryPressureLevel: activity.memoryPressureLevel,
    psiMemoryAvg10: activity.psiMemoryAvg10,
  };
}

/** Current machine pressure, using the configured thresholds. */
export function pressureSnapshot(
  config?: RepoOSConfig,
  probe?: MemoryPressureProbe,
): PressureSnapshot {
  const readings = mergeActivityReadings(sampleMemoryReadings(probe), config);
  return evaluatePressure(readings, pressureThresholds(config));
}

/** Current machine readings without evaluating them (kept for diagnostics). */
export function samplePressure(probe?: MemoryPressureProbe): MemoryReadings {
  return sampleMemoryReadings(probe);
}

/**
 * Non-null when new work must be held. Legacy callers pass a partial reading
 * (e.g. only load + available memory); evaluation still works and falls back to
 * load average exactly as it did before #0871.
 */
export function pressureReason(
  config: RepoOSConfig,
  sample?: Partial<MemoryReadings> & Partial<PressureSnapshot>,
  probe?: MemoryPressureProbe,
): string | null {
  if (!pressureGuardEnabled(config)) return null;
  const evaluated = sample
    ? evaluatePressure(sample, pressureThresholds(config))
    : pressureSnapshot(config, probe);
  return evaluated.reason;
}

/** Full snapshot for the UI, respecting the guard's enabled switch. */
export function pressureSnapshotForDisplay(
  config?: RepoOSConfig,
  probe?: MemoryPressureProbe,
): PressureSnapshot {
  const snapshot = pressureSnapshot(config, probe);
  if (config && !pressureGuardEnabled(config)) {
    return {
      ...snapshot,
      level: "normal",
      reasons: [],
      warnings: [],
      reason: null,
    };
  }
  return snapshot;
}

export async function waitForPressureRelief(
  config: RepoOSConfig,
  opts: {
    onWaiting?: (reason: string) => void;
    pollMs?: number;
    deadlineAt?: number;
    probe?: MemoryPressureProbe;
  } = {},
): Promise<void> {
  if (!pressureGuardEnabled(config)) return;
  const poll = Math.max(500, opts.pollMs ?? 2000);
  while (true) {
    const snapshot = pressureSnapshot(config, opts.probe);
    const reason = snapshot.reason;
    if (!reason) return;
    opts.onWaiting?.(reason);
    if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
      throw new Error(
        `${reason} — timed out waiting for relief. Free memory or swap, lower other machine load, ` +
          "or raise pressureGuard limits in Settings.",
      );
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}
