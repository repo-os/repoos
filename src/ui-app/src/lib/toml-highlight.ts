/**
 * Tiny TOML syntax highlighter for the raw `repoos.toml` editor (#0375).
 *
 * This is intentionally not a parser — it can't be, at zero runtime deps and
 * with `v-html` on the other end. It splits the text into a small set of token
 * classes (comment, table, key, string, number, boolean, punctuation) and
 * returns escaped HTML whose *text content is byte-for-byte the input*, so the
 * highlighted layer lines up exactly under the transparent textarea above it.
 * Input it doesn't recognise is escaped and passed through unstyled.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PUNCTUATION = new Set(["[", "]", "{", "}", ",", "=", "."]);
const BOOLEAN = /^(true|false)$/;
const NUMBER =
  /^[+-]?(\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?|inf|nan|0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}([Tt ].*)?$/;

/** Highlight a value region (everything after `=`), preserving every character. */
function highlightValue(value: string): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === " " || ch === "\t") {
      out += ch;
      i++;
      continue;
    }
    if (ch === "#") {
      out += `<span class="toml-comment">${escapeHtml(value.slice(i))}</span>`;
      break;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const triple = value.startsWith(quote.repeat(3), i);
      let j = i + (triple ? 3 : 1);
      if (triple) {
        while (j < value.length && !value.startsWith(quote.repeat(3), j)) {
          if (quote === '"' && value[j] === "\\") j++;
          j++;
        }
        j = Math.min(value.length, j + 3);
      } else {
        while (j < value.length) {
          if (quote === '"' && value[j] === "\\") {
            j += 2;
            continue;
          }
          if (value[j] === quote) {
            j++;
            break;
          }
          j++;
        }
      }
      out += `<span class="toml-string">${escapeHtml(value.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (PUNCTUATION.has(ch)) {
      out += `<span class="toml-punct">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }
    let j = i;
    while (j < value.length && !" \t\"'#".includes(value[j]) && !PUNCTUATION.has(value[j])) {
      j++;
    }
    const token = value.slice(i, j);
    const cls = BOOLEAN.test(token)
      ? "toml-bool"
      : NUMBER.test(token) || DATE.test(token)
        ? "toml-number"
        : "toml-plain";
    out += `<span class="${cls}">${escapeHtml(token)}</span>`;
    i = j;
  }
  return out;
}

/** Highlight a `[table]` / `[[array-of-tables]]` header, preserving every character. */
function highlightHeader(line: string): string {
  const lead = line.match(/^\s*/)?.[0] ?? "";
  const rest = line.slice(lead.length);
  const open = rest.startsWith("[[") ? "[[" : "[";
  const close = open === "[[" ? "]]" : "]";
  let inner = rest.slice(open.length);
  const closes = inner.endsWith(close);
  if (closes) inner = inner.slice(0, -close.length);
  return (
    escapeHtml(lead) +
    `<span class="toml-punct">${open}</span>` +
    `<span class="toml-table">${escapeHtml(inner)}</span>` +
    (closes ? `<span class="toml-punct">${close}</span>` : "")
  );
}

function highlightLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return `<span class="toml-comment">${escapeHtml(line)}</span>`;
  }
  if (trimmed.startsWith("[")) return highlightHeader(line);

  const eq = line.indexOf("=");
  if (eq === -1) return highlightValue(line);
  return (
    `<span class="toml-key">${escapeHtml(line.slice(0, eq))}</span>` +
    `<span class="toml-punct">=</span>` +
    highlightValue(line.slice(eq + 1))
  );
}

/** Highlight a whole TOML document into escaped HTML. */
export function highlightToml(source: string): string {
  if (typeof source !== "string" || !source) return "";
  return source.split("\n").map(highlightLine).join("\n");
}
