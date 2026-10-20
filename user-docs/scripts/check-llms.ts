#!/usr/bin/env bun
/**
 * Build assertion for the agent-facing docs outputs.
 *
 * Runs after `vitepress build`. Fails when a page under `user-docs/` is missing
 * from `/llms.txt`, `/llms-full.txt`, or its raw `.md` copy — the case that
 * silently happens when someone adds a page and forgets whatever allowlist.
 * The only pages allowed to be absent are recorded in
 * `.vitepress/llms-index.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  LLMS_INDEX_EXCLUDED_SOURCES,
  SITE_ORIGIN,
  discoverDocsPages,
} from "../.vitepress/llms-index";

const docsRoot = path.resolve(import.meta.dir, "..");
const distRoot = path.join(docsRoot, ".vitepress", "dist");
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
    fail(`llms.txt omits ${page.source} (expected a link to ${SITE_ORIGIN}/${page.markdownPath})`);
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

if (failures.length > 0) {
  console.error("\nllms index check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `llms index check passed: ${pages.length} pages in llms.txt, llms-full.txt, and raw Markdown ` +
    `(skipped: ${LLMS_INDEX_EXCLUDED_SOURCES.join(", ")})`,
);
