/**
 * Provider failures, degenerate output loops, and sleep-aware idle timing (#0678).
 */
import { isProviderFailureReason } from "./attention.js";

/** Wall-clock delta credited toward silence/stall timers — caps laptop-sleep gaps. */
export function creditIdleMs(
  wallDeltaMs: number,
  tickIntervalMs: number,
  maxMultiplier = 2,
): number {
  if (wallDeltaMs <= 0) return 0;
  const cap = Math.max(tickIntervalMs, 1) * maxMultiplier;
  return Math.min(wallDeltaMs, cap);
}

/**
 * When comparing Activity-log staleness, shrink `now` if the watchdog loop slept
 * so a long suspend does not look like agent silence (#0678).
 */
export function effectiveStalenessNow(
  wallNow: number,
  lastWatchdogTickMs: number,
  watchdogIntervalMs: number,
): number {
  const gap = wallNow - lastWatchdogTickMs;
  if (gap <= watchdogIntervalMs * 3) return wallNow;
  return lastWatchdogTickMs + watchdogIntervalMs;
}

/** Extract a provider/credit/auth failure from one raw CLI line, if any. */
export function scrapeProviderFailure(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isProviderFailureReason(trimmed)) return trimmed.slice(0, 500);
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const err =
        (typeof obj.error === "string" && obj.error) ||
        (obj.error &&
        typeof obj.error === "object" &&
        typeof (obj.error as { message?: unknown }).message === "string"
          ? (obj.error as { message: string }).message
          : "") ||
        (typeof obj.message === "string" ? obj.message : "");
      if (err && isProviderFailureReason(String(err))) return String(err).slice(0, 500);
    } catch {
      /* not JSON */
    }
  }
  return null;
}

export interface DegenerateOutputConfig {
  /** Consecutive repetitions of one character in streamed text. */
  repeatCharThreshold: number;
  /** Consecutive identical trimmed lines. */
  repeatLineThreshold: number;
  /** Bytes of output without any tool call before flagging. */
  bytesWithoutToolThreshold: number;
}

export const DEFAULT_DEGENERATE_OUTPUT_CONFIG: DegenerateOutputConfig = {
  repeatCharThreshold: 200,
  repeatLineThreshold: 12,
  bytesWithoutToolThreshold: 256 * 1024,
};

export type DegenerateOutputVerdict = "ok" | "degenerate";

/**
 * Tracks runaway repetition and log growth with no tool calls during one turn.
 */
export class DegenerateOutputTracker {
  private readonly cfg: DegenerateOutputConfig;
  private repeatChar = "";
  private repeatCharCount = 0;
  private lastLine = "";
  private repeatLineCount = 0;
  private bytesSinceTool = 0;

  constructor(cfg: DegenerateOutputConfig = DEFAULT_DEGENERATE_OUTPUT_CONFIG) {
    this.cfg = cfg;
  }

  reset(): void {
    this.repeatChar = "";
    this.repeatCharCount = 0;
    this.lastLine = "";
    this.repeatLineCount = 0;
    this.bytesSinceTool = 0;
  }

  observe(line: string, hadToolCall: boolean): DegenerateOutputVerdict {
    if (hadToolCall) this.bytesSinceTool = 0;
    const text = line;
    this.bytesSinceTool += text.length;
    if (this.bytesSinceTool >= this.cfg.bytesWithoutToolThreshold) return "degenerate";

    for (const ch of text) {
      if (ch === this.repeatChar) this.repeatCharCount += 1;
      else {
        this.repeatChar = ch;
        this.repeatCharCount = 1;
      }
      if (this.repeatCharCount >= this.cfg.repeatCharThreshold) return "degenerate";
    }

    const lineKey = text.trim();
    if (lineKey) {
      if (lineKey === this.lastLine) this.repeatLineCount += 1;
      else {
        this.lastLine = lineKey;
        this.repeatLineCount = 1;
      }
      if (this.repeatLineCount >= this.cfg.repeatLineThreshold) return "degenerate";
    }
    return "ok";
  }
}
