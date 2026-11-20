/**
 * Tiny Markdown → safe HTML renderer for the task-drawer spec card.
 * Zero runtime deps: escape first, then apply a focused subset of CommonMark
 * that covers typical task-spec bodies (headings, lists, checkboxes, code,
 * emphasis, links, paragraphs).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Characters that count as empty for a whole message row (incl. zero-width). */
const DISPLAY_EMPTY_RE = /^[\s\u200b\ufeff\u00ad]*$/u;

/** True when a row's text would render no visible content. */
export function isDisplayEmptyText(text: string): boolean {
  return DISPLAY_EMPTY_RE.test(text);
}

/** A source line that is blank for layout (whitespace or invisible-only). */
function isBlankDisplayLine(line: string): boolean {
  return DISPLAY_EMPTY_RE.test(line);
}

const THEMATIC_BREAK_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * A markdown thematic break (`---`) or a terminal-rendered rule (box-drawing
 * line, optionally prefixed with `> `). Mirrors `isDelimiter` in
 * `src/core/frontmatter.ts` so chat rows and parsers agree on what counts as a
 * horizontal rule.
 */
export function isThematicBreakLine(line: string): boolean {
  const trimmed = line.trim();
  if (THEMATIC_BREAK_RE.test(trimmed)) return true;
  const withoutPrefix = trimmed.replace(/^>\s*/, "");
  if (withoutPrefix.length < 3) return false;
  const chars = new Set(withoutPrefix);
  return chars.size <= 2 && /^[─=━═─\-_]+$/.test(withoutPrefix);
}

/** True when the text is only whitespace and thematic-break lines (#0563). */
export function isThematicBreakOnlyText(text: string): boolean {
  let sawBreak = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (isBlankDisplayLine(line)) continue;
    if (isThematicBreakLine(line)) {
      sawBreak = true;
      continue;
    }
    return false;
  }
  return sawBreak;
}

function trimTrailingBlankCodeLines(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && isBlankDisplayLine(out[out.length - 1]!)) {
    out.pop();
  }
  return out;
}

/**
 * Collapse 3+ blank lines to one and drop trailing blank lines in prose.
 * Fenced blocks keep interior spacing; only their trailing blank run is trimmed.
 */
export function clampMarkdownForDisplay(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const fence = line.match(/^(`{3,}|~{3,})([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1]!;
      out.push(line);
      i++;
      const body: string[] = [];
      const close = new RegExp(`^${marker[0]}{${marker.length},}\\s*$`);
      while (i < lines.length && !close.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      out.push(...trimTrailingBlankCodeLines(body));
      if (i < lines.length) {
        out.push(lines[i]!);
        i++;
      }
      continue;
    }

    if (isBlankDisplayLine(line)) {
      let j = i;
      while (j < lines.length && isBlankDisplayLine(lines[j]!)) j++;
      if (j < lines.length) out.push("");
      i = j;
      continue;
    }

    out.push(line);
    i++;
  }

  return out.join("\n");
}

/** Drop thematic-break lines outside fenced code — chat bubbles only (#0563). */
export function stripThematicBreakLinesForChat(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const fence = line.match(/^(`{3,}|~{3,})([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1]!;
      out.push(line);
      i++;
      const close = new RegExp(`^${marker[0]}{${marker.length},}\\s*$`);
      while (i < lines.length && !close.test(lines[i]!)) {
        out.push(lines[i]!);
        i++;
      }
      if (i < lines.length) {
        out.push(lines[i]!);
        i++;
      }
      continue;
    }

    if (isThematicBreakLine(line)) {
      i++;
      continue;
    }

    out.push(line);
    i++;
  }

  return out.join("\n");
}

/** Prose-only clamp for plain `<span>` bubbles (human / status lines). */
export function clampPlainDisplayText(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlankDisplayLine(line)) {
      let j = i;
      while (j < lines.length && isBlankDisplayLine(lines[j]!)) j++;
      if (j < lines.length) out.push("");
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }

  return out.join("\n");
}

