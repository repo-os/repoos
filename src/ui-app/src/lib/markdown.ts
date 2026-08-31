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

/** Inline transforms on already-escaped text. */
function inline(s: string): string {
  // fenced-style inline code first so emphasis doesn't touch its contents
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
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
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
  // strikethrough
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
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

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "mermaid"; lines: string[] }
  | { kind: "ul"; items: { checked: boolean | null; text: string }[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }
  | { kind: "table"; rows: string[][] }
  | { kind: "p"; lines: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // blank → skip (paragraphs absorb their own blanks)
    if (/^\s*$/.test(line)) {
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
      if (lang.toLowerCase() === "mermaid") {
        blocks.push({ kind: "mermaid", lines: body });
      } else {
        blocks.push({ kind: "code", lang, lines: body });
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
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        q.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: q });
      continue;
    }

    // unordered list (incl. task checkboxes)
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: { checked: boolean | null; text: string }[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i]!)) {
        const raw = lines[i]!.replace(/^\s*[-*+]\s+/, "");
        const cb = raw.match(/^\[([ xX])\]\s+(.*)$/);
        if (cb) {
          items.push({ checked: cb[1] !== " ", text: cb[2]! });
        } else {
          items.push({ checked: null, text: raw });
        }
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // paragraph: gather until blank or a block-start line
    const p: string[] = [];
    while (i < lines.length) {
      const L = lines[i]!;
      if (/^\s*$/.test(L)) break;
      if (/^(?:`{3,}|~{3,})[\w-]*\s*$/.test(L)) break;
      if (/^#{1,6}\s+/.test(L)) break;
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(L)) break;
      if (/^>\s?/.test(L)) break;
      if (/^\s*[-*+]\s+/.test(L)) break;
      if (/^\s*\d+[.)]\s+/.test(L)) break;
      p.push(L);
      i++;
    }
    if (p.length) blocks.push({ kind: "p", lines: p });
  }

  return blocks;
}

function renderBlock(b: Block): string {
  switch (b.kind) {
    case "heading": {
      const tag = `h${Math.min(6, Math.max(1, b.level))}`;
      return `<${tag}>${inline(escapeHtml(b.text))}</${tag}>`;
    }
    case "code": {
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
            return `<li>${inline(escapeHtml(it.text))}</li>`;
          }
          const mark = it.checked ? "checked" : "unchecked";
          const box = it.checked ? "☑" : "☐";
          return `<li class="md-task md-task-${mark}"><span class="md-task-box" aria-hidden="true">${box}</span><span class="md-task-text">${inline(escapeHtml(it.text))}</span></li>`;
        })
        .join("");
      return `<ul>${items}</ul>`;
    }
    case "ol": {
      const items = b.items.map((t) => `<li>${inline(escapeHtml(t))}</li>`).join("");
      return `<ol>${items}</ol>`;
    }
    case "table": {
      const [head, ...body] = b.rows;
      if (!head) return "";
      const th = head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join("");
      const trs = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    }
    case "p": {
      return `<p>${renderSoftLines(b.lines)}</p>`;
    }
  }
}

/** Convert Markdown source to a safe HTML string for v-html. */
export function renderMarkdown(src: string): string {
  if (!src || !src.trim()) return "";
  return parseBlocks(src).map(renderBlock).join("");
}
