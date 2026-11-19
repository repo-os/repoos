// @vitest-environment node
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { webkit, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureShots } from "./fixtures/drawer-long-content-harness/fixtures";

/**
 * #1221 — QA pass: the task drawer's tabs with long content at 375, 768 and
 * 1280 px.
 *
 * Unlike the repo's CSS-only WebKit fixtures, this drives the PRODUCTION
 * drawer: the harness page (`tests/fixtures/drawer-long-content-harness/`) is
 * built by the same Vite pipeline as the app and mounts the real
 * `TaskDrawer.vue` with the real stores, stylesheet and fetch → store → render
 * path. Only the transport is stubbed, so a broken tab handler, a dead shot
 * control or a long-content overflow regression fails here the same way it
 * would fail a human clicking the app.
 *
 * Same optional browser dependency as the UI smoke check; no browser install
 * is performed by a test, and everything stays headless.
 */

const appRoot = resolve(__dirname, "..");
const harnessDir = resolve(appRoot, "tests/fixtures/drawer-long-content-harness");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json",
};

describe.skipIf(!existsSync(webkit.executablePath()))(
  "task drawer long content (production drawer, WebKit)",
  () => {
    let browser: Browser;
    let server: Server;
    let base: string;

    beforeAll(async () => {
      // Build the harness with the app's own pipeline (root = src/ui-app, so
      // Tailwind source detection matches the production build exactly).
      const outDir = mkdtempSync(join(tmpdir(), "repoos-drawer-harness-"));
      await build({
        root: appRoot,
        configFile: false,
        define: { __REPOOS_COPY_INSPECTOR__: JSON.stringify(true) },
        plugins: [vue(), tailwindcss()],
        build: {
          outDir,
          emptyOutDir: true,
          minify: false,
          rollupOptions: { input: { harness: join(harnessDir, "index.html") } },
        },
      });
      server = createServer(async (req, res) => {
        if (!req.url) return res.writeHead(404).end();
        const [pathname] = req.url.split("?");
        if (pathname === "/favicon.ico") return res.writeHead(204).end();
        // Vite preserves the input's path relative to the build root.
        const file =
          pathname === "/"
            ? join(outDir, "tests/fixtures/drawer-long-content-harness/index.html")
            : join(outDir, pathname.slice(1));
        try {
          const body = await readFile(file);
          res.writeHead(200, {
            "content-type": MIME[file.slice(file.lastIndexOf("."))] ?? "text/plain",
          });
          res.end(body);
        } catch {
          res.writeHead(404).end();
        }
      });
      await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
      browser = await webkit.launch();
    }, 120_000);

    afterAll(async () => {
      await browser?.close();
      await new Promise<void>((ok) => server?.close(() => ok()));
    });

    /** The production drawer, mounted with long fixture content. */
    async function openDrawer(width: number): Promise<{ page: Page; consoleErrors: string[] }> {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
      await page.goto(base);
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.harnessReady === "true" &&
          document.querySelector(".drawer-tabs") !== null,
        undefined,
        { timeout: 20_000 },
      );
      return { page, consoleErrors };
    }

    /** Every named drawer tab must be clickable (Playwright scrolls it into
     * view first, so a clipped, unscrollable tab strip times out here). */
    async function clickTab(page: Page, name: string): Promise<void> {
      await page
        .locator(".drawer-tabs .tab-btn")
        .filter({ hasText: name })
        .first()
        .click({ timeout: 5_000 });
    }

    /** The page itself must never grow wider than the viewport, and the
     * drawer must sit inside it. */
    async function assertNoPageOverflow(page: Page): Promise<void> {
      const m = await page.evaluate(() => ({
        inner: window.innerWidth,
        docW: document.documentElement.scrollWidth,
      }));
      expect(m.docW, "document must not acquire horizontal overflow").toBeLessThanOrEqual(m.inner);
    }

    /**
     * Long content must end inside a scroll container the user can actually
     * drive to the end: walk up from the content element to its first
     * scrollable ancestor, scroll to the bottom, and confirm the content's
     * last row is inside that ancestor's box afterwards.
     */
    async function assertLongContentReachesEnd(
      page: Page,
      contentSelector: string,
      lastSelector = contentSelector,
    ): Promise<void> {
      const result = await page.evaluate(
        ([contentSel, lastSel]) => {
          const content = document.querySelector<HTMLElement>(contentSel);
          if (!content) return { found: false as const };
          let el: HTMLElement | null = content;
          while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
          if (!el) return { found: true as const, scrollable: false as const };
          const box = el.getBoundingClientRect();
          el.scrollTop = el.scrollHeight;
          const scrolled = el.scrollTop > 0;
          const last = Array.from(
            (content.closest(".drawer-body") ?? el).querySelectorAll(lastSel),
          ).at(-1) as HTMLElement | undefined;
          const reachable = !last || last.getBoundingClientRect().bottom <= box.bottom + 2;
          return { found: true as const, scrollable: true as const, scrolled, reachable };
        },
        [contentSelector, lastSelector],
      );
      expect(result.found, `${contentSelector} must render`).toBe(true);
      expect(
        result.scrollable,
        `${contentSelector}: long content must overflow a scroll container`,
      ).toBe(true);
      expect(result.scrolled, "the scroll container must accept scrolling").toBe(true);
      expect(result.reachable, "the content's end must be reachable by scrolling").toBe(true);
    }

    it.each([375, 768, 1280])(
      "renders long content on every tab and keeps every control alive at %i px",
      async (width) => {
        const { page, consoleErrors } = await openDrawer(width);
        try {
          // The production tab strip: seven named tabs plus the fullscreen
          // toggle. At phone width the strip is the narrow scrollable variant.
          expect(await page.locator(".drawer-tabs .tab-btn").count()).toBe(8);
          const stripScrolls = await page
            .locator(".drawer-tabs")
            .evaluate((el) => el.classList.contains("drawer-tabs-scroll"));
          expect(stripScrolls).toBe(width < 720);

          // --- Task tab: the long spec card -------------------------------
          await clickTab(page, "Task");
          await page.waitForFunction(
            () => (document.querySelector(".md-card .md-rendered")?.textContent ?? "").length > 500,
            undefined,
            { timeout: 10_000 },
          );
          await assertNoPageOverflow(page);
          await assertLongContentReachesEnd(page, ".md-card .md-rendered", ".md-card");

          // --- PM tab: wiring + containment (chat is empty in the fixture) -
          await clickTab(page, "PM");
          await assertNoPageOverflow(page);

          // --- Dev tab: the long agent transcript --------------------------
          await clickTab(page, "Dev");
          await page.waitForFunction(
            () => document.querySelectorAll(".agent-log .agent-entry").length >= 100,
            undefined,
            { timeout: 10_000 },
          );
          await assertNoPageOverflow(page);
          await assertLongContentReachesEnd(page, ".agent-log", ".agent-entry");

          // --- Review tab: the long review report --------------------------
          await clickTab(page, "Review");
          await page.waitForFunction(
            () =>
              (document.querySelector(".review-report-pane .md-rendered")?.textContent ?? "")
                .length > 500,
            undefined,
            { timeout: 10_000 },
          );
          await assertNoPageOverflow(page);
          await assertLongContentReachesEnd(
            page,
            ".review-report-pane .md-rendered",
            ".review-report-pane p",
          );

          // --- Changes tab, UI pane: 24 shot rows, all alive ---------------
          await clickTab(page, "Changes");
          await page.waitForFunction(
            () => document.querySelectorAll(".shot-row").length > 0,
            undefined,
            { timeout: 10_000 },
          );
          expect(await page.locator(".shot-row").count()).toBe(fixtureShots.length);
          await assertNoPageOverflow(page);
          await assertLongContentReachesEnd(page, ".shot-rows", ".shot-row");

          // The LAST shot's real control opens the production viewer; the
          // viewer's own close control dismisses it. Either dead → timeout.
          const lastShot = page.locator(".shot-row").last();
          await lastShot.locator("img").click({ timeout: 5_000 });
          await page.waitForSelector(".shot-viewer", { state: "visible", timeout: 5_000 });
          expect(await page.locator(".shot-viewer-print").count()).toBe(fixtureShots.length);
          await page.locator('[aria-label="Close screenshot viewer"]').click({ timeout: 5_000 });
          await page.waitForSelector(".shot-viewer", { state: "detached", timeout: 5_000 });

          // --- Changes tab, code pane: the long unbroken diff --------------
          await page.locator('[data-test-id="changes-tab-code"]').click({ timeout: 5_000 });
          await page.waitForFunction(
            () => document.querySelectorAll(".diff-section").length >= 6,
            undefined,
            { timeout: 10_000 },
          );
          await assertNoPageOverflow(page);
          // Wide code lines scroll INSIDE the pre; the page must not widen.
          const diff = await page.evaluate(() => {
            const pre = document.querySelector<HTMLElement>(".diff-section-content");
            if (!pre) return null;
            pre.scrollLeft = pre.scrollWidth;
            return {
              tooWide: pre.scrollWidth > pre.clientWidth + 40,
              contained: document.documentElement.scrollWidth <= window.innerWidth,
              scrolled: pre.scrollLeft > 0,
            };
          });
          expect(diff).not.toBeNull();
          expect(diff!.tooWide).toBe(true);
          expect(diff!.contained).toBe(true);
          expect(diff!.scrolled).toBe(true);

          // --- Tokens + Debug tabs: wiring, containment, long logs ---------
          await clickTab(page, "Tokens");
          await assertNoPageOverflow(page);
          await clickTab(page, "Debug");
          await page.waitForFunction(
            () => document.querySelectorAll(".debug-events .debug-event").length >= 100,
            undefined,
            { timeout: 10_000 },
          );
          await assertNoPageOverflow(page);
          await assertLongContentReachesEnd(page, ".debug-events", ".debug-event");

          expect(consoleErrors, "the harness page must run without console errors").toEqual([]);
        } finally {
          await page.close();
        }
      },
      60_000,
    );
  },
);
