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

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "ul"; items: { checked: boolean | null; text: string }[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" }
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

    // fenced code
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        body.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // closing fence
      blocks.push({ kind: "code", lang, lines: body });
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
      if (L.startsWith("```")) break;
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
    case "hr":
      return "<hr>";
    case "quote": {
      const inner = b.lines.map((l) => inline(escapeHtml(l))).join("<br>");
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
          return `<li class="md-task md-task-${mark}"><span class="md-task-box" aria-hidden="true">${box}</span>${inline(escapeHtml(it.text))}</li>`;
        })
        .join("");
      return `<ul>${items}</ul>`;
    }
    case "ol": {
      const items = b.items.map((t) => `<li>${inline(escapeHtml(t))}</li>`).join("");
      return `<ol>${items}</ol>`;
    }
    case "p": {
      // soft line breaks inside a paragraph become <br>
      const html = b.lines.map((l) => inline(escapeHtml(l))).join("<br>");
      return `<p>${html}</p>`;
    }
  }
}

/** Convert Markdown source to a safe HTML string for v-html. */
export function renderMarkdown(src: string): string {
  if (!src || !src.trim()) return "";
  return parseBlocks(src).map(renderBlock).join("");
}