/** Inline transforms on already-escaped text. */
function inline(s: string): string {
  // Code spans must be extracted into opaque placeholders BEFORE the other
  // passes, not simply rendered first: emitting `<code>...</code>` leaves the
  // quoted text sitting in the string for every later regex to match, so
  // image/link/bold/italic-looking content inside a code span gets
  // re-interpreted (e.g. `` `![x](y)` `` became a real broken <img>). The
  // placeholder is wrapped in NUL, which `escapeHtml` cannot produce and none
  // of the passes below match, and the real HTML is restored at the very end.
  const codeSpans: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, content: string) => {
    codeSpans.push(`<code>${content}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  // images: ![alt](src) — must run BEFORE links, whose pattern also matches
  // the `[alt](src)` tail. Only http(s) and repo-relative paths are allowed.
  s = s.replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()]*\))*)\)/g, (_m, alt: string, src: string) => {
    const safe = /^(https?:|\/|[a-zA-Z0-9._~/-])/.test(src) && !/^\s*javascript:/i.test(src);
    if (!safe) return alt;
    return `<img src="${src}" alt="${alt}" loading="lazy">`;
  });
  // links: [label](url) — only allow http(s)/mailto/# relative paths
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))*)\)/g, (_m, label: string, href: string) => {
    const safe =
      /^(https?:|mailto:|#|\/|[a-zA-Z0-9._~/-])/.test(href) && !/^\s*javascript:/i.test(href);
    if (!safe) return label;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // bold then italic (order matters so ** doesn't become nested em)
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // underscore emphasis only fires at a word boundary — CommonMark never lets
  // `_`/`__` open or close inside a word, so `my_variable_name` stays literal
  // instead of becoming `my<em>variable</em>name`.
  s = s.replace(/(?<![\w_])__([^_\n]+?)__(?![\w_])/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, "<em>$1</em>");
  // strikethrough
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // restore the extracted code spans now that no pass can touch their content
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codeSpans[Number(i)] ?? "");
  return s;
}

/**
 * CommonMark's ordinary in-paragraph newlines are soft breaks. Render them as
 * spaces so prose that is wrapped for source readability uses the available
 * width in the UI. A trailing backslash or two spaces is an explicit hard
 * break and remains a `<br>`.
 */
function renderSoftLines(lines: string[]): string {
  return lines
    .map((line, index) => {
      const hardBreak = /\\$| {2,}$/.test(line);
      const content = hardBreak ? line.replace(/\\$| {2,}$/, "") : line;
      const separator = index === lines.length - 1 ? "" : hardBreak ? "<br>" : " ";
      return inline(escapeHtml(content)) + separator;
    })
    .join("");
}

type ListItem = {
  checked: boolean | null;
  /** The item's own paragraph: its first line plus any continuation lines. */
  lines: string[];
  /** Blocks nested under the item (sub-lists, further paragraphs). */
  children: Block[];
};

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "mermaid"; lines: string[] }
  | { kind: "ul"; items: ListItem[] }
  | { kind: "ol"; items: ListItem[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }
  | { kind: "table"; rows: string[][] }
  | { kind: "p"; lines: string[] };

const UL_MARKER_RE = /^\s*[-*+]\s+/;
const OL_MARKER_RE = /^\s*\d+[.)]\s+/;
/** Lines that start a new block, so they can never be a lazy continuation. */
const BLOCK_START_RE =
  /^(?:`{3,}|~{3,})|^#{1,6}\s|^\s*(?:-{3,}|\*{3,}|_{3,})\s*$|^>|^\s*[-*+]\s+|^\s*\d+[.)]\s+/;

const leadingSpaces = (s: string): number => s.match(/^ */)![0].length;

/**
 * Collects one list item that starts at `lines[start]`. Indented lines are the
 * item's body and unindented text continues its paragraph (CommonMark lazy
 * continuation), so a wrapped bullet stays one item. The body is parsed as
 * blocks, which keeps nested sub-lists nested instead of flattening them.
 */
function parseListItem(
  lines: string[],
  start: number,
  marker: RegExp,
  tasks: boolean,
): { item: ListItem; next: number } {
  const indent = lines[start]!.match(marker)![0].length;
  let first = lines[start]!.slice(indent);
  let checked: boolean | null = null;
  if (tasks) {
    const cb = first.match(/^\[([ xX])\]\s+(.*)$/);
    if (cb) {
      checked = cb[1] !== " ";
      first = cb[2]!;
    }
  }
  const body: string[] = [];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlankDisplayLine(line)) {
      let k = i + 1;
      while (k < lines.length && isBlankDisplayLine(lines[k]!)) k++;
      if (k >= lines.length || leadingSpaces(lines[k]!) < indent) break;
      body.push("");
    } else if (leadingSpaces(line) >= indent) {
      body.push(line.slice(indent));
    } else if (
      !BLOCK_START_RE.test(line) &&
      (body.length ? body[body.length - 1] !== "" : first !== "")
    ) {
      body.push(line.trim());
    } else {
      break;
    }
    i++;
  }
  const children = parseBlocks(body.join("\n"));
  const head = children[0];
  const itemLines = [first];
  if (head?.kind === "p") {
    itemLines.push(...head.lines);
    children.shift();
  }
  return { item: { checked, lines: itemLines, children }, next: i };
}

