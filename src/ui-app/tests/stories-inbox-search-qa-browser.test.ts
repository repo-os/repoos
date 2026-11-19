// @vitest-environment jsdom
/**
 * #1237 — QA pass: Stories, Inbox and Search with many items, long titles and
 * zero-result states at 375 / 768 / 1280 px.
 *
 * Every fixture is rendered by the real components in jsdom (seeded stores,
 * real router), then the serialized markup is injected into headless WebKit
 * together with the built global stylesheet plus scoped CSS freshly compiled
 * against the data-v scope ids the mounted markup actually carries. Each width
 * must pass a no-overflow audit; long titles and one very long unbroken token
 * are included so wrapping is exercised, and the empty states must read as
 * plain English.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SearchOverlay from "../src/components/SearchOverlay.vue";
import WorkView from "../src/views/WorkView.vue";
import StoriesView from "../src/views/StoriesView.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { makeTask } from "./component-test-helpers";
import type { StoryDefinitionRecord } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

/** The built global stylesheet: app shell, task cards, board columns and the
 *  search overlay are all global (unscoped) CSS bundled into index. */
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
  return files.map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
}

/**
 * Compiled scoped CSS for one SFC, keyed to the scope id the mounted markup
 * actually carries. The markup is captured from the real mount in jsdom, so its
 * data-v ids are the ones this CSS must match; the built chunk CSS uses the same
 * ids only if build and test roots agree, and jsdom markup + built css do not.
 * Every <style> block of the SFC is compiled (WorkView has three).
 */
function scopedCss(component: string, source: string, markup: string, markerClass: string): string {
  if (!markup.includes(markerClass)) return ""; // component not rendered in this fixture
  const parsed = parse(source, { filename: component });
  const marker = markup.indexOf(markerClass);
  const tagStart = markup.lastIndexOf("<", marker);
  const tag = markup.slice(tagStart, markup.indexOf(">", marker));
  const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
  if (!scopeId) throw new Error(`${component} scope ID was not present on .${markerClass}`);
  const blocks = parsed.descriptor.styles;
  if (!blocks.length) throw new Error(`${component} has no <style> blocks`);
  return blocks
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

const storiesSource = readFileSync(resolve(uiRoot, "src/views/StoriesView.vue"), "utf8");
const workSource = readFileSync(resolve(uiRoot, "src/views/WorkView.vue"), "utf8");
const queueSource = readFileSync(resolve(uiRoot, "src/components/MobileWorkQueue.vue"), "utf8");

/** Scoped CSS for a captured page: every SFC the fixture renders. */
function pageScopedCss(markup: string): string {
  return [
    scopedCss("StoriesView.vue", storiesSource, markup, "story-card"),
    scopedCss("StoriesView.vue", storiesSource, markup, "stories-notice"),
    scopedCss("WorkView.vue", workSource, markup, "work-page"),
    scopedCss("WorkView.vue", workSource, markup, "mobile-detail-state"),
    scopedCss("MobileWorkQueue.vue", queueSource, markup, "mobile-work"),
  ].join("\n");
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/** A long but ordinary multi-word title (the common "many items" case). */
const LONG_TITLE =
  "QA pass for the stories inbox and search pages with a deliberately very long title that has to wrap onto several rows instead of pushing its neighbours off the card";

/** One very long unbroken token — the worst case for CSS wrapping. */
const UNBROKEN = `supercalifragilisticexpialidocious-${"x".repeat(160)}`;

const STORIES_COUNT = 32;
const TASKS_PER_STORY = 8;
/** 32 stories × 8 tagged tasks = 256 story tasks; the Inbox fixtures are 220. */
const INBOX_COUNT = 220;

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function longTitle(i: number): string {
  if (i === 7) return UNBROKEN;
  if (i % 3 === 0) return `${LONG_TITLE} (variant ${i})`;
  return `Task ${i}: QA pass story slice with a moderately long title that still wraps`;
}

function storyTasks(): ReturnType<typeof makeTask>[] {
  const tasks: ReturnType<typeof makeTask>[] = [];
  let id = 1;
  for (let s = 0; s < STORIES_COUNT; s += 1) {
    for (let t = 0; t < TASKS_PER_STORY; t += 1) {
      const i = id;
      const status =
        t === 0 ? "active" : t === 1 ? "review" : t < 5 ? "done" : i % 11 === 0 ? "inbox" : "ready";
      tasks.push(
        makeTask({
          id: String(i).padStart(4, "0"),
          title: longTitle(i),
          status: status as ReturnType<typeof makeTask>["status"],
          story: `QA story ${String(s + 1).padStart(2, "0")}`,
          needsInput: i % 17 === 0,
          updated_at: iso(i),
          areas: ["web", "core"],
        }),
      );
      id += 1;
    }
  }
  return tasks;
}

function storyDefinitions(): StoryDefinitionRecord[] {
  return Array.from({ length: STORIES_COUNT }, (_, s) => {
    const n = s + 1;
    const long = n === 3;
    return {
      key: `qa story ${String(n).padStart(2, "0")}`,
      name: long
        ? `QA story ${n} — cross-area delivery slice for the quarterly platform update, the migration runbook and the launch checklist that all share one story file`
        : `QA story ${n}: ${longTitle(n)}`,
      number: String(n).padStart(4, "0"),
      path: `stories/qa-story-${String(n).padStart(2, "0")}.md`,
      body: long
        ? `A deliberately long first paragraph so the excerpt under the story name has to wrap onto several lines at phone width without pushing the progress bar, the status chips or the live rows out of the card. ${UNBROKEN}`
        : `Scope for QA story ${n}.`,
      createdAt: iso(60 * 24 * (s + 1)),
      updatedAt: iso(60 * s),
      createdBy: "hello@repoos.org",
    };
  });
}

function inboxTasks(): ReturnType<typeof makeTask>[] {
  return Array.from({ length: INBOX_COUNT }, (_, i) => {
    const n = i + 1;
    return makeTask({
      id: String(n).padStart(4, "0"),
      title: longTitle(n),
      status: "inbox",
      priority: n % 4 === 0 ? "p1" : "p2",
      updated_at: iso(n),
      areas: ["web"],
      story: n % 9 === 0 ? `QA story ${String((n % STORIES_COUNT) + 1).padStart(2, "0")}` : undefined,
    });
  });
}

function makeAppRouter(): Router {
  const div = { template: "<div />" };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "dashboard", component: div },
      { path: "/work", name: "work", component: div },
      { path: "/stories", name: "stories", component: div },
      { path: "/repo", name: "repo", component: div },
      { path: "/settings", name: "settings", component: div },
      { path: "/client-board", name: "client-board", component: div },
    ],
  });
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
}

