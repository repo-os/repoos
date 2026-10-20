import type { LocalFallbackMode, RepoOSConfig } from "./types.js";
import { positiveLimit } from "./remote-hosts.js";

export const DEFAULT_LOCAL_CHECKS_MAX = 2;
export const DEFAULT_PLAYWRIGHT_MAX = 1;
export const DEFAULT_QUEUE_TIMEOUT_MS = 45 * 60 * 1000;
export const DEFAULT_PRESSURE_MAX_LOAD_PER_CPU = 4;
export const DEFAULT_PRESSURE_MIN_AVAILABLE_MEM_RATIO = 0.08;
/**
 * Memory is the primary pressure signal (#0871): runaway swap use and a large
 * compressor pool are what make a machine thrash, and both rise before load
 * average tells the driver anything useful. A machine at 50% swap use is
 * already paying a reclaim cost on every allocation.
 */
export const DEFAULT_PRESSURE_MAX_SWAP_USED_RATIO = 0.5;
export const DEFAULT_PRESSURE_MAX_COMPRESSOR_RATIO = 0.35;

export function localChecksMaxConcurrent(config: RepoOSConfig): number {
  return positiveLimit(config.localChecks?.maxConcurrent, DEFAULT_LOCAL_CHECKS_MAX);
}

export function localChecksQueueTimeoutMs(config: RepoOSConfig): number {
  const raw = config.localChecks?.queueTimeoutMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 60_000) return Math.floor(raw);
  return DEFAULT_QUEUE_TIMEOUT_MS;
}

export function playwrightMaxConcurrent(config: RepoOSConfig): number {
  return positiveLimit(config.playwright?.maxConcurrent, DEFAULT_PLAYWRIGHT_MAX);
}

export function playwrightQueueTimeoutMs(config: RepoOSConfig): number {
  const raw = config.playwright?.queueTimeoutMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 60_000) return Math.floor(raw);
  return DEFAULT_QUEUE_TIMEOUT_MS;
}

export function remoteLocalFallbackMode(config: RepoOSConfig): LocalFallbackMode {
  const mode = config.remoteValidation?.localFallback;
  if (mode === "allow" || mode === "off" || mode === "serialize") return mode;
  return "serialize";
}

/** Effective local-check cap when this run is a remote-validation local fallback. */
export function localCheckLimitForRun(config: RepoOSConfig, env: NodeJS.ProcessEnv): number {
  const isFallback =
    env.REPOOS_REMOTE_FALLBACK_DETAIL?.trim() || (env.REPOOS_LOCAL_FALLBACK_RUN === "1" ? "1" : "");
  if (isFallback && remoteLocalFallbackMode(config) === "serialize") {
    return 1;
  }
  if (isFallback && remoteLocalFallbackMode(config) === "off") {
    return 0;
  }
  return localChecksMaxConcurrent(config);
}

export function pressureGuardEnabled(config: RepoOSConfig): boolean {
  return config.pressureGuard?.enabled !== false;
}

export function pressureMaxLoadPerCpu(config: RepoOSConfig): number {
  const raw = config.pressureGuard?.maxLoadPerCpu;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_PRESSURE_MAX_LOAD_PER_CPU;
}

export function pressureMinAvailableMemRatio(config: RepoOSConfig): number {
  const raw = config.pressureGuard?.minAvailableMemRatio;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return DEFAULT_PRESSURE_MIN_AVAILABLE_MEM_RATIO;
}

export function pressureMaxSwapUsedRatio(config: RepoOSConfig): number {
  const raw = config.pressureGuard?.maxSwapUsedRatio;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return DEFAULT_PRESSURE_MAX_SWAP_USED_RATIO;
}

export function pressureMaxCompressorRatio(config: RepoOSConfig): number {
  const raw = config.pressureGuard?.maxCompressorRatio;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return DEFAULT_PRESSURE_MAX_COMPRESSOR_RATIO;
}
