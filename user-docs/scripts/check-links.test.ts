import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkDocsLinks,
  extractHrefs,
  hasAnchor,
  isInternalHref,
  pageUrlPath,
  resolveTargetFile,
} from "./check-links";

let root: string;

// Write a fixture site: a map of dist-relative path → file body.
function writeSite(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "docs-links-"));
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  return dir;
}

const page = (body: string) => `<html><body>${body}</body></html>`;

beforeAll(() => {
  root = writeSite({
    "index.html": page('<a href="/guide">guide</a><a href="/">home</a>'),
    "guide.html": page(
      '<h2 id="setup">Setup</h2><a href="#setup">same page</a><a href="./">up</a>' +
        '<a href="/guide.html#setup">explicit file</a><a href="/logo.svg">asset</a>',
    ),
    "guide/index.html": page('<a href="../guide#setup">nested</a><a href="/missing">gone</a>'),
    "logo.svg": "<svg/>",
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("pageUrlPath", () => {
  test.each([
    ["index.html", "/"],
    ["guide.html", "/guide"],
    ["guide/index.html", "/guide/"],
    ["a/b/c.html", "/a/b/c"],
  ])("%s is served at %s", (file, url) => {
    expect(pageUrlPath(file)).toBe(url);
  });
});

describe("resolveTargetFile", () => {
  test.each([
    ["/", "index.html"],
    ["/guide", "guide.html"],
    ["/guide/", "guide/index.html"],
    ["/guide.html", "guide.html"],
    ["/logo.svg", "logo.svg"],
    ["/missing", null],
    ["/logo.svg/extra", null],
    ["/../../etc/passwd", null],
  ])("%s resolves to %s", (pathname, expected) => {
    expect(resolveTargetFile(root, pathname)).toBe(expected);
  });
});

describe("isInternalHref", () => {
  test.each([
    ["/guide", true],
    ["./guide", true],
    ["../docs/x.md", true],
    ["#anchor", true],
    ["https://example.com", false],
    ["mailto:hi@example.com", false],
    ["//cdn.example.com/x.js", false],
    ["", false],
  ])("%j internal: %s", (href, expected) => {
    expect(isInternalHref(href)).toBe(expected);
  });
});

describe("extractHrefs", () => {
  test("reads href and src attributes and decodes entities", () => {
    const html = '<a href="/a?x=1&amp;y=2">a</a><img src="/i.png"><link rel="x" href="/s.css">';
    expect(extractHrefs(html)).toEqual(["/a?x=1&y=2", "/i.png", "/s.css"]);
  });
});

describe("hasAnchor", () => {
  test("matches id or name exactly, not a prefix", () => {
    const html = '<h2 id="setup-2">x</h2><a name="old">y</a>';
    expect(hasAnchor(html, "setup")).toBe(false);
    expect(hasAnchor(html, "setup-2")).toBe(true);
    expect(hasAnchor(html, "old")).toBe(true);
  });
});

describe("checkDocsLinks", () => {
  test("passes a site whose internal links all resolve", () => {
    const dir = writeSite({
      "index.html": page('<a href="/guide">g</a><a href="/guide#setup">s</a>'),
      "guide.html": page('<h2 id="setup">S</h2><a href="#setup">x</a><a href="/">home</a>'),
    });
    try {
      const result = checkDocsLinks(dir);
      expect(result.broken).toEqual([]);
      expect(result.checked).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reports missing pages, escaped repo links, and missing fragments", () => {
    const dir = writeSite({
      "index.html": page(
        '<a href="/missing">a</a><a href="../docs/x.md">b</a><a href="/guide#gone">c</a>',
      ),
      "guide.html": page('<h2 id="setup">S</h2><a href="#nope">d</a>'),
    });
    try {
      const { broken } = checkDocsLinks(dir);
      expect(broken.map((b) => [b.page, b.href])).toEqual([
        ["guide.html", "#nope"],
        ["index.html", "/missing"],
        ["index.html", "../docs/x.md"],
        ["index.html", "/guide#gone"],
      ]);
      expect(broken[0].reason).toContain('id "nope"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignores external links and resolves relative links from the served URL", () => {
    const dir = writeSite({
      "guide/index.html": page(
        '<a href="https://github.com/x">ext</a><a href="../setup">rel</a><a href="setup">sib</a>',
      ),
      "setup.html": page("x"),
      "guide/setup.html": page("x"),
    });
    try {
      const { checked, broken } = checkDocsLinks(dir);
      expect(checked).toBe(2);
      expect(broken).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
