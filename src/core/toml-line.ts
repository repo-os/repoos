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
      if (line.slice(i, i + multilineDelimiter.length) === multilineDelimiter) {
        multilineDelimiter = "";
        i += multilineDelimiter.length - 1;
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

export function unquoteTomlString(s: string): string {
  if (s.length >= 6 && s.startsWith("'''") && s.endsWith("'''")) {
    let inner = s.slice(3, -3);
    // TOML trims the first newline after opening ''' (and first \r\n too)
    if (inner.startsWith("\n")) inner = inner.slice(1);
    else if (inner.startsWith("\r\n")) inner = inner.slice(2);
    return inner;
  }
  if (s.length >= 6 && s.startsWith('"""') && s.endsWith('"""')) {
    let inner = s.slice(3, -3);
    if (inner.startsWith("\n")) inner = inner.slice(1);
    else if (inner.startsWith("\r\n")) inner = inner.slice(2);
    return decodeBasicMultiLine(inner);
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