/** After a blank line, a loose list keeps going if the next line is a marker. */
function nextItemAfterBlanks(lines: string[], i: number, marker: RegExp): number {
  let k = i;
  while (k < lines.length && isBlankDisplayLine(lines[k]!)) k++;
  return k > i && k < lines.length && marker.test(lines[k]!) ? k : i;
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // blank → skip (paragraphs absorb their own blanks)
    if (isBlankDisplayLine(line)) {
      i++;
      continue;
    }

    // Fenced code. CommonMark permits either backticks or tildes; keeping the
    // opening marker lets us require a matching closing marker.
    const fence = line.match(/^(`{3,}|~{3,})([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1]!;
      const lang = fence[2] || "";
      const body: string[] = [];
      i++;
      const close = new RegExp(`^${marker[0]}{${marker.length},}\\s*$`);
      while (i < lines.length && !close.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // closing fence
      const trimmedBody = trimTrailingBlankCodeLines(body);
      if (lang.toLowerCase() === "mermaid") {
        blocks.push({ kind: "mermaid", lines: trimmedBody });
      } else {
        blocks.push({ kind: "code", lang, lines: trimmedBody });
      }
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      blocks.push({ kind: "heading", level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // table: a header row (contains a pipe) followed by an alignment row.
    const delimRow = lines[i + 1];
    if (line.includes("|") && delimRow && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(delimRow)) {
      const rows: string[][] = [];
      const splitRow = (l: string): string[] =>
        l
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      while (i < lines.length && lines[i]!.includes("|")) {
        // skip the `| --- | --- |` alignment row (only ever sits after the header)
        if (rows.length === 1 && /^\|?[\s:|-]*-[\s:|-]*\|?$/.test(lines[i]!.trim())) {
          i++;
          continue;
        }
        rows.push(splitRow(lines[i]!));
        i++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length) {
        const L = lines[i]!;
        if (/^>\s?/.test(L)) {
          q.push(L.replace(/^>\s?/, ""));
        } else if (
          !isBlankDisplayLine(L) &&
          !BLOCK_START_RE.test(L) &&
          q.length &&
          q[q.length - 1] !== ""
        ) {
          // lazy continuation: an unmarked line keeps the quote's paragraph open
          q.push(L.trim());
        } else {
          break;
        }
        i++;
      }
      blocks.push({ kind: "quote", lines: q });
      continue;
    }

    // unordered list (incl. task checkboxes). Items keep their wrapped text and
    // nested blocks; blank lines between items keep it one loose list.
    if (UL_MARKER_RE.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && UL_MARKER_RE.test(lines[i]!)) {
        const parsed = parseListItem(lines, i, UL_MARKER_RE, true);
        items.push(parsed.item);
        i = nextItemAfterBlanks(lines, parsed.next, UL_MARKER_RE);
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // ordered list
    if (OL_MARKER_RE.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length && OL_MARKER_RE.test(lines[i]!)) {
        const parsed = parseListItem(lines, i, OL_MARKER_RE, false);
        items.push(parsed.item);
        i = nextItemAfterBlanks(lines, parsed.next, OL_MARKER_RE);
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // paragraph: gather until blank or a block-start line
    const p: string[] = [];
    while (i < lines.length) {
      const L = lines[i]!;
      if (isBlankDisplayLine(L)) break;
      if (/^(?:`{3,}|~{3,})[\w-]*\s*$/.test(L)) break;
      if (/^#{1,6}\s+/.test(L)) break;
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(L)) break;
      if (/^>\s?/.test(L)) break;
      if (/^\s*[-*+]\s+/.test(L)) break;
      if (/^\s*\d+[.)]\s+/.test(L)) break;
      p.push(L);
      i++;
    }
    // A first line that breaks the paragraph but opened no block of its own
    // (e.g. a bare `# `) is still text. Taking it keeps the loop advancing.
    if (!p.length) {
      p.push(line);
      i++;
    }
    blocks.push({ kind: "p", lines: p });
  }

  return blocks;
}

