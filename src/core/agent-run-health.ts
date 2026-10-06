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
  // Stream-json events carry timestamps, call ids and arbitrary tool output
  // (file contents, test logs). Scanning the whole line for substrings such as
  // "402" or "billing" killed healthy agents mid-turn (#0709): only the
  // structured error fields of an event may report a provider failure.
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const isErrorEvent = obj.type === "error" || obj.is_error === true || obj.subtype === "error";
      const err =
        (typeof obj.error === "string" && obj.error) ||
        (obj.error &&
        typeof obj.error === "object" &&
        typeof (obj.error as { message?: unknown }).message === "string"
          ? (obj.error as { message: string }).message
          : "") ||
        (isErrorEvent && typeof obj.message === "string" ? obj.message : "") ||
        (isErrorEvent && typeof obj.result === "string" ? obj.result : "");
      if (err && isProviderFailureReason(String(err))) return String(err).slice(0, 500);
    } catch {
      /* not JSON */
    }
    return null;
  }
  // Plain text: only a short line, never a long blob of tool output.
  if (trimmed.length <= 300 && isProviderFailureReason(trimmed)) return trimmed.slice(0, 500);
  return null;
}

export interface DegenerateOutputConfig {
  /** Consecutive repetitions of one character within one assistant text block. */
  repeatCharThreshold: number;
  /** Consecutive identical trimmed lines within one assistant text block. */
  repeatLineThreshold: number;
  /** Assistant-text bytes without any intervening tool call before flagging. */
  bytesWithoutToolThreshold: number;
}

export const DEFAULT_DEGENERATE_OUTPUT_CONFIG: DegenerateOutputConfig = {
  repeatCharThreshold: 200,
  repeatLineThreshold: 12,
  bytesWithoutToolThreshold: 256 * 1024,
};

export type DegenerateOutputVerdict = "ok" | "degenerate";

/** Which rule tripped, with a short excerpt so a human can judge the hit (#0718). */
export interface DegenerateOutputHit {
  rule: "repeat-char" | "repeat-line" | "bytes-without-tool";
  /** Collapsed, trimmed excerpt of the offending assistant text (capped). */
  excerpt: string;
}

/** Longest excerpt kept for the needs-input detail — enough to spot a real loop. */
const HIT_EXCERPT_MAX = 200;

function excerptOf(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > HIT_EXCERPT_MAX ? `${collapsed.slice(0, HIT_EXCERPT_MAX)}…` : collapsed;
}

/** Longest run of one repeated character in `text`. */
function longestCharRun(text: string): number {
  let runChar = "";
  let run = 0;
  let max = 0;
  for (const ch of text) {
    if (ch === runChar) run += 1;
    else {
      runChar = ch;
      run = 1;
    }
    if (run > max) max = run;
  }
  return max;
}

/** Longest run of consecutive identical trimmed, non-empty lines in `text`. */
function longestRepeatedLineRun(text: string): number {
  let last = "";
  let run = 0;
  let max = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === last) run += 1;
    else {
      last = line;
      run = 1;
    }
    if (run > max) max = run;
  }
  return max;
}

/** Human-readable "which rule tripped, and on what text" for needs-input detail. */
export function degenerateHitDetail(hit: DegenerateOutputHit | null): string {
  if (!hit) return "Degenerate output loop detected after one automatic retry.";
  const rule =
    hit.rule === "repeat-char"
      ? "one character repeated"
      : hit.rule === "repeat-line"
        ? "the same line repeated"
        : "a very long run of text with no tool call";
  return `Degenerate output loop detected (${rule}). Excerpt: "${hit.excerpt}". If this is a real loop, restart with a fresh session; if it looks like normal output, it is a false positive.`;
}

/**
 * Detects a runaway assistant text loop or growth with no tool calls during one
 * turn (#0678), scanning ONLY the agent's own assistant text (#0718).
 *
 * `observe` is called once per assistant text block — the text of one streamed
 * `text` event, or one plain output line. A tool-call payload, a tool result,
 * or a CLI notice carries no assistant text and must be passed as `undefined`:
 * the old tracker scanned every raw stream line, so a minified file write or a
 * big tool result (a wall of `=`, a stack of `}` lines, a 300 KB read) looked
 * exactly like a model loop and healthy agents were killed (#0679, #0717).
 *
 * The repetition rules are scored per block, so `}` lines a coding agent writes
 * in two unrelated snippets never accumulate into a false hit; the
 * no-tool-call byte budget is the one signal that accumulates *across* blocks,
 * which is what catches a runaway that streams as many small text events.
 */
export class DegenerateOutputTracker {
  private readonly cfg: DegenerateOutputConfig;
  private bytesSinceTool = 0;
  private hit: DegenerateOutputHit | null = null;

  constructor(cfg: DegenerateOutputConfig = DEFAULT_DEGENERATE_OUTPUT_CONFIG) {
    this.cfg = cfg;
  }

  reset(): void {
    this.bytesSinceTool = 0;
    this.hit = null;
  }

  /** The rule and excerpt behind the last `"degenerate"` verdict, else null. */
  lastHit(): DegenerateOutputHit | null {
    return this.hit;
  }

  /**
   * Scan one block of the agent's own assistant text. Pass `undefined` for
   * anything that is not assistant prose (tool calls/results, notices): it is
   * never scanned, and a tool call (`hadToolCall`) resets the no-tool budget.
   */
  observe(assistantText: string | undefined, hadToolCall: boolean): DegenerateOutputVerdict {
    if (hadToolCall) this.bytesSinceTool = 0;
    if (!assistantText) return "ok";
    this.hit = null;
    this.bytesSinceTool += assistantText.length;
    if (this.bytesSinceTool >= this.cfg.bytesWithoutToolThreshold) {
      return this.flag("bytes-without-tool", assistantText);
    }
    if (longestCharRun(assistantText) >= this.cfg.repeatCharThreshold) {
      return this.flag("repeat-char", assistantText);
    }
    if (longestRepeatedLineRun(assistantText) >= this.cfg.repeatLineThreshold) {
      return this.flag("repeat-line", assistantText);
    }
    return "ok";
  }

  private flag(rule: DegenerateOutputHit["rule"], text: string): DegenerateOutputVerdict {
    this.hit = { rule, excerpt: excerptOf(text) };
    return "degenerate";
  }
}
