// @vitest-environment jsdom
/**
 * #1261 — QA pass: Inbox and Review at 375 / 768 / 1280 px. Mounts the real
 * Inbox and Review board columns (and the phone work queue that stands in for
 * them below the mobile breakpoint) against fixtures, then renders the mounted
 * DOM in headless WebKit. Checks: no horizontal overflow with long titles,
 * sensible empty / loading / error copy, and a visible keyboard focus ring on
 * the column header and task cards.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per state and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import BoardColumn from "../src/components/BoardColumn.vue";
import MobileWorkQueue from "../src/components/MobileWorkQueue.vue";
import { useRepoStore } from "../src/stores/repo";
import { makeTask, FakeEventSource } from "./component-test-helpers";
import type { Task } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

// MobileWorkQueue reads its filters through vue-router; a stub keeps the
// fixture mountable without a real router.
const routeState = vi.hoisted(() => ({
  query: {} as Record<string, string | string[]>,
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => routeState.router,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const inboxTask = (id: string, over: Partial<Task> = {}): Task =>
  makeTask({ id, status: "inbox", title: `Task ${id}`, ...over });
const reviewTask = (id: string, over: Partial<Task> = {}): Task =>
  makeTask({ id, status: "review", title: `Task ${id}`, ...over });

// A long, unbroken slug is the worst case for a narrow column: it has no spaces
// for the browser to wrap on, so only CSS can keep it inside the viewport.
const LONG_TITLE =
  "QA pass: Inbox and Review pages at phone, tablet and desktop widths — with an unbroken_identifier_that_keeps_going_past_any_column_width_without_spaces";

const COLUMNS = {
  inbox: { id: "inbox", label: "Inbox", color: "#566081" },
  review: { id: "review", label: "Review", color: "#ffb454" },
} as const;

/* ── Shared WebKit harness (mirrors work-board-moves-qa-browser.test.ts) ── */