/** An item's wrapped paragraph followed by any blocks nested under it. */
function renderItemBody(it: ListItem): string {
  return renderSoftLines(it.lines) + it.children.map(renderBlock).join("");
}

function renderBlock(b: Block): string {
  switch (b.kind) {
    case "heading": {
      const tag = `h${Math.min(6, Math.max(1, b.level))}`;
      return `<${tag}>${inline(escapeHtml(b.text))}</${tag}>`;
    }
    case "code": {
      // Fenced code is a distinct block type and never passes through inline(),
      // so its content is already safe from the inline formatting passes.
      const code = escapeHtml(b.lines.join("\n"));
      const cls = b.lang ? ` class="language-${escapeHtml(b.lang)}"` : "";
      return `<pre><code${cls}>${code}</code></pre>`;
    }
    case "mermaid":
      // Mermaid reads textContent from this element after Vue has inserted the
      // already-escaped Markdown. Rendering is intentionally asynchronous.
      return `<div class="md-mermaid">${escapeHtml(b.lines.join("\n"))}</div>`;
    case "hr":
      return "<hr>";
    case "quote": {
      const inner = renderSoftLines(b.lines);
      return `<blockquote>${inner}</blockquote>`;
    }
    case "ul": {
      const items = b.items
        .map((it) => {
          if (it.checked === null) {
            return `<li>${renderItemBody(it)}</li>`;
          }
          const mark = it.checked ? "checked" : "unchecked";
          const box = it.checked ? "☑" : "☐";
          return `<li class="md-task md-task-${mark}"><span class="md-task-box" aria-hidden="true">${box}</span><span class="md-task-text">${renderItemBody(it)}</span></li>`;
        })
        .join("");
      return `<ul>${items}</ul>`;
    }
    case "ol": {
      const items = b.items.map((it) => `<li>${renderItemBody(it)}</li>`).join("");
      return `<ol>${items}</ol>`;
    }
    case "table": {
      const [head, ...body] = b.rows;
      if (!head) return "";
      const th = head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join("");
      const trs = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("")}</tr>`)
        .join("");
      return `<div class="md-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
    }
    case "p": {
      return `<p>${renderSoftLines(b.lines)}</p>`;
    }
  }
}

/** Convert Markdown source to a safe HTML string for v-html. */
export function renderMarkdown(src: string): string {
  const clamped = clampMarkdownForDisplay(src);
  if (!clamped || !clamped.replace(DISPLAY_EMPTY_RE, "")) return "";
  return parseBlocks(clamped).map(renderBlock).join("");
}

/**
 * Markdown for AI chat bubbles. Omits thematic-break blocks so `---` and
 * terminal-rendered rules do not become `<hr>` separators between turns (#0563).
 * Task specs, docs, and review reports keep using `renderMarkdown`.
 */
export function renderChatMarkdown(src: string): string {
  const stripped = stripThematicBreakLinesForChat(src);
  const clamped = clampMarkdownForDisplay(stripped);
  if (!clamped || !clamped.replace(DISPLAY_EMPTY_RE, "")) return "";
  if (isThematicBreakOnlyText(clamped)) return "";
  return parseBlocks(clamped)
    .filter((block) => block.kind !== "hr")
    .map(renderBlock)
    .join("");
}
