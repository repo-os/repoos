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
 * Turn a quoted TOML scalar back into its string. Double-quoted values are
 * decoded with JSON rules, which is exactly how the writers encode them
 * (`JSON.stringify`), so `\"` and `\\` round-trip instead of gaining a
 * backslash on every save. A value that isn't valid JSON (for example a
 * hand-written literal `\d`) falls back to stripping the outer quotes.
 */
/** Basic multi-line (`"""`) string: trim first newline, decode escapes. */
function decodeBasicMultiLine(inner: string): string {
  if (inner.startsWith("\n")) inner = inner.slice(1);
  else if (inner.startsWith("\r\n")) inner = inner.slice(2);
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
        case "\n":
        case "\r": {
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
        case "u": {
          if (i + 5 < inner.length) {
            const hex = inner.slice(i + 2, i + 6);
            out.push(String.fromCharCode(parseInt(hex, 16)));
            i += 4;
          } else {
            out.push("\\u");
          }
          break;
        }
        case "U": {
          if (i + 9 < inner.length) {
            const hex = inner.slice(i + 2, i + 10);
            const code = parseInt(hex, 16);
            out.push(code <= 0x10ffff ? String.fromCodePoint(code) : "\\U");
            i += 8;
          } else {
            out.push("\\U");
          }
          break;
        }
        default:
          out.push(next);
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
    let inner = close === -1 ? s.slice(3, -3) : s.slice(3, close);
    // TOML trims the first newline after the opening delimiter.
    if (inner.startsWith("\n")) inner = inner.slice(1);
    else if (inner.startsWith("\r\n")) inner = inner.slice(2);
    return delimiter === "'''" ? inner : decodeBasicMultiLine(inner);
  }
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(s);
      if (typeof decoded === "string") return decoded;
    } catch {
      /* not JSON-compatible: fall through */
    }
  }
  return s.replace(/^["']|["']$/g, "");
}
