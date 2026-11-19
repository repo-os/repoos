#!/usr/bin/env bun
/**
 * Build assertion for internal links on the built docs site.
 *
 * Runs after `vitepress build`. VitePress is configured with
 * `ignoreDeadLinks: [/^\.{1,2}\//]`, so a relative link that escapes the site
 * (for example `../docs/x.md`) and a bad `#anchor` are not caught at build
 * time. This walks every rendered page in `.vitepress/dist` and checks each
 * internal `href` and `src` the way a browser would resolve it on the published
 * site: the target file must exist, and a `#fragment` must match an `id` or
 * `name` on the target page. External URLs are out of scope.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface BrokenLink {
  page: string;
  href: string;
  reason: string;
}

export interface LinkCheckResult {
  checked: number;
  broken: BrokenLink[];
}

const defaultDocsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Base for resolving relative hrefs. Only the path matters: the origin is a
// placeholder so `new URL()` can do RFC 3986 resolution (`./`, `../`, `#x`).
const ORIGIN = "https://docs.invalid";

const ATTRIBUTE = /\s(?:href|src)="([^"]*)"/g;
const EXTERNAL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Every `.html` file under `dir`, as dist-relative POSIX paths. */
export function listHtmlFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listHtmlFiles(dir, rel));
    else if (entry.name.endsWith(".html")) files.push(rel);
  }
  return files.sort();
}

/**
 * The URL path a built page is served at (cleanUrls): `index.html` is `/`,
 * `guide/index.html` is `/guide/`, and `guide.html` is `/guide`. Relative links
 * on a page resolve against this path, as they do in a browser.
 */
export function pageUrlPath(rel: string): string {
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel.replace(/\.html$/, "")}`;
}

/**
 * Map a URL pathname to the dist-relative file that serves it, or null when no
 * such file exists. Mirrors how the static host resolves clean URLs.
 */
export function resolveTargetFile(distRoot: string, pathname: string): string | null {
  const clean = decodeSafely(pathname);
  const candidates = clean.endsWith("/")
    ? [`${clean}index.html`]
    : /\.[A-Za-z0-9]+$/.test(clean)
      ? [clean]
      : [`${clean}.html`, `${clean}/index.html`];
  for (const candidate of candidates) {
    const file = path.join(distRoot, candidate);
    // Refuse anything that resolves outside the built site.
    if (!file.startsWith(distRoot + path.sep)) continue;
    if (isFile(file)) return path.relative(distRoot, file).split(path.sep).join("/");
  }
  return null;
}

/** Whether an `href`/`src` value points inside the site and so must resolve. */
export function isInternalHref(href: string): boolean {
  if (href === "" || href.startsWith("//")) return false;
  return !EXTERNAL_SCHEME.test(href);
}

/** Every `href`/`src` attribute value in a rendered page, entities decoded. */
export function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const match of html.matchAll(ATTRIBUTE)) hrefs.push(decodeEntities(match[1]));
  return hrefs;
}

/** Whether a rendered page has an element with this `id` or `name`. */
export function hasAnchor(html: string, fragment: string): boolean {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\s(?:id|name)="${escaped}"`).test(html);
}

/** Check every internal link on every page of a built docs site. */
export function checkDocsLinks(distRoot: string): LinkCheckResult {
  const pages = listHtmlFiles(distRoot);
  const htmlCache = new Map<string, string>();
  const readPage = (rel: string): string => {
    let html = htmlCache.get(rel);
    if (html === undefined) {
      html = readFileSync(path.join(distRoot, rel), "utf8");
      htmlCache.set(rel, html);
    }
    return html;
  };

  const broken: BrokenLink[] = [];
  let checked = 0;
  for (const page of pages) {
    const base = `${ORIGIN}${pageUrlPath(page)}`;
    for (const href of extractHrefs(readPage(page))) {
      if (!isInternalHref(href)) continue;
      checked += 1;
      const url = new URL(href, base);
      const fragment = decodeSafely(url.hash.slice(1));

      // A bare `#anchor` points at the page it is on.
      const target = href.startsWith("#") ? page : resolveTargetFile(distRoot, url.pathname);
      if (target === null) {
        broken.push({ page, href, reason: "no page or file at this path" });
        continue;
      }
      if (fragment !== "" && target.endsWith(".html") && !hasAnchor(readPage(target), fragment)) {
        broken.push({ page, href, reason: `no element with id "${fragment}" on ${target}` });
      }
    }
  }
  return { checked, broken };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const distRoot = path.join(defaultDocsRoot, ".vitepress", "dist");
  const { checked, broken } = checkDocsLinks(distRoot);
  if (broken.length > 0) {
    console.error(`\nlink check failed: ${broken.length} broken of ${checked} internal links`);
    for (const link of broken) {
      console.error(`  - ${link.page}: ${link.href} (${link.reason})`);
    }
    process.exit(1);
  }
  console.log(`link check passed: ${checked} internal links resolve`);
}
