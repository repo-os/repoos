import { createMarkdownRenderer, defineLoader, type MarkdownRenderer } from "vitepress";
import history from "../release-history.json";

// Build-time read of RepoOS's own release history for the /changelog page.
//
// The source of truth is the committed `release-history.json`, written by the
// release pipeline in the same commit as the version bump. It used to fetch
// the GitHub Releases API at build time: that made the page depend on a
// release CI had not created yet, so a docs deploy triggered by the release
// commit lagged one version behind (v0.5.75 QA). The committed file is in the
// tag itself, so every build — including the release's own `repoos check` —
// already contains the new version and date.
const REPO = "repo-os/repoos";
const RELEASES_URL = `https://github.com/${REPO}/releases`;

// The page embeds a recent window; the full history is a link-out.
const LIMIT = 15;

interface HistoryEntry {
  version: string;
  tag: string;
  date: string;
  notes: string;
}

export interface Release {
  tag: string;
  name: string;
  /** Human-readable date, e.g. "Nov 4, 2026". */
  date: string;
  /** Machine-readable publish date for <time datetime>. */
  iso: string;
  url: string;
  prerelease: boolean;
  /** Rendered release-note HTML (from the entry's markdown). */
  html: string;
}

export interface Data {
  releases: Release[];
  currentVersion: string;
  currentDate: string;
  githubUrl: string;
  /** Kept for the page's error branch; the committed file cannot fail to fetch. */
  error: string | null;
}

declare const data: Data;
export { data };

// createMarkdownRenderer is VitePress's own markdown pipeline, so embedded
// release notes render exactly like the rest of the site (Sora/JetBrains Mono,
// Shiki-highlighted code, the site's link handling) without adding a markdown
// dependency of our own. Permalinks are off: many release bodies repeat the
// same section headings, and we do not want competing #intro anchors.
let markdown: Promise<MarkdownRenderer> | null = null;
function getMarkdown(): Promise<MarkdownRenderer> {
  if (!markdown) {
    markdown = createMarkdownRenderer(process.cwd(), { anchor: { permalink: false } }, "/");
  }
  return markdown;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function humanDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return dateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

function headingIds(html: string, tag: string): string {
  const prefix = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return html.replace(/<h([1-6]) id="([^"]*)"/g, `<h$1 id="${prefix}--$2"`);
}

async function load(): Promise<Data> {
  const entries = (history as { releases: HistoryEntry[] }).releases;
  const md = await getMarkdown();
  const releases = entries.slice(0, LIMIT).map((entry) => ({
    tag: entry.tag,
    name: entry.tag,
    date: humanDate(entry.date),
    iso: entry.date,
    url: `${RELEASES_URL}/tag/${entry.tag}`,
    prerelease: entry.version.includes("-"),
    html: headingIds(md.render(entry.notes), entry.tag),
  }));
  const current = releases[0];
  return {
    releases,
    currentVersion: current ? current.name.replace(/^v/, "") : "",
    currentDate: current?.date ?? "",
    githubUrl: RELEASES_URL,
    error: null,
  };
}

export default defineLoader({ load });
