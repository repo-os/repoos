/**
 * Browser checks for the built docs site at phone, tablet and desktop widths.
 *
 * Needs a built site (`bun run build`) and headless WebKit from Playwright. It
 * boots its own `vitepress preview` on a free port and stops it afterwards.
 * Playwright comes from the repo root's devDependencies, the same copy the
 * QA sweep in docs/qa uses. Run with `bun test scripts/layout.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { layoutFailures, pageLayoutMetrics, type LayoutMetrics } from "./layout-metrics";

const docsRoot = path.resolve(import.meta.dir, "..");
const widths = [375, 768, 1280];
// The home page, a page with the most code blocks, and a page with long
// reference tables.
const pages = ["/", "/getting-started", "/cli", "/configuration"];

let browser: Browser;
let preview: ReturnType<typeof Bun.spawn> | null = null;
let base = "";

async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = server.port;
  server.stop(true);
  return port ?? 0;
}

async function waitForPreview(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await Bun.sleep(200);
  }
  throw new Error(`vitepress preview did not start at ${url}`);
}

// Wait for the client app to hydrate: server-rendered markup is visible before
// its click handlers attach, so an early click is silently lost.
async function open(context: BrowserContext, route: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: "load" });
  await page.waitForSelector(".vp-doc, .VPHome");
  await page.waitForLoadState("networkidle");
  return page;
}

beforeAll(async () => {
  if (!existsSync(path.join(docsRoot, ".vitepress", "dist", "index.html"))) {
    throw new Error("no built docs site: run `bun run build` in user-docs first");
  }
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  preview = Bun.spawn(
    [
      process.execPath,
      path.join(docsRoot, "node_modules", "vitepress", "bin", "vitepress.js"),
      "preview",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--strictPort",
    ],
    { cwd: docsRoot, stdout: "ignore", stderr: "ignore" },
  );
  await waitForPreview(`${base}/getting-started`);
  browser = await webkit.launch();
});

afterAll(async () => {
  await browser?.close();
  preview?.kill();
});

describe("page layout", () => {
  for (const width of widths) {
    for (const route of pages) {
      test(`${route} fits ${width}px with no clipped code labels`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
        try {
          const page = await open(context, route);
          const metrics: LayoutMetrics = await page.evaluate(pageLayoutMetrics);
          expect(layoutFailures(metrics)).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }
});

describe("navigation", () => {
  for (const width of widths) {
    test(`the sidebar reaches the CLI page at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      try {
        const page = await open(context, "/getting-started");
        if (width < 960) {
          await page.locator(".VPLocalNav .menu").click();
          await page.waitForSelector(".VPSidebar.open");
          // The drawer slides in; wait for it to land before reading geometry.
          await page.waitForFunction(
            () => document.querySelector(".VPSidebar")!.getBoundingClientRect().x >= 0,
          );
        }
        const link = page.locator(".VPSidebar a[href='/cli']").first();
        expect(await link.isVisible()).toBe(true);
        const box = await link.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await link.click();
        await page.waitForFunction(() =>
          (document.querySelector(".vp-doc h1")?.textContent ?? "").trim().startsWith("CLI"),
        );
      } finally {
        await context.close();
      }
    });
  }

  test("the phone top-nav screen lists the Agents page inside the viewport", async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    try {
      const page = await open(context, "/getting-started");
      await page.locator(".VPNavBarHamburger").click();
      const link = page.locator(".VPNavScreen a[href='/agents']").first();
      await link.waitFor({ state: "visible", timeout: 5000 });
      expect(await link.isVisible()).toBe(true);
      const box = await link.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    } finally {
      await context.close();
    }
  });
});

describe("local search", () => {
  for (const width of [375, 1280]) {
    test(`a query fits the ${width}px viewport and opens a result`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      try {
        const page = await open(context, "/getting-started");
        const button = page.locator(".DocSearch-Button").first();
        if (await button.isVisible()) await button.click();
        else await page.keyboard.press("Control+k");
        await page.waitForSelector(".VPLocalSearchBox");
        await page.fill("#localsearch-input", "authentication");
        await page.waitForSelector(".VPLocalSearchBox .result");
        const shell = await page.locator(".VPLocalSearchBox .shell").boundingBox();
        expect(shell!.x).toBeGreaterThanOrEqual(-1);
        expect(shell!.x + shell!.width).toBeLessThanOrEqual(width + 1);
        await page.locator(".VPLocalSearchBox .result").first().click();
        await page.waitForFunction(() => location.pathname !== "/getting-started");
        await page.waitForFunction(
          () => (document.querySelector(".vp-doc h1")?.textContent ?? "").trim() !== "",
        );
      } finally {
        await context.close();
      }
    });
  }
});
