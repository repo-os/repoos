// @vitest-environment jsdom
/**
 * #1268 — QA pass: the Docs reader and doc tree at 375 / 768 / 1280 px.
 *
 * The real Context view is mounted in jsdom with a seeded docs store, then the
 * serialized markup is injected into headless WebKit with the built global
 * stylesheet and the scoped CSS of the SFCs it renders. Each width must pass a
 * no-overflow audit with long unbroken paths, a markdown body full of wide
 * tables, code and long links, and a plain-text doc with one very long line.
 * Doc tree rows must be real buttons and show a focus ring when reached by
 * keyboard.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ContextView from "../src/views/ContextView.vue";
import { useDocsStore } from "../src/stores/docs";
import { router as appRouter } from "../src/router";
import type { DocMeta } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

/** The built global stylesheet: the app shell and `.md-rendered` are global. */
function builtGlobalCss(): string {
  const dir = resolve(uiRoot, "../../dist/ui/assets");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".css") && f.startsWith("index-"));
  } catch {
    throw new Error(
      "dist/ui/assets was not found — run `bun run build` before the QA browser tests",
    );
  }
  if (!files.length) {
    throw new Error("Built global UI stylesheet was not found — run `bun run build`");
  }
  // A stale build would validate yesterday's CSS without any sign of it.
  const source = resolve(uiRoot, "src/style.css");
  for (const f of files) {
    if (statSync(resolve(dir, f)).mtimeMs < statSync(source).mtimeMs) {
      throw new Error("dist/ui predates src/style.css — run `bun run build:ui` first");
    }
  }
  return files.map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
}

/** Scoped CSS for one SFC, compiled against the data-v id the markup carries. */
function scopedCss(component: string, source: string, markup: string, markerClass: string): string {
  if (!markup.includes(markerClass)) return "";
  const parsed = parse(source, { filename: component });
  const marker = markup.indexOf(markerClass);
  const tagStart = markup.lastIndexOf("<", marker);
  const tag = markup.slice(tagStart, markup.indexOf(">", marker));
  const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
  if (!scopeId) throw new Error(`${component} scope ID was not present on .${markerClass}`);
  return parsed.descriptor.styles
    .map((block) => {
      const compiled = compileStyle({
        filename: component,
        id: scopeId,
        source: block.content,
        scoped: true,
      });
      if (compiled.errors.length) throw compiled.errors[0]!;
      return compiled.code;
    })
    .join("\n");
}

const contextSource = readFileSync(resolve(uiRoot, "src/views/ContextView.vue"), "utf8");

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/** A long unbroken folder and file name: the worst case for the doc tree. */
const LONG_DIR = `deeply-nested-${"segment-".repeat(6)}folder`;
const LONG_FILE = `very-long-unbroken-doc-name-${"x".repeat(120)}`;

const DOCS: DocMeta[] = [
  { path: "docs/README.md", title: "Docs index", mtimeMs: 0 },
  {
    path: `docs/${LONG_DIR}/${LONG_FILE}.md`,
    title: `A doc title that is long enough to wrap onto several lines in the reader header ${LONG_FILE}`,
    mtimeMs: 0,
  },
  { path: "docs/plain/notes.txt", title: "Plain notes", mtimeMs: 0 },
  {
    path: "docs/adr/0001-a-decision-with-a-deliberately-long-file-name.md",
    title: "ADR",
    mtimeMs: 0,
  },
];

const LONG_URL = `https://example.com/${"path-segment/".repeat(12)}end?query=${"q".repeat(90)}`;

/** Markdown exercising every block the reader must wrap: long prose, an
 *  unbroken token, inline and fenced code with long lines, a six-column table
 *  with long cells, a long link and internal links to real routes. */
const MARKDOWN_BODY = [
  "# A heading that runs long enough to need a second line on a phone-width reader",
  "",
  `A paragraph with an unbroken token ${"y".repeat(150)} and inline code \`${"z".repeat(120)}\` that must wrap instead of widening the reader.`,
  "",
  `See [the long reference](${LONG_URL}) and the [agents page](/agents) and [settings](/settings).`,
  "",
  "| Column one | Column two | Column three | Column four | Column five | Column six |",
  "| --- | --- | --- | --- | --- | --- |",
  `| ${"a".repeat(40)} | short | a cell with several ordinary words that wrap | ${"b".repeat(60)} | c | d |`,
  "",
  "```",
  `const longCodeLine = "${"c".repeat(200)}";`,
  "```",
  "",
  "- A list item that is long enough to wrap onto a second line in the body of the reader.",
].join("\n");

