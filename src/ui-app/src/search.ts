import type { Task, ConfigField, DocMeta } from "./types";

export interface HighlightedSnippet {
  html: string;
}

export type SearchResult =
  | { kind: "task"; title: string; subtitle: string; task: Task; statusColor?: string }
  | { kind: "doc"; title: string; subtitle: string; path: string; snippet?: string | HighlightedSnippet }
  | { kind: "setting"; title: string; subtitle: string; key: string };

export interface SearchSource {
  tasks: Task[];
  docs: (DocMeta & { content?: string })[];
  fields: ConfigField[];
}

/** Per-kind cap so the dropdown stays bounded on large repos. */
export const RESULT_CAP = 8;

function includes(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle);
}

function editDistance(a: string, b: string): number {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  if (aLow === bLow) return 0;
  if (!aLow || !bLow) return Math.max(aLow.length, bLow.length);
  const dp: number[][] = Array.from({ length: aLow.length + 1 }, (_, i) =>
    Array.from({ length: bLow.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= aLow.length; i++) {
    for (let j = 1; j <= bLow.length; j++) {
      dp[i][j] = aLow[i - 1] === bLow[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[aLow.length][bLow.length];
}

function fuzzyMatch(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  if (includes(text, query)) return true;
  // Avoid false positives on very short queries: 1-char queries match only on exact substring,
  // 2-3 char queries allow 1 edit, 4+ allow up to 2 edits.
  const maxDist = query.length <= 1 ? 0 : query.length <= 3 ? 1 : 2;
  const words = text.toLowerCase().split(/\s+/);
  return words.some(w => editDistance(w, query) <= maxDist);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractSnippet(text: string, query: string, contextLen: number = 60): HighlightedSnippet {
  const lower = text.toLowerCase();
  const qLow = query.toLowerCase();
  const idx = lower.indexOf(qLow);

  if (idx === -1) {
    const words = text.split(/\s+/);
    const maxDist = query.length <= 1 ? 0 : query.length <= 3 ? 1 : 2;
    for (let i = 0; i < words.length; i++) {
      if (editDistance(words[i], query) <= maxDist) {
        const start = Math.max(0, i - 2);
        const end = Math.min(words.length, i + 3);
        const snippet = words.slice(start, end).join(" ").substring(0, contextLen);
        const wordStart = words.slice(start, i).join(" ").length;
        const wordEnd = wordStart + words[i].length;
        // The snippet may be truncated before (or mid-) the matched word.
        // Highlight only the portion that actually made it into the snippet,
        // so the rendered text never diverges from what's shown.
        if (wordStart >= snippet.length) {
          return { html: escapeHtml(snippet) };
        }
        const clampedEnd = Math.min(wordEnd, snippet.length);
        const html = escapeHtml(snippet.substring(0, wordStart)) +
                     "<mark>" + escapeHtml(snippet.substring(wordStart, clampedEnd)) + "</mark>" +
                     escapeHtml(snippet.substring(clampedEnd));
        return { html };
      }
    }
    return { html: escapeHtml(text.substring(0, contextLen)) };
  }

  const start = Math.max(0, idx - contextLen / 2);
  const end = Math.min(text.length, idx + contextLen / 2);
  const snippet = (start > 0 ? "…" : "") + text.substring(start, end) + (end < text.length ? "…" : "");
  const matchStart = idx - start + (start > 0 ? 1 : 0);
  const matchEnd = matchStart + query.length;

  const html = escapeHtml(snippet.substring(0, matchStart)) +
               "<mark>" + escapeHtml(snippet.substring(matchStart, matchEnd)) + "</mark>" +
               escapeHtml(snippet.substring(matchEnd));
  return { html };
}

export function searchAll(query: string, src: SearchSource): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const taskHits: SearchResult[] = [];
  for (const t of src.tasks) {
    if (includes(t.id, q) || includes(t.title, q) || includes(t.body, q) ||
        fuzzyMatch(t.title, q) || fuzzyMatch(t.body, q)) {
      taskHits.push({
        kind: "task",
        title: t.title,
        subtitle: `#${t.id} · ${t.status} · ${t.area}`,
        task: t,
      });
      if (taskHits.length >= RESULT_CAP) break;
    }
  }

  const docHits: SearchResult[] = [];
  for (const d of src.docs) {
    let match = false;
    let snippet: HighlightedSnippet | undefined;
    if (includes(d.title, q) || includes(d.path, q)) {
      match = true;
    } else if (fuzzyMatch(d.title, q) || fuzzyMatch(d.path, q)) {
      match = true;
    } else if (d.content && (includes(d.content, q) || fuzzyMatch(d.content, q))) {
      match = true;
      snippet = extractSnippet(d.content, q);
    }
    if (match) {
      docHits.push({
        kind: "doc",
        title: d.title || d.path,
        subtitle: d.path,
        path: d.path,
        ...(snippet && { snippet }),
      });
      if (docHits.length >= RESULT_CAP) break;
    }
  }

  const settingHits: SearchResult[] = [];
  for (const f of src.fields) {
    if (includes(f.label, q) || includes(f.key, q) ||
        fuzzyMatch(f.label, q) || fuzzyMatch(f.key, q)) {
      settingHits.push({ kind: "setting", title: f.label, subtitle: f.key, key: f.key });
      if (settingHits.length >= RESULT_CAP) break;
    }
  }

  return [...taskHits, ...docHits, ...settingHits];
}
