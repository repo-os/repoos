/**
 * Pressure guard (#0836, #0871).
 *
 * The guard holds new work when the machine cannot absorb it. Memory pressure
 * — swap use, the macOS compressor pool, reclaimable memory — is the primary
 * signal; load average is only a fallback for platforms where those readings
 * are unavailable. A thrashing box can sit at load 300 with an idle CPU, and a
 * busy-but-healthy box can sit at load 12 with memory to spare; load alone
 * cannot tell them apart.
 *
 * Running engineers are never killed. The guard only defers *starts* and
 * browser steps, with a reason the UI and queue markers can show.
 */
import type { RepoOSConfig } from "./types.js";
import {
  pressureGuardEnabled,
  pressureMaxCompressorRatio,
  pressureMaxLoadPerCpu,
  pressureMaxSwapUsedRatio,
  pressureMinAvailableMemRatio,
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
}

/** Near a threshold (75% of the way) is worth surfacing before it bites. */
const WARNING_FACTOR = 0.75;

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
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

  if (swapUsedRatio !== null) {
    if (swapUsedRatio >= thresholds.maxSwapUsedRatio) {
      const amount =
        swapUsedBytes !== null && swapTotalBytes !== null
          ? ` (${fmtBytes(swapUsedBytes)} of ${fmtBytes(swapTotalBytes)} swap, ${fmtPct(swapUsedRatio)})`
          : ` (${fmtPct(swapUsedRatio)} of swap)`;
      reasons.push(
        `swap is nearly full${amount} — the machine is thrashing, holding new work until it recovers`,
      );
    } else if (swapUsedRatio >= thresholds.maxSwapUsedRatio * WARNING_FACTOR) {
      warnings.push(
        `swap use is climbing (${fmtPct(swapUsedRatio)}, limit ${fmtPct(thresholds.maxSwapUsedRatio)})`,
      );
    }
  }

  if (compressorRatio !== null) {
    if (compressorRatio >= thresholds.maxCompressorRatio) {
      const amount = compressorBytes !== null ? ` (${fmtBytes(compressorBytes)} of RAM)` : "";
      reasons.push(
        `the memory compressor is holding ${fmtPct(compressorRatio)} of RAM${amount} — ` +
          "holding new work until memory pressure eases",
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
      // Memory readings unavailable: load is the only pressure signal we have.
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
    memoryFreePercent: sample.memoryFreePercent ?? null,
    totalMemBytes,
    source,
    reasons,
    warnings,
    reason,
  };
}

/** Current machine pressure, using the configured thresholds. */
export function pressureSnapshot(
  config?: RepoOSConfig,
  probe?: MemoryPressureProbe,
): PressureSnapshot {
  const readings = sampleMemoryReadings(probe);
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