/* ── Mount helpers (real components, jsdom) ──────────────────────────────── */

async function mountStoriesView(
  tasks: ReturnType<typeof makeTask>[],
  definitions: StoryDefinitionRecord[],
  options: { hideCompleted?: boolean; openPanel?: boolean } = {},
): Promise<string> {
  setActivePinia(createPinia());
  const config = useConfigStore();
  config.data = { stories: { enabled: true } };
  const repo = useRepoStore();
  if (options.hideCompleted) repo.setStoriesPageHideCompleted(true);
  repo.tasks = tasks;
  repo.storyDefinitions = definitions;
  const router = makeAppRouter();
  await router.push("/stories");
  await router.isReady();
  const wrapper = mount(StoriesView, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: { NewStoryPanel: true, StoryPanel: options.openPanel !== true },
    },
  });
  await flushPromises();
  if (options.openPanel) {
    // Open the first story's side panel with the real StoryPanel component.
    await wrapper.get("button.story-head").trigger("click");
    await flushPromises();
  }
  await new Promise((r) => setTimeout(r, 0));
  const markup = document.body.innerHTML;
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

async function mountWorkView(
  tasks: ReturnType<typeof makeTask>[],
  query: string,
  options: { narrow?: boolean; beforeCapture?: (wrapper: VueWrapper) => Promise<void> } = {},
): Promise<string> {
  setActivePinia(createPinia());
  const repo = useRepoStore();
  repo.loading = false;
  repo.tasks = tasks;
  repo.counts = { draft: 0, inbox: tasks.length, ready: 0, active: 0, review: 0, done: 0 };
  useConfigStore().loaded = true;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: options.narrow === true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  const router = makeAppRouter();
  await router.push(query);
  await router.isReady();
  const wrapper = mount(WorkView, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: { IntegrationStatusBar: true, PipelineView: true },
    },
  });
  await flushPromises();
  if (options.beforeCapture) await options.beforeCapture(wrapper);
  await new Promise((r) => setTimeout(r, 0));
  const markup = document.body.innerHTML;
  wrapper.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  return markup;
}

