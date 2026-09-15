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

/** Drop a trailing `# comment`, ignoring `#` inside "double" or 'single' quoted strings. */
export function stripTomlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++; // skip the escaped character, including an escaped quote
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
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
export function unquoteTomlString(s: string): string {
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
