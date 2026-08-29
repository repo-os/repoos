import type { Task, ConfigField, DocMeta } from "./types";

export interface HighlightedSnippet {
  html: string;
}

export type SearchResult =
  | { kind: "task"; title: string; subtitle: string; task: Task; statusColor?: string }
  | {
      kind: "doc";
      title: string;
      subtitle: string;
      path: string;
      snippet?: string | HighlightedSnippet;
    }
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
    Array.from({ length: bLow.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= aLow.length; i++) {
    for (let j = 1; j <= bLow.length; j++) {
      dp[i][j] =
        aLow[i - 1] === bLow[j - 1]
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
  return words.some((w) => editDistance(w, query) <= maxDist);
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
        const html =
          escapeHtml(snippet.substring(0, wordStart)) +
          "<mark>" +
          escapeHtml(snippet.substring(wordStart, clampedEnd)) +
          "</mark>" +
          escapeHtml(snippet.substring(clampedEnd));
        return { html };
      }
    }
    return { html: escapeHtml(text.substring(0, contextLen)) };
  }

  const start = Math.max(0, idx - contextLen / 2);
  const end = Math.min(text.length, idx + contextLen / 2);
  const snippet =
    (start > 0 ? "…" : "") + text.substring(start, end) + (end < text.length ? "…" : "");
  const matchStart = idx - start + (start > 0 ? 1 : 0);
  const matchEnd = matchStart + query.length;

  const html =
    escapeHtml(snippet.substring(0, matchStart)) +
    "<mark>" +
    escapeHtml(snippet.substring(matchStart, matchEnd)) +
    "</mark>" +
    escapeHtml(snippet.substring(matchEnd));
  return { html };
}

function tokenizeQuery(q: string): string[] {
  return q.match(/[a-z0-9]+/g) ?? [];
}

/**
 * Inverse document frequency per query term over one kind's corpus, so a rare
 * term (e.g. "stealing") outweighs a term that appears in nearly every item
 * (e.g. "task") when ranking matches. Smoothed so unseen terms stay positive.
 */
function buildIdf(corpusTexts: string[], terms: string[]): Map<string, number> {
  const n = corpusTexts.length || 1;
  const idf = new Map<string, number>();
  for (const term of terms) {
    let df = 0;
    for (const text of corpusTexts) if (text.includes(term)) df++;
    idf.set(term, Math.log((n + 1) / (df + 1)) + 1);
  }
  return idf;
}

/** Relevance contribution of one field: rarity-weighted term hits, plus a bonus for the whole query appearing verbatim. */
function fieldScore(
  text: string | null | undefined,
  weight: number,
  terms: string[],
  idf: Map<string, number>,
  phrase: string,
): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  if (phrase.length > 1 && lower.includes(phrase)) score += weight * 6;
  for (const term of terms) {
    if (lower.includes(term)) score += weight * (idf.get(term) ?? 1);
  }
  return score;
}

function topByScore<T>(scored: { result: T; score: number }[]): T[] {
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_CAP)
    .map((s) => s.result);
}

export function searchAll(query: string, src: SearchSource): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = tokenizeQuery(q);

  // Field weights: title/id are a much stronger relevance signal than a
  // stray body/content mention, so they must outrank it even when the body
  // hit came first in source order (0007 follow-up — search results were
  // effectively unranked, just capped at the first 8 array-order matches).
  const taskIdf = buildIdf(
    src.tasks.map((t) => `${t.title} ${t.body}`.toLowerCase()),
    terms,
  );
  const scoredTasks: { result: SearchResult; score: number }[] = [];
  for (const t of src.tasks) {
    if (
      includes(t.id, q) ||
      includes(t.title, q) ||
      includes(t.body, q) ||
      fuzzyMatch(t.title, q) ||
      fuzzyMatch(t.body, q)
    ) {
      const score =
        fieldScore(t.id, 8, terms, taskIdf, q) +
        fieldScore(t.title, 4, terms, taskIdf, q) +
        fieldScore(t.body, 1, terms, taskIdf, q);
      scoredTasks.push({
        result: {
          kind: "task",
          title: t.title,
          subtitle: `#${t.id} · ${t.status} · ${t.area}`,
          task: t,
        },
        score,
      });
    }
  }
  const taskHits = topByScore(scoredTasks);

  const docIdf = buildIdf(
    src.docs.map((d) => `${d.title} ${d.path} ${d.content ?? ""}`.toLowerCase()),
    terms,
  );
  const scoredDocs: { result: SearchResult; score: number }[] = [];
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
      const score =
        fieldScore(d.title, 4, terms, docIdf, q) +
        fieldScore(d.path, 2, terms, docIdf, q) +
        fieldScore(d.content, 1, terms, docIdf, q);
      scoredDocs.push({
        result: {
          kind: "doc",
          title: d.title || d.path,
          subtitle: d.path,
          path: d.path,
          ...(snippet && { snippet }),
        },
        score,
      });
    }
  }
  const docHits = topByScore(scoredDocs);

  const settingIdf = buildIdf(
    src.fields.map((f) => `${f.label} ${f.key}`.toLowerCase()),
    terms,
  );
  const scoredSettings: { result: SearchResult; score: number }[] = [];
  for (const f of src.fields) {
    if (
      includes(f.label, q) ||
      includes(f.key, q) ||
      fuzzyMatch(f.label, q) ||
      fuzzyMatch(f.key, q)
    ) {
      const score =
        fieldScore(f.label, 3, terms, settingIdf, q) + fieldScore(f.key, 2, terms, settingIdf, q);
      scoredSettings.push({
        result: { kind: "setting", title: f.label, subtitle: f.key, key: f.key },
        score,
      });
    }
  }
  const settingHits = topByScore(scoredSettings);

  return [...taskHits, ...docHits, ...settingHits];
}