const PLAIN_BODY = `${"plain text with a very long unbroken line ".repeat(3)}${"p".repeat(200)}\nsecond line`;

/* ── Mount helpers (real ContextView, jsdom) ─────────────────────────────── */

async function mountDocsReader(
  selectPath: string,
  body: string,
  options: { expandAll?: boolean } = {},
): Promise<{ markup: string; treeRows: string[] }> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => ({}),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const pinia = createPinia();
  setActivePinia(pinia);
  const docs = useDocsStore();
  docs.docs = DOCS;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/repo", component: { template: "<div />" } }],
  });
  await router.push("/repo");
  await router.isReady();
  const wrapper = mount(ContextView, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: {
        teleport: true,
        SearchOverlay: true,
        NewDocPanel: true,
        NewSkillPanel: true,
        RepoHistoryPanel: true,
      },
    },
  });
  await flushPromises();
  if (options.expandAll) {
    // Open every folder so the deepest rows are on screen, as a reader would.
    for (let i = 0; i < 5; i += 1) {
      const dirs = wrapper.findAll(".tree-dir");
      if (!dirs.length) break;
      for (const dir of dirs) await dir.trigger("click");
      await flushPromises();
    }
  }
  await docs.loadDoc(selectPath);
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  const markup = document.body.innerHTML;
  const treeRows = wrapper.findAll(".tree-item").map((row) => row.element.tagName);
  wrapper.unmount();
  document.body.innerHTML = "";
  return { markup, treeRows };
}

function contextCss(markup: string): string {
  return scopedCss("ContextView.vue", contextSource, markup, "doc-view");
}

/** The Docs page has no `.doc-view` scoped rules outside ContextView itself. */
function isLiveRoute(href: string): boolean {
  const { matched } = appRouter.resolve(href);
  return matched.length > 0 && !matched.some((record) => record.path === "/:pathMatch(.*)*");
}

/* ── Tree rows are real buttons (jsdom, no browser needed) ──────────────── */

describe("#1268 Docs reader: doc tree rows are keyboard-reachable buttons", () => {
  it.each([
    ["a markdown doc", "docs/README.md", MARKDOWN_BODY],
    ["a plain-text doc", "docs/plain/notes.txt", PLAIN_BODY],
  ])("every tree row is a button when %s is open", async (_label, path, body) => {
    const { treeRows } = await mountDocsReader(path, body, { expandAll: true });
    expect(treeRows.length).toBeGreaterThan(0);
    expect(treeRows.filter((tag) => tag !== "BUTTON")).toEqual([]);
  });
});

/* ── Browser audit (headless WebKit, fixtures) ──────────────────────────── */

