/**
 * Timing and layout measurements for the Work board with a large fixture
 * (#1251). Every number is taken inside the page with `performance.now()` and
 * two animation frames after each input, so it reads as "time until the next
 * painted frame", and nothing is a fixed sleep. Headless WebKit only.
 */
import type { Browser, Page } from "@playwright/test";
import type { BoardIndex } from "../src/types";
import { FIXTURE_ORIGIN, installLargeBoardRoutes } from "./large-board-fixture";

export interface OpenTiming {
  width: number;
  /** Navigation start to the first painted task card. */
  firstCardMs: number;
  /** Cards mounted in the DOM once the first card is painted. */
  mountedCards: number;
}

export interface FilterTiming {
  width: number;
  action: string;
  /** Input dispatch to the next painted frame. */
  paintMs: number;
  /** Cards mounted in the DOM after the change. */
  mountedCards: number;
}

export interface ScrollTiming {
  width: number;
  /** Done column expand: click to next painted frame. */
  expandMs: number;
  /** Scroll steps taken through the Done column. */
  steps: number;
  /** Longest gap between animation frames during scrolling. */
  maxFrameGapMs: number;
  /** Frames that took longer than 50 ms (a dropped-frame proxy). */
  longFrames: number;
  /** Most Done task cards mounted at any point during the scroll. */
  maxMountedDoneCards: number;
  /** Largest content-space shift of a card that stayed mounted across a step. */
  maxCardJumpPx: number;
  /** Steps where the scroller did not move by the requested amount. */
  clampedSteps: number;
}

export interface MeasureOptions {
  width: number;
  board: BoardIndex;
  distDir: string;
  /** Repeat the open measurement this many times and keep the median. */
  openRuns?: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

async function newBoardPage(browser: Browser, width: number, board: BoardIndex, distDir: string) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: "block",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await installLargeBoardRoutes(page, board, distDir);
  return { context, page };
}

/** Waits for a painted task card without relying on Playwright's visibility
 *  polling, which can miss cards that are mounted but hidden by a collapse. */
const CARD_PAINTED = `[...document.querySelectorAll('[data-task-id]')].some((el) => el.getBoundingClientRect().height > 0)`;

