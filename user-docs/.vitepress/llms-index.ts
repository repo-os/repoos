import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Shared contract for the agent-facing outputs of the docs build:
 * `/llms.txt` (index), `/llms-full.txt` (whole manual), and one raw
 * Markdown copy per page at `<route>.md`.
 *
 * `config.mts` feeds the exclusions and template to `vitepress-plugin-llms`;
 * `scripts/check-llms.ts` re-reads the same source tree after the build and
 * fails when a page is missing from the index. Keeping both sides on this
 * module is what stops a new `user-docs/*.md` page from being silently
 * omitted.
 */

export const SITE_ORIGIN = "https://docs.repoos.org";

/**
 * Source files under `user-docs/` that are deliberately not part of the
 * public agent index.
 *
 * `README.md` is this directory's build/deploy runbook, not a docs page —
 * VitePress drops it via `srcExclude` and the generator ignores it explicitly.
 * `index.md` is the marketing home layout (hero and feature cards), not manual
 * content; it has no article title, so it is skipped rather than indexed as
 * "Untitled". This repo's own `docs/` is never read: the generator's work
 * directory is `user-docs/`, and only this tree is scanned.
 */
export const LLMS_INDEX_EXCLUDED_SOURCES = ["README.md", "index.md"] as const;

export const llmsIndexTemplate = `# {title}

{description}

{details}

Every page below is also published as raw Markdown at the same path with \`.md\` appended — for example ${SITE_ORIGIN}/getting-started.md — while the HTML page stays at ${SITE_ORIGIN}/getting-started. The whole manual in one file: ${SITE_ORIGIN}/llms-full.txt

## Documentation

{toc}`;

export interface DocsPage {
  /** Repo-relative path under `user-docs/`, POSIX separators. */
  source: string;
  /** Raw Markdown URL path (what the generator writes into dist). */
  markdownPath: string;
  /** HTML route path (clean URL; `index.html` for the home page). */
  htmlPath: string;
}

/**
 * Mirror the plugin's page path rules: append `.md` to the source path, but
 * collapse a nested `dir/index.md` to `dir.md` (that is the generator's
 * route-shaped raw URL). Flat pages are unchanged.
 */
export function rawMarkdownPath(source: string): string {
  const sourcePosix = source.split(path.sep).join("/");
  const dir = path.posix.dirname(sourcePosix);
  if (path.posix.basename(sourcePosix) === "index.md" && dir !== ".") {
    return `${dir}.md`;
  }
  return sourcePosix;
}

/** Every Markdown page VitePress publishes, excluding the recorded skips. */
export function discoverDocsPages(docsRoot: string): DocsPage[] {
  const excluded = new Set<string>(LLMS_INDEX_EXCLUDED_SOURCES);
  const pages: DocsPage[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      const source = path.relative(docsRoot, absolute).split(path.sep).join("/");
      if (excluded.has(source)) continue;
      const markdownPath = rawMarkdownPath(source);
      pages.push({
        source,
        markdownPath,
        htmlPath: markdownPath.replace(/\.md$/, ".html"),
      });
    }
  };

  walk(docsRoot);
  return pages.sort((a, b) => a.source.localeCompare(b.source));
}
