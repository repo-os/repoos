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

const FM_DELIM = "---";

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

/** Parse a document string into {data, body}. Never throws on malformed YAML. */
export function parseDocument(content: string): ParsedDocument {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(FM_DELIM)) {
    return { data: {}, body: normalized, hadFrontmatter: false };
  }
  const end = normalized.indexOf(`\n${FM_DELIM}`, FM_DELIM.length);
  if (end === -1) {
    return { data: {}, body: normalized, hadFrontmatter: false };
  }
  const fmRaw = normalized.slice(FM_DELIM.length + 1, end);
  // body starts after the closing delim line
  const afterDelim = normalized.indexOf("\n", end + 1);
  const body = afterDelim === -1 ? "" : normalized.slice(afterDelim + 1);

  const data: Record<string, unknown> = {};
  const lines = fmRaw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!m) {
      i++;
      continue;
    }
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

  return { data, body, hadFrontmatter: true };
}

function serializeScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  // quote if it could be misread (leading zero ids, special chars, etc.)
  if (
    /^0\d/.test(s) ||
    /[:#\[\]{}",]/.test(s) ||
    s.trim() !== s ||
    s === ""
  ) {
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