export async function measureOpen(browser: Browser, opts: MeasureOptions): Promise<OpenTiming> {
  const runs: OpenTiming[] = [];
  for (let run = 0; run < (opts.openRuns ?? 3); run++) {
    const { context, page } = await newBoardPage(browser, opts.width, opts.board, opts.distDir);
    const start = Date.now();
    await page.goto(`${FIXTURE_ORIGIN}/work`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(CARD_PAINTED, null, { timeout: 120_000, polling: "raf" });
    const firstCardMs = Date.now() - start;
    const mountedCards = await page.evaluate(
      () => document.querySelectorAll("[data-task-id]").length,
    );
    runs.push({ width: opts.width, firstCardMs, mountedCards });
    await context.close();
  }
  return {
    width: opts.width,
    firstCardMs: median(runs.map((r) => r.firstCardMs)),
    mountedCards: runs[0]!.mountedCards,
  };
}

/** Runs one input in the page and reports time to the next painted frame. The
 *  input is passed as source text (`act.toString()`) so it runs in the page. */
async function timeInput(
  page: Page,
  action: string,
  act: (arg: string) => void,
  arg = "",
): Promise<{ action: string; paintMs: number; mountedCards: number }> {
  const r = await page.evaluate(`(async () => {
    const nextPaint = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await nextPaint();
    const t0 = performance.now();
    (${act.toString()})(${JSON.stringify(arg)});
    await nextPaint();
    return { paintMs: performance.now() - t0, mountedCards: document.querySelectorAll("[data-task-id]").length };
  })()`);
  return { action, ...(r as { paintMs: number; mountedCards: number }) };
}

export async function measureFilters(
  browser: Browser,
  opts: MeasureOptions,
): Promise<FilterTiming[]> {
  const { context, page } = await newBoardPage(browser, opts.width, opts.board, opts.distDir);
  const out: FilterTiming[] = [];
  try {
    await page.goto(`${FIXTURE_ORIGIN}/work`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(CARD_PAINTED, null, { timeout: 120_000, polling: "raf" });
    if (opts.width < 480) {
      // Phone: the queue search filters the list as the user types.
      const r = await timeInput(page, "phone search: type a title fragment", () => {
        const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setValue.call(input, "handoff");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      out.push({ width: opts.width, ...r });
    } else {
      // Desktop and tablet: the Human and Held header toggles hide categories.
      for (const label of ["Human", "Held"]) {
        const r = await timeInput(
          page,
          `${label} toggle`,
          (name) => {
            const toggle = [
              ...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
            ].find((b) => b.textContent?.includes(name));
            toggle?.click();
          },
          label,
        );
        out.push({ width: opts.width, ...r });
      }
    }
  } finally {
    await context.close();
  }
  return out;
}

export interface PhoneDoneTiming {
  width: number;
  /** Done tasks in the fixture, for scale. */
  doneTasks: number;
  /** "Show more" presses needed to reach the end of the Done list. */
  pages: number;
  /** Median time from a "Show more" press to the next painted frame. */
  medianPageMs: number;
  /** Slowest "Show more" press to the next painted frame. */
  maxPageMs: number;
  /** Longest gap between animation frames while scrolling the list. */
  maxFrameGapMs: number;
  /** Cards mounted once the whole Done list has been paged in. */
  mountedCards: number;
}

/** Phone: the Done list is behind `?status=done` and pages in 12 cards per
 *  "Show more" press. Measures each press and the frame gaps while scrolling. */
export async function measurePhoneDone(
  browser: Browser,
  opts: MeasureOptions,
): Promise<PhoneDoneTiming> {
  const { context, page } = await newBoardPage(browser, opts.width, opts.board, opts.distDir);
  try {
    await page.goto(`${FIXTURE_ORIGIN}/work?status=done`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(CARD_PAINTED, null, { timeout: 120_000, polling: "raf" });
    return await page
      .evaluate(async () => {
        const nextPaint = () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        const frame = () =>
          new Promise<number>((resolve) => requestAnimationFrame((t) => resolve(t)));
        const showMore = () =>
          [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
            /^Show \d+ more$/.test(b.textContent?.trim() ?? ""),
          );
        const pageMs: number[] = [];
        let last = await frame();
        let maxGap = 0;
        for (let i = 0; i < 200; i++) {
          // Scroll a screen between presses so the frame-gap sample covers real scrolling.
          for (let s = 0; s < 4; s++) {
            window.scrollBy(0, 300);
            const t = await frame();
            maxGap = Math.max(maxGap, t - last);
            last = t;
          }
          const button = showMore();
          if (!button) break;
          const t0 = performance.now();
          button.click();
          await nextPaint();
          pageMs.push(performance.now() - t0);
        }
        const sorted = [...pageMs].sort((a, b) => a - b);
        return {
          width: window.innerWidth,
          doneTasks: 0,
          pages: pageMs.length,
          medianPageMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
          maxPageMs: sorted[sorted.length - 1] ?? 0,
          maxFrameGapMs: maxGap,
          mountedCards: document.querySelectorAll("[data-task-id]").length,
        };
      })
      .then((r) => ({ ...r, doneTasks: opts.board.counts.done }));
  } finally {
    await context.close();
  }
}

export async function measureDoneScroll(
  browser: Browser,
  opts: MeasureOptions,
): Promise<ScrollTiming> {
  const { context, page } = await newBoardPage(browser, opts.width, opts.board, opts.distDir);
  try {
    await page.goto(`${FIXTURE_ORIGIN}/work`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(CARD_PAINTED, null, { timeout: 120_000, polling: "raf" });
    return await page.evaluate(async () => {
      const nextPaint = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      const frame = () =>
        new Promise<number>((resolve) => requestAnimationFrame((t) => resolve(t)));
      const headOf = () =>
        [...document.querySelectorAll<HTMLElement>(".col-head")].find((h) =>
          /Done\s*$/.test(h.textContent ?? ""),
        ) ?? null;

      let head = headOf();
      const expandStart = performance.now();
      if (head?.getAttribute("aria-expanded") === "false") head.click();
      await nextPaint();
      const expandMs = performance.now() - expandStart;

      const body = document
        .querySelector<HTMLElement>("[data-virtual-task]")
        ?.closest<HTMLElement>(".col-body");
      if (!body) throw new Error("Done column body was not rendered");

      // Card content-space positions before each step, so a card that stays
      // mounted can be checked for jumps across the window shift.
      const contentY = () => {
        const top = body.getBoundingClientRect().top;
        const map = new Map<string, number>();
        body.querySelectorAll<HTMLElement>("[data-virtual-task]").forEach((el) => {
          map.set(el.dataset.virtualTask!, el.getBoundingClientRect().top - top + body.scrollTop);
        });
        return map;
      };

      const steps = 60;
      const stepPx = 300;
      let last = await frame();
      let maxGap = 0;
      let longFrames = 0;
      let maxMounted = 0;
      let maxJump = 0;
      let clamped = 0;
      for (let i = 0; i < steps; i++) {
        const before = contentY();
        const requested = body.scrollTop + stepPx;
        body.scrollTop = requested;
        // Two frames: one for the scroll-driven window update, one to paint it.
        const t1 = await frame();
        const t2 = await frame();
        for (const t of [t1, t2]) {
          const gap = t - last;
          maxGap = Math.max(maxGap, gap);
          if (gap > 50) longFrames++;
          last = t;
        }
        const after = contentY();
        for (const [id, y] of before) {
          const next = after.get(id);
          if (next !== undefined) maxJump = Math.max(maxJump, Math.abs(next - y));
        }
        maxMounted = Math.max(maxMounted, after.size);
        if (Math.abs(body.scrollTop - requested) > 1) clamped++;
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 1) break;
      }
      return {
        width: window.innerWidth,
        expandMs,
        steps,
        maxFrameGapMs: maxGap,
        longFrames,
        maxMountedDoneCards: maxMounted,
        maxCardJumpPx: maxJump,
        clampedSteps: clamped,
      };
    });
  } finally {
    await context.close();
  }
}

/** Measures the open path, the filter path and the Done scroll path at one width. */
export async function measureWidth(browser: Browser, opts: MeasureOptions) {
  const open = await measureOpen(browser, opts);
  const filters = await measureFilters(browser, opts);
  // Phone has the Done status list; tablet and desktop have the Done column.
  const phone = opts.width < 480;
  const phoneDone = phone ? await measurePhoneDone(browser, opts) : null;
  const doneColumn = phone ? null : await measureDoneScroll(browser, opts);
  const idle = await measureIdle(browser, { ...opts, seconds: 4 });
  return { open, filters, phoneDone, doneColumn, idle };
}

export interface IdleTiming {
  width: number;
  /** Seconds of idle time sampled after the board is painted. */
  seconds: number;
  /** Longest gap between animation frames while nothing is being done. */
  maxFrameGapMs: number;
  /** Frames that took longer than 50 ms while idle. */
  longFrames: number;
  /** DOM mutations the board made while idle (a re-render-work proxy). */
  domMutations: number;
}

/** Idle cost: frame gaps and DOM churn over a few seconds with no input. */
export async function measureIdle(
  browser: Browser,
  opts: MeasureOptions & { seconds?: number },
): Promise<IdleTiming> {
  const { context, page } = await newBoardPage(browser, opts.width, opts.board, opts.distDir);
  try {
    await page.goto(`${FIXTURE_ORIGIN}/work`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(CARD_PAINTED, null, { timeout: 120_000, polling: "raf" });
    const seconds = opts.seconds ?? 3;
    return await page
      .evaluate(
        (ms) =>
          new Promise<Omit<IdleTiming, "seconds">>((resolve) => {
            let mutations = 0;
            const observer = new MutationObserver((records) => {
              mutations += records.length;
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            let last = performance.now();
            let maxGap = 0;
            let longFrames = 0;
            const started = last;
            const tick = (t: number) => {
              const gap = t - last;
              maxGap = Math.max(maxGap, gap);
              if (gap > 50) longFrames++;
              last = t;
              if (t - started < ms) requestAnimationFrame(tick);
              else {
                observer.disconnect();
                resolve({
                  width: window.innerWidth,
                  maxFrameGapMs: maxGap,
                  longFrames,
                  domMutations: mutations,
                });
              }
            };
            requestAnimationFrame(tick);
          }),
        seconds * 1000,
      )
      .then((r) => ({ ...r, seconds }));
  } finally {
    await context.close();
  }
}