async function mountSearchMarkup(query: string, tasks: ReturnType<typeof makeTask>[]): Promise<string> {
  setActivePinia(createPinia());
  const repo = useRepoStore();
  repo.tasks = tasks;
  const router = makeAppRouter();
  await router.push("/");
  await router.isReady();
  const wrapper = mount(SearchOverlay, {
    props: { open: true, scope: "all" as const },
    attachTo: document.body,
    global: { plugins: [router] },
  });
  await flushPromises();
  const input = document.querySelector(".search-overlay-input") as HTMLInputElement;
  input.value = query;
  input.dispatchEvent(new Event("input"));
  // The palette debounces doc-body loads by 200ms; let the render settle.
  await new Promise((r) => setTimeout(r, 300));
  const markup = document.querySelector(".search-overlay-backdrop")!.outerHTML;
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

/* ── The suite ───────────────────────────────────────────────────────────── */

describe.skipIf(!existsSync(webkit.executablePath()))(
  "#1237 Stories / Inbox / Search QA at 375/768/1280 (WebKit, fixtures)",
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

    async function openFixturePage(
      label: string,
      markup: string,
      width: number,
      narrow = false,
    ): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<style>${css}</style><style>${pageScopedCss(markup)}</style>` +
          `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
          `<div class="app-shell${narrow ? " is-narrow" : ""}"><div class="body"><div class="main">${markup}</div></div></div>`,
      );
      const shots = process.env.QA_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
        // A viewport-only capture next to the full-page one: long fixture pages
        // are unreadable as full-page thumbnails, and the fold is what a reader
        // actually sees first.
        await page.screenshot({ path: resolve(shots, `${label}-${width}-fold.png`) });
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
        const inClosedDetails = (el: Element): boolean => {
          const details = el.closest("details");
          return details !== null && !details.open;
        };
        const overflowers: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (inClosedDetails(el)) continue;
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

    /* ── 1. Stories list: 32 cards built from 256 tasks ──────────────────── */

    it.each(VIEWPORTS)(
      "stories list fits at %spx with long names, excerpts and live rows",
      async (width) => {
        stubFetch();
        const markup = await mountStoriesView(storyTasks(), storyDefinitions());
        const page = await openFixturePage("stories-list", markup, width);
        try {
          await expectFits(page, "stories list", width);
          const state = await page.evaluate(() => ({
            cards: document.querySelectorAll(".story-card").length,
            firstName: document.querySelector(".story-name")?.textContent ?? "",
            longestExcerpt: Math.max(
              0,
              ...Array.from(document.querySelectorAll(".story-excerpt")).map((el) =>
                (el.textContent ?? "").length,
              ),
            ),
            chips: document.querySelectorAll(".story-chip").length,
            liveRows: document.querySelectorAll(".story-live-row").length,
            copyLinks: document.querySelectorAll(".story-number-row .copyable-number").length,
            copyLabel:
              document
                .querySelector(".story-number-row .copyable-number")
                ?.getAttribute("aria-label") ?? "",
            toggle: document.querySelector(".stories-filter-toggle")?.textContent ?? "",
          }));
          expect(state.cards).toBe(STORIES_COUNT);
          // Long story names and long excerpts are present and must have wrapped
          // (the audit above is what proves wrapping, not clipping).
          expect(state.firstName).toContain("QA story");
          expect(state.longestExcerpt).toBeGreaterThan(120);
          expect(state.chips).toBeGreaterThan(STORIES_COUNT);
          expect(state.liveRows).toBeGreaterThan(0);
          // The copy-link number chip is a real, labelled control.
          expect(state.copyLinks).toBeGreaterThan(0);
          expect(state.copyLabel).toMatch(/^Copy link to story \d{4}$/);
          // The view controls survived the long content: checkbox label + select.
          expect(state.toggle).toContain("Hide Completed Stories");
        } finally {
          await page.close();
        }
      },
    );

    /* ── 2. Stories empty states in plain English ────────────────────────── */

    it.each([375, 1280] as const)(
      "stories zero-state and all-complete state read as plain English and fit at %spx",
      async (width) => {
        stubFetch();
        // Zero stories.
        const emptyMarkup = await mountStoriesView([], []);
        const pageEmpty = await openFixturePage("stories-empty", emptyMarkup, width);
        try {
          await expectFits(pageEmpty, "stories zero-state", width);
          const emptyText = await pageEmpty.evaluate(() => document.body.textContent ?? "");
          expect(emptyText).toContain("No stories yet");
          expect(emptyText).toContain("Create your first story");
        } finally {
          await pageEmpty.close();
        }

        // Every story complete and hidden by the filter.
        const doneTasks = storyTasks().map((t) => makeTask({ ...t, status: "done" as const }));
        const completeMarkup = await mountStoriesView(doneTasks, storyDefinitions(), {
          hideCompleted: true,
        });
        const pageComplete = await openFixturePage(
          "stories-all-complete",
          completeMarkup,
          width,
        );
        try {
          await expectFits(pageComplete, "stories all-complete state", width);
          const text = await pageComplete.evaluate(() => document.body.textContent ?? "");
          expect(text).toContain("All stories are complete");
          expect(text).toContain("32 completed stories are hidden");
          expect(text).toContain("Uncheck Hide Completed Stories to see them");
        } finally {
          await pageComplete.close();
        }
      },
    );

    /* ── 3. Story side panel open over the list ─────────────────────────── */

    it.each(VIEWPORTS)(
      "story side panel fits at %spx with a long name, body and task rows",
      async (width) => {
        stubFetch();
        const markup = await mountStoriesView(storyTasks(), storyDefinitions(), {
          openPanel: true,
        });
        const page = await openFixturePage("story-panel", markup, width);
        try {
          await expectFits(page, "story panel", width);
          const state = await page.evaluate(() => {
            const panel = document.querySelector(".drawer");
            return {
              open: panel !== null,
              text: panel?.textContent ?? "",
              tabs: panel?.querySelectorAll(".drawer-tabs .tab-btn").length ?? 0,
              rows: panel?.querySelectorAll(".task-row, .story-task-row, [data-task-id]").length ?? 0,
            };
          });
          expect(state.open, "story panel must be open in the fixture").toBe(true);
          expect(state.tabs).toBeGreaterThan(1);
          // The panel carries the long story content in plain English.
          expect(state.text).toContain("QA story");
          expect(state.text).toContain("done");
        } finally {
          await page.close();
        }
      },
    );

    /* ── 4. Inbox: desktop filtered board (≥720px) ───────────────────────── */

    it.each([768, 1280] as const)(
      "inbox board fits at %spx with the full 220 long-titled cards",
      async (width) => {
        stubFetch();
        const markup = await mountWorkView(inboxTasks(), "/work?status=inbox");
        const page = await openFixturePage("inbox-board", markup, width);
        try {
          await expectFits(page, "inbox board", width);
          const state = await page.evaluate(() => ({
            chip: document.querySelector(".filter-chip")?.textContent ?? "",
            clear: document.querySelector("a.filter-clear")?.getAttribute("href") ?? "",
            boardLink: document.querySelector("a.client-board-link")?.getAttribute("href") ?? "",
            cards: document.querySelectorAll(".task-card").length,
            colLabel: document.querySelector(".col-label")?.textContent ?? "",
          }));
          expect(state.chip.replace(/\s+/g, " ")).toContain(`Inbox · ${INBOX_COUNT}`);
          // Links on the filtered view stay live, not dead.
          expect(state.clear).toBe("/work");
          expect(state.boardLink).toBe("/client-board");
          expect(state.cards).toBe(INBOX_COUNT);
          expect(state.colLabel).toContain("Inbox");
        } finally {
          await page.close();
        }
      },
    );

    /* ── 4. Inbox: phone queue (narrow branch) ───────────────────────────── */

    it("inbox phone queue fits at 375px, pages with Show more, and keeps count plain", async () => {
      stubFetch();
      const markup = await mountWorkView(inboxTasks(), "/work?status=inbox", {
        narrow: true,
        beforeCapture: async (wrapper) => {
          // Expand the first section past its first page before capture so the
          // paging control and its post-click layout are the audited state.
          const more = wrapper.find("button.mobile-section-more");
          if (more.exists()) {
            await more.trigger("click");
            await flushPromises();
          }
        },
      });
      const page = await openFixturePage("inbox-phone", markup, 375, true);
      try {
        await expectFits(page, "inbox phone queue", 375);
        const state = await page.evaluate(() => ({
          count: document.querySelector('[data-testid="mobile-queue-count"]')?.textContent ?? "",
          rows: document.querySelectorAll(".mobile-task-card").length,
          search: document.querySelector('[data-testid="mobile-queue-search"]') !== null,
          statusFilter:
            document.querySelector('.mobile-status-filter [aria-label="Filter tasks by status"]') !==
            null,
        }));
        expect(state.count).toMatch(/of 220 tasks/);
        expect(state.search).toBe(true);
        expect(state.statusFilter).toBe(true);
        expect(state.rows).toBeGreaterThan(12);
      } finally {
        await page.close();
      }
    });

    it("inbox phone queue zero-result and empty-project states read as plain English", async () => {
      stubFetch();
      // A search that matches nothing in a 220-task queue.
      const noMatch = await mountWorkView(inboxTasks(), "/work?status=inbox", {
        narrow: true,
        beforeCapture: async (wrapper) => {
          const input = wrapper.find('[data-testid="mobile-queue-search"]');
          await input.setValue("zzz-no-such-task");
          await flushPromises();
        },
      });
      const pageNoMatch = await openFixturePage("inbox-phone-no-match", noMatch, 375, true);
      try {
        await expectFits(pageNoMatch, "inbox phone no-match state", 375);
        const text = await pageNoMatch.evaluate(() => document.body.textContent ?? "");
        expect(text).toContain("No matching tasks");
        expect(text).toContain("Clear the filters to see the full queue.");
      } finally {
        await pageNoMatch.close();
      }

      // A brand-new project with no tasks at all.
      const empty = await mountWorkView([], "/work?status=inbox", { narrow: true });
      const pageEmpty = await openFixturePage("inbox-phone-empty", empty, 375, true);
      try {
        await expectFits(pageEmpty, "inbox phone empty state", 375);
        const text = await pageEmpty.evaluate(() => document.body.textContent ?? "");
        expect(text).toContain("No tasks yet");
        expect(text).toContain("Create a task to start building your queue.");
      } finally {
        await pageEmpty.close();
      }
    });

    /* ── 5. Search palette: many results, long titles ────────────────────── */

    it.each(VIEWPORTS)(
      "search palette fits at %spx with a full result page and long titles",
      async (width) => {
        stubFetch();
        const markup = await mountSearchMarkup("QA pass", inboxTasks());
        const page = await openFixturePage("search-results", markup, width);
        try {
          await expectFits(page, "search palette with results", width);
          const state = await page.evaluate(() => {
            const dialog = document.querySelector<HTMLElement>(".search-overlay")!;
            const rect = dialog.getBoundingClientRect();
            return {
              rows: document.querySelectorAll(".search-row").length,
              groupLabel: document.querySelector(".search-group-label")?.textContent ?? "",
              legend: document.querySelector(".search-overlay-keyboard-hint")?.textContent ?? "",
              left: rect.left,
              right: rect.right,
              empty: document.querySelector(".search-empty")?.textContent ?? null,
            };
          });
          // The palette caps its result page (RESULT_CAP) — many matches must
          // still render as a bounded, readable list.
          expect(state.rows).toBeGreaterThan(0);
          expect(state.rows).toBeLessThanOrEqual(8);
          expect(state.groupLabel).toContain("Tasks");
          expect(state.legend).toContain("Navigate");
          expect(state.empty).toBeNull();
          expect(state.left).toBeGreaterThanOrEqual(19);
          expect(state.right).toBeLessThanOrEqual(width - 19);
        } finally {
          await page.close();
        }
      },
    );

    it.each(VIEWPORTS)(
      "search palette no-results state says so in plain English at %spx",
      async (width) => {
        stubFetch();
        const markup = await mountSearchMarkup("zzzqqxnothing", inboxTasks());
        const page = await openFixturePage("search-no-results", markup, width);
        try {
          await expectFits(page, "search palette no-results", width);
          const state = await page.evaluate(() => ({
            empty: document.querySelector(".search-empty")?.textContent ?? "",
            rows: document.querySelectorAll(".search-row").length,
          }));
          expect(state.empty).toContain("No results");
          expect(state.rows).toBe(0);
        } finally {
          await page.close();
        }
      },
    );
  },
);
