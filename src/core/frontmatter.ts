/**
 * Minimal, dependency-free frontmatter handling.
 *
 * We deliberately avoid pulling in gray-matter + a YAML engine so the package
 * has ZERO runtime dependencies and installs instantly via bunx/npx. We only
 * support the subset of YAML that task frontmatter realistically uses:
 *   - key: scalar (string / number / bool / null)
 *   - key: [a, b, c]            (inline list)
 *   - key:                      (block list with "- item" lines)
 *   - quoted strings (".." / '..')
 *
 * If a repo needs richer YAML, that frontmatter still round-trips: unknown
 * shapes are preserved as raw strings rather than dropped.
 */

export interface ParsedDocument {
  data: Record<string, unknown>;
  body: string;
  /** True if a frontmatter block was actually present. */
  hadFrontmatter: boolean;
}

export const FM_DELIM = "---";

/**
 * Check if a line is a frontmatter delimiter: either the literal `---` or a
 * rendered horizontal rule (box-drawing characters, optionally prefixed with
 * `> ` from markdown rendering).
 */
function isDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === FM_DELIM) return true;
  // A line of box-drawing characters (e.g., from kiro-cli's markdown rendering).
  // Strip optional blockquote prefix (`> `) then check if the rest is a horizontal rule.
  const withoutPrefix = trimmed.replace(/^>\s*/, "");
  if (withoutPrefix.length < 3) return false;
  // A horizontal rule is a sequence of dashes/box-drawing chars with minimal variation.
  // Strip one character class and count; if mostly the same, it's a rule.
  // Matches lines like "━━━", "──", "═══" from markdown rendering.
  const chars = new Set(withoutPrefix);
  // If all or most characters are the same dash-like character, treat as delimiter.
  return chars.size <= 2 && /^[─=━═─\-_]+$/.test(withoutPrefix);
}

function coerceScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  // quoted string
  if (v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  if (v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1);
  }
  // number (but keep zero-padded ids like 0012 as strings)
  if (/^-?\d+$/.test(v) && !/^0\d/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  return v;
}

function parseInlineList(raw: string): unknown[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((s) => coerceScalar(s));
}

interface FrontmatterScan {
  data: Record<string, unknown>;
  /** Index (within the scanned array) of the first non-frontmatter line. */
  next: number;
  /** True if at least one `key: value` line was parsed. */
  sawKey: boolean;
}

/**
 * Parse frontmatter key/value lines. In "closed" mode (between two `---`
 * delimiters) lines that don't look like frontmatter are skipped, matching the
 * historical behavior. In "unclosed" mode (frontmatter terminated by EOF) the
 * first non-frontmatter line ends the block and starts the body.
 */
function scanFrontmatterLines(lines: string[], mode: "closed" | "unclosed"): FrontmatterScan {
  const data: Record<string, unknown> = {};
  let i = 0;
  let sawKey = false;
  while (i < lines.length) {
    const line = lines[i];
    // YAML comments start with `#`; markdown headings (`## Section`) must not
    // be treated as comments, or they would be dropped from the body.
    const t = line.trim();
    if (t === "" || /^#(?!#)/.test(t)) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!m) {
      if (mode === "unclosed") break;
      i++;
      continue;
    }
    sawKey = true;
    const key = m[1];
    const rest = m[2].trim();

    if (rest === "") {
      // possible block list
      const items: unknown[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(coerceScalar(lines[j].replace(/^\s*-\s+/, "")));
        j++;
      }
      if (items.length > 0) {
        data[key] = items;
        i = j;
        continue;
      }
      data[key] = null;
      i++;
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      data[key] = parseInlineList(rest);
    } else {
      data[key] = coerceScalar(rest);
    }
    i++;
  }
  return { data, next: i, sawKey };
}

/**
 * Detect and parse a stray frontmatter block at the top of the body — the
 * shape a task file gets when its unclosed-frontmatter body was written
 * verbatim into the new file. Returns null unless the body starts with a `---`
 * line followed by at least one frontmatter key. When it returns a scan,
 * `next` is the index within `bodyLines` where the real body starts.
 */
function scanEmbeddedFrontmatter(bodyLines: string[]): FrontmatterScan | null {
  const first = bodyLines.findIndex((l) => l.trim() !== "");
  if (first === -1 || !isDelimiter(bodyLines[first])) return null;
  const scan = scanFrontmatterLines(bodyLines.slice(first + 1), "unclosed");
  if (!scan.sawKey) return null;
  return { data: scan.data, next: first + 1 + scan.next, sawKey: true };
}

/** Parse a document string into {data, body}. Never throws on malformed YAML. */
export function parseDocument(content: string): ParsedDocument {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0 || !isDelimiter(lines[0])) {
    return { data: {}, body: normalized, hadFrontmatter: false };
  }

  // A properly-closed frontmatter block ends at the first line that is exactly
  // the delimiter. We also absorb a stray unclosed frontmatter block that the
  // body starts with (a past createTask corrupted shape), merging its fields
  // over the closed block's so a re-serialize comes out clean.
  const closeIndex = lines.findIndex((l, i) => i > 0 && isDelimiter(l));
  if (closeIndex !== -1) {
    const closed = scanFrontmatterLines(lines.slice(1, closeIndex), "closed");
    const bodyLines = lines.slice(closeIndex + 1);
    const embedded = scanEmbeddedFrontmatter(bodyLines);
    if (embedded) {
      return {
        data: { ...closed.data, ...embedded.data },
        body: bodyLines.slice(embedded.next).join("\n"),
        hadFrontmatter: true,
      };
    }
    return { data: closed.data, body: bodyLines.join("\n"), hadFrontmatter: true };
  }

  // No closing delimiter: treat the frontmatter as terminated by EOF (YAML
  // documents may end without a trailing separator). Parse the leading
  // frontmatter-shaped lines; the first non-frontmatter line starts the body.
  const unclosed = scanFrontmatterLines(lines.slice(1), "unclosed");
  if (!unclosed.sawKey) {
    // Nothing frontmatter-shaped after the opening delimiter — the `---` is a
    // stray horizontal rule, not a frontmatter block.
    return { data: {}, body: normalized, hadFrontmatter: false };
  }
  const body = lines.slice(1 + unclosed.next).join("\n");
  return { data: unclosed.data, body, hadFrontmatter: true };
}

function serializeScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  // quote if it could be misread (leading zero ids, special chars, etc.)
  if (/^0\d/.test(s) || /[:#\[\]{}",]/.test(s) || s.trim() !== s || s === "") {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Serialize {data, body} back to a document, preserving a stable key order so
 * git diffs stay small. Known keys come first in a sensible order; unknown
 * keys follow in insertion order.
 */
export function serializeDocument(
  data: Record<string, unknown>,
  body: string,
  keyOrder: string[] = [],
): string {
  const seen = new Set<string>();
  const lines: string[] = [FM_DELIM];

  const emit = (key: string) => {
    if (seen.has(key) || !(key in data)) return;
    seen.add(key);
    const v = data[key];
    if (Array.isArray(v)) {
      const inline = v.map((x) => serializeScalar(x)).join(", ");
      lines.push(`${key}: [${inline}]`);
    } else {
      lines.push(`${key}: ${serializeScalar(v)}`);
    }
  };

  for (const k of keyOrder) emit(k);
  for (const k of Object.keys(data)) emit(k);

  lines.push(FM_DELIM, "");
  // ensure exactly one blank line between frontmatter and body
  const trimmedBody = body.replace(/^\n+/, "");
  return lines.join("\n") + trimmedBody;
}
