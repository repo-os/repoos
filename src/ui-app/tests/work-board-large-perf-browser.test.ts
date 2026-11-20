/**
 * #1251 — Work board with a 1200-task generated fixture at 375, 768 and 1280
 * px, in headless WebKit. The UI is served from the built `dist/ui` with the
 * board payload generated in memory (see large-board-fixture.ts), so no
 * repository or running server is involved and no visible browser opens.
 *
 * The assertions are structural (the Done window stays bounded, a scrolled
 * card does not jump, a scroll is never clamped, the phone list pages in every
 * task) plus generous timing budgets. Exact numbers live in
 * docs/qa/2026-11-large-board-perf-qa.md, produced by
 * docs/qa/measure-large-board-perf.mjs; these budgets only catch a regression
 * that turns "fast" into "stuck".
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeLargeBoard } from "./large-board-fixture";
import { measureWidth, type MeasureOptions } from "./large-board-measure";

const uiRoot = resolve(__dirname, "..");
const distDir = resolve(uiRoot, "../../dist/ui");
const WIDTHS = [375, 768, 1280] as const;
const board = makeLargeBoard(1200);

describe("Work board with 1200 tasks (WebKit, generated fixture)", () => {
  let browser: Browser;

  beforeAll(async () => {
    if (!existsSync(resolve(distDir, "index.html"))) {
      throw new Error("dist/ui is not built; run `bun run build:ui` before this test");
    }
    browser = await webkit.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  for (const width of WIDTHS) {
    it(`opens, filters, and scrolls at ${width}px within budget`, async () => {
      const opts: MeasureOptions = { width, board, distDir, openRuns: 1 };
      const { open, filters, phoneDone, doneColumn, idle } = await measureWidth(browser, opts);

      // Open: the first card paints, and the initial mount stays bounded.
      expect(open.firstCardMs).toBeLessThan(15_000);
      expect(open.mountedCards).toBeLessThan(width < 480 ? 120 : 300);

      // Filters: each input reaches the next painted frame quickly.
      for (const f of filters) expect(f.paintMs, f.action).toBeLessThan(1500);

      if (phoneDone) {
        // Phone: the Done list pages in 12 cards per "Show more", and every
        // Done task is reachable by paging.
        expect(phoneDone.pages).toBeGreaterThan(0);
        expect(phoneDone.maxPageMs).toBeLessThan(1500);
        expect(phoneDone.mountedCards).toBeGreaterThanOrEqual(board.counts.done);
      }
      if (doneColumn) {
        // Tablet and desktop: the Done column is windowed. Only a bounded
        // slice of its 980 cards is mounted at any point.
        expect(doneColumn.expandMs).toBeLessThan(3000);
        expect(doneColumn.maxMountedDoneCards).toBeLessThanOrEqual(40);
        // A card that stays mounted across a window shift must not move.
        expect(doneColumn.maxCardJumpPx).toBe(0);
        // The scroller always moves by what was asked for.
        expect(doneColumn.clampedSteps).toBe(0);
      }

      // Idle: no long stall while nothing is happening.
      expect(idle.maxFrameGapMs).toBeLessThan(2000);
    }, 240_000);
  }
});
