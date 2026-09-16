import { createMarkdownRenderer, defineLoader, type MarkdownRenderer } from "vitepress";

// Build-time fetch of RepoOS's own release notes for the /changelog page.
//
// Source of truth is the GitHub Releases API (the `body` field), not the tag
// annotations directly: it is the same public surface `repoos upgrade` and the
// GitHub Releases page itself read, and it needs no auth for a public repo.
// This is a VitePress data loader, so the fetch runs once at build time and the
// result is baked into the page — there is no runtime request from a visitor's
// browser.
const REPO = "repo-os/repoos";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API_URL = `https://api.github.com/repos/${REPO}/releases`;

// Bound both the page and the fetch to a recent window. The full history is a
// link-out (see the page), so there is no reason to pull all of it.
const LIMIT = 15;

export interface Release {
  tag: string;
  name: string;
  /** Human-readable date, e.g. "Sep 16, 2026". */
  date: string;
  /** Machine-readable publish timestamp for <time datetime>. */
  iso: string;
  url: string;
  prerelease: boolean;
  /** Rendered release-note HTML (from the release body markdown). */
  html: string;
}

export interface Data {
  releases: Release[];
  githubUrl: string;
  /** Set when the fetch failed; the page degrades to the link-out. */
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

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  created_at: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function headingIds(html: string, tag: string): string {
  const prefix = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return html.replace(/<h([1-6]) id="([^"]*)"/g, `<h$1 id="${prefix}--$2"`);
}

async function load(): Promise<Data> {
  try {
    const res = await fetch(`${API_URL}?per_page=${LIMIT}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "repoos-docs-build",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub returned ${res.status} ${res.statusText}`);
    }

    const raw = (await res.json()) as GitHubRelease[];
    const md = await getMarkdown();

    const releases = raw
      .filter((r) => !r.draft)
      .map((r) => {
        const iso = r.published_at ?? r.created_at;
        return {
          tag: r.tag_name,
          name: r.name?.trim() || r.tag_name,
          date: dateFormat.format(new Date(iso)),
          iso,
          url: r.html_url,
          prerelease: r.prerelease,
          html: headingIds(md.render(r.body ?? ""), r.tag_name),
        };
      });

    return { releases, githubUrl: RELEASES_URL, error: null };
  } catch (err) {
    // A transient GitHub hiccup must not fail the whole docs build. Degrade to
    // the link-out instead — GitHub is authoritative anyway.
    return {
      releases: [],
      githubUrl: RELEASES_URL,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default defineLoader({ load });