describe.skipIf(!existsSync(webkit.executablePath()))(
  "#1268 Docs reader QA at 375/768/1280 (WebKit, fixtures)",
  () => {
    let browser: Browser;
    let css: string;

    beforeAll(async () => {
      browser = await webkit.launch();
      css = builtGlobalCss();
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function openFixturePage(label: string, markup: string, width: number): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<style>${css}</style><style>${contextCss(markup)}</style>` +
          `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
          `<div class="app-shell"><div class="body"><div class="main">${markup}</div></div></div>`,
      );
      const shots = process.env.QA_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
      }
      return page;
    }

    /** Every visible element must sit inside the viewport, and every control
     *  must be fully visible inside any clipping box (the same rules as #1237). */
    async function audit(page: Page): Promise<{
      documentWidth: number;
      overflowers: string[];
      clippedControls: string[];
      links: string[];
    }> {
      return page.evaluate(() => {
        const vw = window.innerWidth;
        const inHorizontalScroller = (start: Element | null): boolean => {
          for (let el: HTMLElement | null = start as HTMLElement; el; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (
              (s.overflowX === "auto" || s.overflowX === "scroll") &&
              el.scrollWidth > el.clientWidth + 1
            )
              return true;
          }
          return false;
        };
        const describe = (el: Element): string =>
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""}`;
        const overflowers: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (!el.offsetParent && style.position !== "fixed") continue;
          if (inHorizontalScroller(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > vw + 1 || rect.left < -1) {
            const text = (el.textContent ?? "").trim().slice(0, 30);
            overflowers.push(
              `${describe(el)} "${text}" at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
            );
          }
        }
        const clippedControls: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>(
          "button, a[href], select, input, [role='button']",
        )) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (!el.offsetParent && style.position !== "fixed") continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) {
              const box = p.getBoundingClientRect();
              if (rect.left < box.left - 1 || rect.right > box.right + 1) {
                clippedControls.push(
                  `${describe(el)} "${(el.textContent ?? "").trim().slice(0, 30)}" clipped by ${describe(p)}`,
                );
                break;
              }
            }
            if (ps.position === "fixed") break;
          }
        }
        const links = Array.from(
          document.body.querySelectorAll("a[href^='/']"),
          (a) => a.getAttribute("href") ?? "",
        );
        return {
          documentWidth: document.documentElement.scrollWidth,
          overflowers,
          clippedControls,
          links,
        };
      });
    }

    async function expectFits(page: Page, what: string, width: number): Promise<void> {
      const result = await audit(page);
      expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
      expect(result.clippedControls, `${what} at ${width}px clips a control`).toEqual([]);
      expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
        width + 1,
      );
      const dead = result.links.filter((href) => !isLiveRoute(href));
      expect(dead, `${what} at ${width}px links to a route that does not exist`).toEqual([]);
    }

    it.each(VIEWPORTS)(
      "a markdown doc with long tokens, tables and code fits at %spx",
      async (width) => {
        const { markup } = await mountDocsReader(DOCS[1]!.path, MARKDOWN_BODY, {
          expandAll: true,
        });
        const page = await openFixturePage("docs-markdown", markup, width);
        try {
          await expectFits(page, "markdown doc", width);
          // The title must read as words, not a one-letter column (#1268).
          const titleWidth = await page.evaluate(() => {
            const title = document.querySelector(".doc-title");
            return title ? Math.round(title.getBoundingClientRect().width) : 0;
          });
          expect(titleWidth, `doc title column at ${width}px is too narrow`).toBeGreaterThan(160);
        } finally {
          await page.close();
        }
      },
    );

    it.each(VIEWPORTS)("a plain-text doc with one very long line fits at %spx", async (width) => {
      const { markup } = await mountDocsReader(DOCS[2]!.path, PLAIN_BODY, { expandAll: true });
      const page = await openFixturePage("docs-plain", markup, width);
      try {
        await expectFits(page, "plain-text doc", width);
      } finally {
        await page.close();
      }
    });

    it.each(VIEWPORTS)(
      "a deeply nested doc tree with long folder and file names fits at %spx",
      async (width) => {
        const { markup } = await mountDocsReader(DOCS[1]!.path, MARKDOWN_BODY, {
          expandAll: true,
        });
        const page = await openFixturePage("docs-tree", markup, width);
        try {
          await expectFits(page, "doc tree", width);
        } finally {
          await page.close();
        }
      },
    );

    it.each(VIEWPORTS)(
      "a doc tree row shows a visible focus ring when reached by keyboard at %spx",
      async (width) => {
        const { markup } = await mountDocsReader(DOCS[0]!.path, MARKDOWN_BODY, {
          expandAll: true,
        });
        const page = await openFixturePage("docs-focus", markup, width);
        try {
          // A keyboard press first, so the browser treats the next programmatic
          // focus as keyboard focus (:focus-visible), as a Tab press would.
          await page.keyboard.press("Tab");
          const ring = await page.evaluate(() => {
            const row = document.querySelector<HTMLElement>(".tree-item");
            if (!row) return null;
            row.focus();
            const style = getComputedStyle(row);
            return {
              tag: row.tagName,
              focusVisible: row.matches(":focus-visible"),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              boxShadow: style.boxShadow,
            };
          });
          expect(ring, "doc tree must render a row").not.toBeNull();
          expect(ring!.tag, "doc tree row must be a button").toBe("BUTTON");
          expect(ring!.focusVisible, "focused row must match :focus-visible").toBe(true);
          const hasRing =
            (ring!.outlineStyle !== "none" && ring!.outlineWidth !== "0px") ||
            ring!.boxShadow !== "none";
          expect(hasRing, "focused doc tree row must show a ring").toBe(true);
        } finally {
          await page.close();
        }
      },
    );
  },
);
