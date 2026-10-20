/**
 * Line-level helpers shared by RepoOS's small TOML readers and writers
 * (config.ts, tunnel.ts).
 *
 * The readers used to strip comments with `line.replace(/#.*$/, "")`, which
 * also cut quoted values at the first `#`. The Agents page then saved that
 * cut value back, which is how the reviewer's instructions in repoos.toml lost
 * everything after "with exactly `" (the next character was the `#` of
 * `## Verdict`). Anything with a `#0348`-style task reference hit the same.
 */

/** Drop a trailing `# comment`, ignoring `#` inside quoted strings including
 * single-line (`"..."`, `'...'`) and multi-line (`"""..."""`, `'''...'''`) forms. */
export function stripTomlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let multilineDelimiter = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (multilineDelimiter) {
      // Escapes only exist in basic strings; `\"` must not be read as a close.
      if (multilineDelimiter === '"""' && ch === "\\") {
        i++;
        continue;
      }
      if (line.slice(i, i + 3) === multilineDelimiter) {
        // A run of 3+ quotes closes it; up to two leading quotes in the run
        // belong to the content (TOML allows `"""""` before the close).
        let run = 0;
        while (line[i + run] === multilineDelimiter[0]) run++;
        i += run - 1;
        multilineDelimiter = "";
        continue;
      }
      continue;
    }
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      if (ch === '"' && line.slice(i, i + 3) === '"""') {
        multilineDelimiter = '"""';
        i += 2;
        continue;
      }
      if (ch === "'" && line.slice(i, i + 3) === "'''") {
        multilineDelimiter = "'''";
        i += 2;
        continue;
      }
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Find where a multi-line string's content ends (the start of its closing
 * delimiter) when the opening delimiter sits just before `start`. Honours `\"`
 * escapes in `"""` strings and TOML's rule that one or two quotes immediately
 * before the closing delimiter are content, not part of it. Returns -1 when the
 * string is unterminated in `text`.
 */
export function findTomlMultiLineClose(
  text: string,
  start: number,
  delimiter: '"""' | "'''",
): number {
  let i = start;
  while (i < text.length) {
    if (delimiter === '"""' && text[i] === "\\") {
      i += 2; // skip the escaped character, including an escaped quote
      continue;
    }
    if (text.startsWith(delimiter, i)) {
      let run = 0;
      while (text[i + run] === delimiter[0]) run++;
      // Content keeps at most two of the run's leading quotes; the last three
      // are the delimiter.
      return i + Math.min(Math.max(run - 3, 0), 2);
    }
    i++;
  }
  return -1;
}

/**
 * Turn a quoted TOML scalar back into its string. Basic strings are decoded
 * with TOML's own escape rules — not JSON's: TOML supports `\UXXXXXXXX`, which
 * JSON rejects, and the writer's `JSON.stringify` output is a subset of them,
 * so `\"`/`\\`/`\uXXXX` round-trip. An unknown escape is preserved rather than
 * dropped; TOML validation rejects it before a save.
 */
/** Decode the escapes in a basic (`"..."`) string body. */
function decodeBasicString(inner: string, multiLine: boolean): string {
  if (multiLine) {
    if (inner.startsWith("\n")) inner = inner.slice(1);
    else if (inner.startsWith("\r\n")) inner = inner.slice(2);
  }
  const out: string[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      switch (next) {
        case '"':
          out.push('"');
          break;
        case "\\":
          out.push("\\");
          break;
        case "b":
          out.push("\b");
          break;
        case "t":
          out.push("\t");
          break;
        case "n":
          out.push("\n");
          break;
        case "f":
          out.push("\f");
          break;
        case "r":
          out.push("\r");
          break;
        case " ":
        case "\t": {
          // A line-ending backslash may be followed by spaces/tabs before the
          // newline; only trim when the run actually reaches one. Single-line
          // strings have no line ending to escape.
          if (!multiLine) {
            out.push("\\" + next);
            break;
          }
          let j = i + 1;
          let sawNewline = false;
          while (
            j < inner.length &&
            (inner[j] === " " || inner[j] === "\t" || inner[j] === "\n" || inner[j] === "\r")
          ) {
            if (inner[j] === "\n") sawNewline = true;
            j++;
          }
          if (sawNewline) i = j - 2;
          else out.push("\\" + next);
          break;
        }
        case "\n":
        case "\r": {
          if (!multiLine) {
            out.push("\\" + next);
            break;
          }
          // Line-ending backslash: trim the newline and every following
          // space/tab/newline up to the next non-whitespace character.
          let j = i + 2;
          if (next === "\r" && inner[j] === "\n") j++;
          while (
            j < inner.length &&
            (inner[j] === " " || inner[j] === "\t" || inner[j] === "\n" || inner[j] === "\r")
          ) {
            j++;
          }
          i = j - 2; // the switch's trailing `i++` and the loop's own advance land on j
          break;
        }
        case "u":
        case "U": {
          const digits = next === "u" ? 4 : 8;
          const hex = inner.slice(i + 2, i + 2 + digits);
          if (hex.length === digits && /^[0-9A-Fa-f]+$/.test(hex)) {
            const code = parseInt(hex, 16);
            if (next === "u") out.push(String.fromCharCode(code));
            else if (code <= 0x10ffff) out.push(String.fromCodePoint(code));
            else out.push("\\" + next + hex);
            i += digits;
          } else {
            out.push("\\" + next);
          }
          break;
        }
        default:
          // Preserve an unknown escape rather than silently dropping the
          // backslash; TOML validation rejects it before a save anyway.
          out.push("\\" + next);
          break;
      }
      i++;
    } else {
      out.push(ch);
    }
  }
  return out.join("");
}

