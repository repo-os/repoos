/**
 * Salvage agent output whose JSON was cut short mid-serialisation (#0442).
 *
 * A streaming agent CLI can be interrupted while it is still writing one event
 * — a context limit, a buffer ceiling, a killed process. What reaches RepoOS
 * is then not valid JSON: `{"type":"text","part":{"text":"…` with the closing
 * quote and braces never written. `JSON.parse` throws and, before this module
 * existed, the whole payload degraded to a raw transcript line (or vanished),
 * leaving the human with no output and no actionable error.
 *
 * Two things make the failure hard to recognise by its message alone:
 *
 *  - the message is runtime-specific. Node says `Unterminated string in JSON
 *    at position 284447`; Bun says `JSON Parse error: Unterminated string`;
 *    and a payload cut after a complete value (`{"a":1`) reads as
 *    `Expected '}'` — indistinguishable from genuinely malformed JSON.
 *  - truncation is a *structural* property: the text ends with an unterminated
 *    string or unbalanced containers. So detection here is a scan, not a
 *    string match, and the parse error is only a secondary signal.
 *
 * Recovery is deliberately conservative: every event that completed before the
 * cut is returned verbatim, and the trailing partial event is repaired only by
 * *closing* what it opened (never by inventing values). Every repair attempt is
 * validated with `JSON.parse` before it is handed back.
 */

/** What a truncated payload looks like to the caller. */
export interface TruncatedPayload {
  /** Byte size of the raw payload that was cut short, for the human's message. */
  bytes: number;
  /** Actionable message: what happened and what to do about it. */
  message: string;
  /**
   * Raw JSON text of every event salvaged from the payload, in arrival order.
   * The last element may be a repaired partial event; the rest are verbatim.
   * Empty when nothing at all could be recovered.
   */
  recovered: string[];
}

/**
 * Opening words of every truncation notice, so a caller that receives one
 * second-hand (a transcript entry it did not emit itself) can recognise it
 * without string-matching the whole sentence.
 */
export const TRUNCATION_NOTICE_PREFIX = "Agent output was truncated (payload too large";

/** The message shown when an agent's output was cut short mid-serialisation. */
export function truncationMessage(bytes: number): string {
  return `${TRUNCATION_NOTICE_PREFIX} — ${bytes} bytes). Retry or reduce context.`;
}

/**
 * Parse-error messages that unambiguously mean "the input ended too early".
 * Deliberately excludes the ones a merely malformed payload also produces
 * (`Expected '}'`, `Expected ',' or ']'`), so a real syntax error is never
 * reported as truncation — see the structural scan, which is the primary test.
 */
const TRUNCATION_MESSAGES: RegExp[] = [
  /unterminated string/i,
  /unterminated (?:object|array)/i,
  /unexpected end of (?:json )?(?:input|data|file|stream)/i,
  /unexpected eof/i,
];

/** Whether a thrown `JSON.parse` error means the payload was cut short. */
export function isTruncationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name !== "SyntaxError" && !(err instanceof SyntaxError)) return false;
  return TRUNCATION_MESSAGES.some((re) => re.test(err.message));
}

/** One scanned top-level JSON value. */
interface ValueScan {
  /** Index just past the value's closing brace/bracket. */
  end: number;
  /** False when the input ended before the value was closed. */
  complete: boolean;
  /** The text of a repaired partial value, or null when nothing survives. */
  repaired: string | null;
}

/**
 * Scan one top-level JSON value starting at `start`, tracking nesting so
 * braces/brackets inside strings are ignored. On reaching the end of input
 * with the value still open, returns the best repair it could validate.
 */
function scanValue(raw: string, start: number): ValueScan {
  /** Open containers, innermost last. */
  const stack: string[] = [];
  const closersNow = (): string =>
    [...stack]
      .reverse()
      .map((c) => (c === "{" ? "}" : "]"))
      .join("");
  /**
   * The furthest point that can be closed into valid JSON: the end of the last
   * complete value, with the container closers that were open at that moment.
   * Anything after it (`"key":`, a half-typed literal) is dropped.
   */
  let lastCut: { index: number; closers: string } | null = null;
  let inString = false;
  let escaped = false;
  /** Whether the next string is an object key (a key on its own can't be kept). */
  let expectKey = true;
  let stringIsKey = false;

  let i = start;
  while (i < raw.length) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inString = false;
        if (!stringIsKey) lastCut = { index: i + 1, closers: closersNow() };
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringIsKey = expectKey;
      i += 1;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      expectKey = ch === "{";
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return { end: i + 1, complete: true, repaired: null };
      lastCut = { index: i + 1, closers: closersNow() };
      i += 1;
      continue;
    }
    if (ch === ":") {
      expectKey = false;
      i += 1;
      continue;
    }
    if (ch === ",") {
      expectKey = stack[stack.length - 1] === "{";
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      i += 1;
      continue;
    }
    // A literal: true / false / null / a number.
    let j = i;
    while (j < raw.length && !',}]" \n\r\t'.includes(raw[j])) j += 1;
    lastCut = { index: j, closers: closersNow() };
    i = j;
  }

  return {
    end: raw.length,
    complete: false,
    repaired: repair(raw, start, inString, stringIsKey, closersNow(), lastCut),
  };
}

/** Close up a partial value so it parses; null when no cut validates. */
function repair(
  raw: string,
  start: number,
  inString: boolean,
  stringIsKey: boolean,
  closers: string,
  lastCut: { index: number; closers: string } | null,
): string | null {
  const attempt = (cut: number, suffix: string, close: string): string | null => {
    if (cut <= start) return null;
    const text = raw.slice(start, cut) + suffix + close;
    try {
      JSON.parse(text);
      return text;
    } catch {
      return null;
    }
  };
  // Cut mid-string: the text that arrived is itself the value, so keep it —
  // dropping a dangling `\` first so the added quote isn't escaped away.
  if (inString && !stringIsKey) {
    let cut = raw.length;
    while (cut > start && raw[cut - 1] === "\\") cut -= 1;
    const salvaged = attempt(cut, '"', closers);
    if (salvaged) return salvaged;
  }
  // Otherwise fall back to the last complete value, dropping whatever came
  // after it (`"part":{"tex`, `{"a":1,"b":`).
  return lastCut ? attempt(lastCut.index, "", lastCut.closers) : null;
}

/**
 * Recover what can be salvaged from an agent payload that failed to parse.
 *
 * Returns null when the payload is valid JSON, or malformed for any reason
 * other than being cut short — so a caller can distinguish "your output was
 * too large" from "your output was garbage" instead of reporting one as the
 * other. Non-truncation failures keep whatever fallback the caller already had.
 */
export function recoverTruncatedJson(raw: string): TruncatedPayload | null {
  const text = raw.trim();
  if (!text) return null;
  let failure: unknown;
  try {
    JSON.parse(text);
    return null;
  } catch (err) {
    failure = err;
  }

  const recovered: string[] = [];
  let incomplete = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") {
      i += 1;
      continue;
    }
    const scan = scanValue(text, i);
    if (scan.complete) {
      recovered.push(text.slice(i, scan.end));
    } else {
      incomplete = true;
      if (scan.repaired) recovered.push(scan.repaired);
      break;
    }
    i = scan.end;
  }

  if (!incomplete && !isTruncationError(failure)) return null;
  const bytes = Buffer.byteLength(raw, "utf8");
  return { bytes, message: truncationMessage(bytes), recovered };
}
