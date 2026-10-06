/**
 * Close-out pipeline budget (#0679): adaptive default timeout from the last
 * successful merge-gate duration, and repo-level timing stats persisted under
 * `.repoos/`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RepoOSConfig } from "./types.js";

/** Minimum budget when timeout is not explicitly set in repoos.toml (#0679). */
export const CLOSE_OUT_MIN_TIMEOUT_MS = 600_000;

/** Multiplier applied to the last successful close-out gate duration (#0679). */
export const CLOSE_OUT_TIMEOUT_SCALE = 3;

/** Legacy fixed default when no timing history exists yet (#0573). */
export const CLOSE_OUT_LEGACY_DEFAULT_TIMEOUT_MS = 360_000;

const STATS_FILE = "close-out-gate-timing.json";

export interface CloseOutGateTimingStats {
  /** Duration of the last successful MTD merge-gate `repoos check` run. */
  lastSuccessfulGateDurationMs: number;
  updatedAt: string;
}

function statsPath(root: string, cacheDir: string): string {
  return join(root, cacheDir ?? ".repoos", STATS_FILE);
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  renameSync(temp, path);
}

/** Read persisted close-out gate timing stats, or null when none yet. */
export function readCloseOutGateTimingStats(
  root: string,
  cacheDir?: string,
): CloseOutGateTimingStats | null {
  const path = statsPath(root, cacheDir ?? ".repoos");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<CloseOutGateTimingStats>;
    if (
      typeof raw.lastSuccessfulGateDurationMs === "number" &&
      Number.isFinite(raw.lastSuccessfulGateDurationMs) &&
      raw.lastSuccessfulGateDurationMs > 0 &&
      typeof raw.updatedAt === "string"
    ) {
      return {
        lastSuccessfulGateDurationMs: Math.floor(raw.lastSuccessfulGateDurationMs),
        updatedAt: raw.updatedAt,
      };
    }
  } catch {
    /* corrupt — treat as missing */
  }
  return null;
}

/** Record a successful close-out gate duration for future adaptive budgets. */
export function recordCloseOutGateTimingStats(
  root: string,
  cacheDir: string | undefined,
  durationMs: number,
): void {
  if (!(durationMs > 0)) return;
  const path = statsPath(root, cacheDir ?? ".repoos");
  atomicWriteJson(path, {
    lastSuccessfulGateDurationMs: Math.floor(durationMs),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Adaptive default when `[closeOut] timeoutMs` is not set in repoos.toml:
 * `max(10 min, 3 × last successful gate)`, or 10 min when there is no history.
 */
export function adaptiveCloseOutTimeoutMs(
  root: string | undefined,
  cacheDir?: string,
): number {
  if (!root) return CLOSE_OUT_MIN_TIMEOUT_MS;
  const stats = readCloseOutGateTimingStats(root, cacheDir);
  if (!stats) return CLOSE_OUT_MIN_TIMEOUT_MS;
  return Math.max(
    CLOSE_OUT_MIN_TIMEOUT_MS,
    Math.floor(stats.lastSuccessfulGateDurationMs * CLOSE_OUT_TIMEOUT_SCALE),
  );
}

/** Whether `closeOut.timeoutMs` was explicitly set in repoos.toml (#0679). */
export function closeOutTimeoutExplicit(config: Pick<RepoOSConfig, "closeOut">): boolean {
  return config.closeOut?.timeoutMsFromToml === true;
}

/**
 * Effective wall-clock / monotonic budget for one close-out attempt (#0573, #0679).
 * Explicit `timeoutMs` in repoos.toml wins; otherwise the adaptive default applies.
 */
export function effectiveCloseOutTimeoutMs(
  config: Pick<RepoOSConfig, "closeOut" | "root" | "cacheDir">,
): number {
  if (closeOutTimeoutExplicit(config)) {
    return config.closeOut?.timeoutMs ?? CLOSE_OUT_LEGACY_DEFAULT_TIMEOUT_MS;
  }
  return adaptiveCloseOutTimeoutMs(config.root, config.cacheDir);
}