/**
 * For each line of a TOML document, whether that line *begins* inside a
 * multi-line string. Writers that work line-by-line use this to avoid treating
 * string content as structure: a `[section]` or `key = …` line between
 * `'''`/`"""` delimiters is content, not a header or assignment.
 */
export function tomlContinuationLines(lines: readonly string[]): boolean[] {
  const continuation: boolean[] = [];
  let delimiter: '"""' | "'''" | null = null;
  for (const line of lines) {
    continuation.push(delimiter !== null);
    let i = 0;
    while (i < line.length) {
      const ch = line[i]!;
      if (delimiter) {
        if (delimiter === '"""' && ch === "\\") {
          i += 2;
          continue;
        }
        if (line.startsWith(delimiter, i)) {
          let run = 0;
          while (line[i + run] === delimiter[0]) run++;
          i += run;
          delimiter = null;
          continue;
        }
        i++;
        continue;
      }
      if (ch === "#") break;
      if (ch === '"' || ch === "'") {
        if (line.startsWith('"""', i)) {
          delimiter = '"""';
          i += 3;
          continue;
        }
        if (line.startsWith("'''", i)) {
          delimiter = "'''";
          i += 3;
          continue;
        }
        // Single-line string: skip to its closing quote (honouring escapes).
        const quote = ch;
        i++;
        while (i < line.length) {
          if (quote === '"' && line[i] === "\\") {
            i += 2;
            continue;
          }
          if (line[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      i++;
    }
  }
  return continuation;
}

export function unquoteTomlString(s: string): string {
  if (s.length >= 6 && (s.startsWith("'''") || s.startsWith('"""'))) {
    const delimiter = s.startsWith("'''") ? "'''" : '"""';
    const close = findTomlMultiLineClose(s, 3, delimiter);
    // A value the parser reconstructed always ends at the closing delimiter;
    // fall back to the old outer-slice when it is genuinely unterminated.
    const inner = close === -1 ? s.slice(3, -3) : s.slice(3, close);
    return delimiter === "'''" ? trimFirstNewline(inner) : decodeBasicString(inner, true);
  }
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    // TOML escape rules, not JSON: `\U0001F600` is valid TOML and invalid JSON.
    return decodeBasicString(s.slice(1, -1), false);
  }
  return s.replace(/^["']|["']$/g, "");
}

export type TomlInlineStringTableResult =
  | { ok: true; value: Record<string, string> }
  | { ok: false; error: string };

/**
 * Parse an inline TOML table whose values must all be strings. This is used by
 * small config readers that need one string-only inline table without pulling
 * in a second TOML parser. Delimiters are found with TOML quote/escape rules,
 * and each scalar is decoded by {@link unquoteTomlString}.
 *
 * Returns null when `raw` is not an inline table. A malformed table returns a
 * readable error (not a partial value), including unterminated strings.
 */
export function parseTomlInlineStringTable(raw: string): TomlInlineStringTableResult | null {
  const source = raw.trim();
  if (!source.startsWith("{")) return null;

  let i = 1;
  const values: Record<string, string> = {};
  const skipWhitespace = (): void => {
    while (/\s/.test(source[i] ?? "")) i++;
  };
  const fail = (error: string): TomlInlineStringTableResult => ({ ok: false, error });

  skipWhitespace();
  if (source[i] === "}") {
    i++;
    skipWhitespace();
    return i === source.length ? { ok: true, value: values } : fail("unexpected text after table");
  }

  while (i < source.length) {
    const keyStart = i;
    while (/[A-Za-z0-9_-]/.test(source[i] ?? "")) i++;
    const key = source.slice(keyStart, i);
    if (!key) return fail("expected a bare key");
    skipWhitespace();
    if (source[i] !== "=") return fail(`expected '=' after key "${key}"`);
    i++;
    skipWhitespace();

    const quote = source[i];
    if (quote !== '"' && quote !== "'") {
      return fail(`value for key "${key}" must be a quoted string`);
    }
    const valueStart = i;
    i++;
    let closed = false;
    while (i < source.length) {
      const ch = source[i];
      if (quote === '"' && ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        i++;
        closed = true;
        break;
      }
      i++;
    }
    if (!closed) return fail(`unterminated string value for key "${key}"`);
    values[key] = unquoteTomlString(source.slice(valueStart, i));

    skipWhitespace();
    if (source[i] === ",") {
      i++;
      skipWhitespace();
      if (source[i] === "}") return fail("trailing comma is not allowed");
      continue;
    }
    if (source[i] === "}") {
      i++;
      skipWhitespace();
      return i === source.length
        ? { ok: true, value: values }
        : fail("unexpected text after table");
    }
    return fail(`expected ',' or '}' after value for key "${key}"`);
  }
  return fail("unterminated inline table");
}

/** TOML trims the first newline after a multi-line opening delimiter. */
function trimFirstNewline(inner: string): string {
  if (inner.startsWith("\n")) return inner.slice(1);
  if (inner.startsWith("\r\n")) return inner.slice(2);
  return inner;
}