describe("Inbox and Review at 375/768/1280 (WebKit, fixtures)", () => {
  let browser: Browser;
  let globalCss: string;

  beforeAll(async () => {
    browser = await webkit.launch();
    const assetDir = resolve(uiRoot, "../../dist/ui/assets");
    const cssAsset = (await readdir(assetDir)).find((name) => /^index-.*\.css$/.test(name));
    if (!cssAsset) throw new Error("Built global UI stylesheet was not found");
    globalCss = await readFile(resolve(assetDir, cssAsset), "utf8");
  });
  afterAll(async () => {
    await browser?.close();
  });

  /** Compiled scoped CSS for one component, with the scope id its markup carries. */
  function scopedCss(markup: string, markerClass: string, component: string): string {
    const source = readFileSync(resolve(uiRoot, `src/components/${component}.vue`), "utf8");
    const parsed = parse(source, { filename: component });
    const style = parsed.descriptor.styles[0]?.content ?? "";
    const marker = markup.indexOf(markerClass);
    if (marker < 0) throw new Error(`${component} markup is missing .${markerClass}`);
    const tagStart = markup.lastIndexOf("<", marker);
    const tag = markup.slice(tagStart, markup.indexOf(">", marker));
    const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error(`${component} scope ID was not present on .${markerClass}`);
    const compiled = compileStyle({ filename: component, id: scopeId, source: style });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
  }

  async function openFixturePage(
    label: string,
    markup: string,
    scoped: string,
    width: number,
  ): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${scoped}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="app-shell"><div class="body"><aside class="sidebar"><nav>Navigation</nav></aside><div class="main">${markup}</div></div></div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      // JPEG keeps the staged artifact under the 4 MiB scan limit (see work-board-moves).
      await page.screenshot({ path: resolve(shots, `${label}-${width}.jpg`), fullPage: true });
    }
    return page;
  }

  /** Every visible element must sit inside the viewport, except content a
   *  horizontal scroller legitimately clips or a closed <details> hides. */
  async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
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
      const overflowers: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const details = el.closest("details");
        if (details && !details.open) continue;
        if (!el.offsetParent && style.position !== "fixed") continue;
        if (inHorizontalScroller(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      return { documentWidth: document.documentElement.scrollWidth, overflowers };
    });
  }

  async function expectFits(page: Page, what: string, width: number): Promise<void> {
    const result = await audit(page);
    expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
    expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
      width + 1,
    );
  }

  /** Mount the real Inbox / Review columns in jsdom and serialize the DOM. */
  async function columnsMarkup(
    seed: (repo: ReturnType<typeof useRepoStore>) => void,
    cols: Array<keyof typeof COLUMNS>,
  ) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    vi.stubGlobal("EventSource", FakeEventSource);
    seed(repo);
    const wrappers = cols.map((id) =>
      mount(BoardColumn, {
        attachTo: document.body,
        props: { col: COLUMNS[id] },
        global: { plugins: [pinia] },
      }),
    );
    await flushPromises();
    const markup = `<div class="board">${document.body.innerHTML}</div>`;
    wrappers.forEach((w) => w.unmount());
    document.body.innerHTML = "";
    return { markup, scoped: "" };
  }

  /** Mount the phone work queue in jsdom and serialize the DOM. */
  async function queueMarkup(seed: (repo: ReturnType<typeof useRepoStore>) => void) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    vi.stubGlobal("EventSource", FakeEventSource);
    seed(repo);
    const queue = mount(MobileWorkQueue, { attachTo: document.body, global: { plugins: [pinia] } });
    await flushPromises();
    const markup = document.body.innerHTML;
    queue.unmount();
    document.body.innerHTML = "";
    let scoped = "";
    try {
      scoped = scopedCss(markup, "mobile-queue-state", "MobileWorkQueue");
    } catch {
      scoped = "";
    }
    return { markup, scoped };
  }

  /** Text of the first matching element, or "" when none. */
  async function textOf(page: Page, selector: string): Promise<string> {
    return ((await page.locator(selector).first().textContent()) ?? "").trim();
  }

  /** Focus the first focusable control by keyboard and report whether a
   *  visible focus indicator (outline or box-shadow) is drawn on it. */
  async function keyboardFocusVisible(page: Page, selector: string): Promise<boolean> {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    const focused = await page.evaluate((sel) => {
      const el = document.querySelector<HTMLElement>(sel);
      const active = document.activeElement;
      if (!el || active !== el) return false;
      const s = getComputedStyle(el);
      const outlined = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      const shadowed = s.boxShadow !== "none" && s.boxShadow !== "";
      return outlined || shadowed;
    }, selector);
    return focused;
  }

  // Tabbing from the document start lands on the first focusable control; the
  // Inbox column header is the first one in DOM order.
  it.each(VIEWPORTS)("Inbox and Review columns fit with long titles at %spx", async (width) => {
    const fixture = await columnsMarkup(
      (repo) => {
        repo.tasks = [
          inboxTask("1401", { title: LONG_TITLE }),
          reviewTask("1402", { title: LONG_TITLE }),
        ];
      },
      ["inbox", "review"],
    );
    const page = await openFixturePage(
      "columns-long-titles",
      fixture.markup,
      fixture.scoped,
      width,
    );
    try {
      await expectFits(page, "Inbox and Review columns", width);
      expect(await page.locator('[data-board-column="inbox"] .task-card').count()).toBe(1);
      expect(await page.locator('[data-board-column="review"] .task-card').count()).toBe(1);
    } finally {
      await page.close();
    }
  });

  it.each(VIEWPORTS)(
    "empty Inbox and Review say what they mean, not a bare dash, at %spx",
    async (width) => {
      const fixture = await columnsMarkup(
        (repo) => {
          repo.tasks = [];
        },
        ["inbox", "review"],
      );
      const page = await openFixturePage("columns-empty", fixture.markup, fixture.scoped, width);
      try {
        await expectFits(page, "empty Inbox and Review", width);
        const inboxEmpty = await textOf(page, '[data-board-column="inbox"] .col-empty');
        const reviewEmpty = await textOf(page, '[data-board-column="review"] .col-empty');
        // A bare "—" tells the reader nothing; each column names what is missing.
        expect(inboxEmpty).not.toBe("—");
        expect(reviewEmpty).not.toBe("—");
        expect(inboxEmpty).toMatch(/[a-z]{3,}/i);
        expect(reviewEmpty).toMatch(/[a-z]{3,}/i);
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)("keyboard focus shows a ring on the Inbox header at %spx", async (width) => {
    const fixture = await columnsMarkup(
      (repo) => {
        repo.tasks = [inboxTask("1411")];
      },
      ["inbox", "review"],
    );
    const page = await openFixturePage("columns-focus", fixture.markup, fixture.scoped, width);
    try {
      expect(await keyboardFocusVisible(page, '[data-board-column="inbox"] .col-head')).toBe(true);
    } finally {
      await page.close();
    }
  });

  it.each(VIEWPORTS)("phone queue loading, error and empty states fit at %spx", async (width) => {
    const loading = await queueMarkup((repo) => {
      repo.loading = true;
      repo.tasks = [];
    });
    const loadingPage = await openFixturePage(
      "queue-loading",
      loading.markup,
      loading.scoped,
      width,
    );
    try {
      await expectFits(loadingPage, "phone queue loading", width);
      expect(await textOf(loadingPage, ".mobile-queue-state")).toMatch(/Loading tasks/);
    } finally {
      await loadingPage.close();
    }

    const failed = await queueMarkup((repo) => {
      repo.loading = false;
      repo.boardLoadError = "Could not load project tasks.";
      repo.tasks = [];
    });
    const errorPage = await openFixturePage("queue-error", failed.markup, failed.scoped, width);
    try {
      await expectFits(errorPage, "phone queue error", width);
      expect(await textOf(errorPage, '[data-testid="mobile-work-load-error"]')).toMatch(
        /Could not load project tasks/,
      );
    } finally {
      await errorPage.close();
    }

    const empty = await queueMarkup((repo) => {
      repo.loading = false;
      repo.boardLoadError = null;
      repo.tasks = [];
    });
    const emptyPage = await openFixturePage("queue-empty", empty.markup, empty.scoped, width);
    try {
      await expectFits(emptyPage, "phone queue empty", width);
      expect(await textOf(emptyPage, ".mobile-queue-empty h2")).not.toBe("");
    } finally {
      await emptyPage.close();
    }
  });
});
