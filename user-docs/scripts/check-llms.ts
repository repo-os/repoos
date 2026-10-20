#!/usr/bin/env bun
/**
 * Build assertion for the agent-facing docs outputs.
 *
 * Runs after `vitepress build`. Fails when a page under `user-docs/` is missing
 * from `/llms.txt`, `/llms-full.txt`, or its raw `.md` copy — the case that
 * silently happens when someone adds a page and forgets whatever allowlist.
 * It also resolves every docs link in `llms.txt`: a raw `.md` link must not
 * replace its HTML route, and every HTML route must still exist. The only pages
 * allowed to be absent are recorded in `.vitepress/llms-index.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LLMS_INDEX_EXCLUDED_SOURCES,
  SITE_ORIGIN,
  discoverDocsPages,
} from "../.vitepress/llms-index";

export interface LlmsCheckOptions {
  docsRoot?: string;
  distRoot?: string;
}

const defaultDocsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Map a site-relative URL path (no leading slash, no query or hash) to the file
 * the docs build wrote for it. Returns the dist-relative path, or null.
 */
export function resolveDocsOutput(distRoot: string, route: string): string | null {
  const clean = decodeURIComponent(route).replace(/^\/+/, "").replace(/\/+$/, "");
  if (clean === "") {
    return existsSync(path.join(distRoot, "index.html")) ? "index.html" : null;
  }
  if (/\.[A-Za-z0-9]+$/.test(clean)) {
    return existsSync(path.join(distRoot, clean)) ? clean : null;
  }
  const html = `${clean}.html`;
  if (existsSync(path.join(distRoot, html))) return html;
  const nested = `${clean}/index.html`;
  if (existsSync(path.join(distRoot, nested))) return nested;
  return null;
}

/** Every failure for the generated llms outputs. */
export function collectLlmsFailures(options: LlmsCheckOptions = {}): string[] {
  const docsRoot = options.docsRoot ?? defaultDocsRoot;
  const distRoot = options.distRoot ?? path.join(docsRoot, ".vitepress", "dist");
  const failures: string[] = [];

  const fail = (message: string): void => {
    failures.push(message);
  };

  const readDist = (file: string): string => {
    const absolute = path.join(distRoot, file);
    if (!existsSync(absolute)) {
      fail(`missing ${path.relative(docsRoot, absolute)} — run the full build ("bun run build")`);
      return "";
    }
    return readFileSync(absolute, "utf8");
  };

  const llmsTxt = readDist("llms.txt");
  const llmsFull = readDist("llms-full.txt");

  const pages = discoverDocsPages(docsRoot);
  if (pages.length === 0) fail("no Markdown pages found under user-docs/");

  // The home page is a recorded skip from the agent index, but its HTML route
  // must still build.
  if (!existsSync(path.join(distRoot, "index.html"))) {
    fail("home HTML route missing: expected index.html");
  }

  for (const page of pages) {
    const raw = path.join(distRoot, page.markdownPath);
    if (!existsSync(raw)) {
      fail(`raw Markdown missing for ${page.source}: expected ${page.markdownPath}`);
    } else if (!readFileSync(raw, "utf8").includes(`url: ${SITE_ORIGIN}/${page.markdownPath}`)) {
      fail(`raw Markdown for ${page.source} is missing its canonical URL frontmatter`);
    }
    if (!existsSync(path.join(distRoot, page.htmlPath))) {
      fail(`HTML route missing for ${page.source}: expected ${page.htmlPath}`);
    }
    if (!llmsTxt.includes(`](${SITE_ORIGIN}/${page.markdownPath})`)) {
      fail(
        `llms.txt omits ${page.source} (expected a link to ${SITE_ORIGIN}/${page.markdownPath})`,
      );
    }
    if (!llmsFull.includes(`url: ${SITE_ORIGIN}/${page.markdownPath}`)) {
      fail(
        `llms-full.txt omits ${page.source} (expected "url: ${SITE_ORIGIN}/${page.markdownPath}")`,
      );
    }
  }

  // The index must teach an agent how to fetch one page as raw Markdown, and
  // point at the full dump.
  for (const required of ["raw Markdown", `${SITE_ORIGIN}/llms-full.txt`]) {
    if (!llmsTxt.includes(required)) fail(`llms.txt does not mention ${required}`);
  }
  if (!llmsTxt.startsWith("# ") || !/^> /m.test(llmsTxt)) {
    fail("llms.txt is not llmstxt.org-shaped (expected an H1 and a blockquote summary)");
  }

  // The index must list exactly the discovered pages: an unexpected entry means
  // content outside `user-docs/` leaked in, an omitted one is caught above.
  const indexLinks = new Set(
    [...llmsTxt.matchAll(/\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter(
        (url): url is string =>
          url.startsWith(`${SITE_ORIGIN}/`) && url !== `${SITE_ORIGIN}/llms-full.txt`,
      )
      .map((url) => url.slice(SITE_ORIGIN.length + 1)),
  );
  const expectedLinks = new Set(pages.map((page) => page.markdownPath));
  for (const link of indexLinks) {
    if (!expectedLinks.has(link)) fail(`llms.txt has an unexpected entry: ${SITE_ORIGIN}/${link}`);
  }

  // Every docs link in the index must resolve. A raw Markdown link is only safe
  // when its HTML route is still built beside it: `/foo.md` must not be the only
  // representation of `/foo` (that is what "shadowing" the HTML route means).
  const internalLinks = new Set(
    [...llmsTxt.matchAll(/\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter((url) => url.startsWith(SITE_ORIGIN)),
  );
  for (const href of internalLinks) {
    const pathname = href.slice(SITE_ORIGIN.length).split("#")[0].split("?")[0];
    const route = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    const output = resolveDocsOutput(distRoot, route);
    if (output === null) {
      fail(`llms.txt links ${href}, which is not a file in the docs build`);
      continue;
    }
    if (route.endsWith(".md")) {
      const htmlRoute = route.replace(/\.md$/, ".html");
      if (!existsSync(path.join(distRoot, htmlRoute))) {
        fail(
          `raw Markdown link ${href} shadows its HTML route: expected ${htmlRoute} in the docs build`,
        );
      }
    }
  }

  // The recorded skips stay out of every output.
  for (const skipped of LLMS_INDEX_EXCLUDED_SOURCES) {
    if (indexLinks.has(skipped)) fail(`llms.txt still includes the skipped page ${skipped}`);
    if (existsSync(path.join(distRoot, skipped))) {
      fail(`skipped page was published as raw Markdown: ${skipped}`);
    }
  }
  if (new RegExp(`\\]\\(${SITE_ORIGIN}/README\\.md\\)`).test(llmsTxt)) {
    fail("README.md (the build runbook) leaked into llms.txt");
  }
  // Decided in the task body: no concrete client reads agents.txt yet.
  if (existsSync(path.join(distRoot, "agents.txt"))) {
    fail("agents.txt is not part of the agreed output set");
  }

  return failures;
}

if (import.meta.main) {
  const failures = collectLlmsFailures();
  if (failures.length > 0) {
    console.error("\nllms index check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  const pages = discoverDocsPages(defaultDocsRoot);
  console.log(
    `llms index check passed: ${pages.length} pages in llms.txt, llms-full.txt, and raw Markdown ` +
      `(skipped: ${LLMS_INDEX_EXCLUDED_SOURCES.join(", ")})`,
  );
}
