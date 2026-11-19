#!/usr/bin/env bun
// Sweeps the docs site (user-docs/, VitePress) at phone, tablet and desktop
// widths: every sitemap page, plus the sidebar, the phone top-nav screen and
// local search. Headless WebKit only, against a local build served by
// `vitepress preview` (QA_BASE). The page rules live in
// user-docs/scripts/layout-metrics.ts, shared with `bun test scripts/layout.test.ts`.
// Exits 1 when any check fails.
import { webkit } from "@playwright/test";
import { layoutFailures, pageLayoutMetrics } from "../../user-docs/scripts/layout-metrics.ts";

const base = (process.env.QA_BASE ?? "http://127.0.0.1:5174").replace(/\/$/, "");
const widths = (process.env.QA_WIDTHS ?? "375,768,1280").split(",").map(Number);

const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
if (routes.length === 0) throw new Error(`no routes in ${base}/sitemap.xml`);

const failures = [];
const fail = (width, where, message) => failures.push({ width, where, message });

// Runs one interaction flow; a thrown error is recorded and the run goes on.
const step = async (width, where, flow) => {
  try {
    await flow();
  } catch (error) {
    fail(width, where, String(error.message).split("\n")[0]);
  }
};

// Wait for the client app to hydrate (SSR markup is clickable before its
// handlers attach), so clicks are not lost.
const settle = async (page) => {
  await page.waitForSelector(".vp-doc, .VPHome");
  await page.waitForLoadState("networkidle");
};

const browser = await webkit.launch();
const report = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 160)));

    for (const route of routes) {
      pageErrors.length = 0;
      const response = await page.goto(base + route, { waitUntil: "load" });
      if (!response || response.status() >= 400) {
        fail(width, route, `HTTP ${response?.status() ?? "no response"}`);
        continue;
      }
      await settle(page);
      const metrics = await page.evaluate(pageLayoutMetrics);
      report.push({ width, route, ...metrics });
      for (const message of layoutFailures(metrics)) fail(width, route, message);
      if (pageErrors.length > 0) fail(width, route, `page error: ${pageErrors[0]}`);
    }

    // Navigation: the sidebar on every width, and the top-nav screen on phones.
    await step(width, "nav", async () => {
      await page.goto(`${base}/getting-started`, { waitUntil: "load" });
      await settle(page);
      const sidebarLink = page.locator(".VPSidebar a[href='/cli']").first();
      if (width < 960) {
        await page.locator(".VPLocalNav .menu").click();
        // Wait for the open state, then for the slide-in transition to finish.
        await page.waitForSelector(".VPSidebar.open", { timeout: 5000 });
        await page.waitForFunction(
          () => document.querySelector(".VPSidebar").getBoundingClientRect().x >= 0,
        );
        if (!(await sidebarLink.isVisible())) {
          throw new Error("the sidebar opened but the CLI link is not visible");
        }
        const box = await sidebarLink.boundingBox();
        if (box.x < 0 || box.x + box.width > width) {
          throw new Error(`the CLI link sits outside the ${width}px viewport`);
        }
      }
      await sidebarLink.click({ timeout: 5000 });
      // Client-side navigation: the URL changes before the new page renders.
      await page
        .waitForFunction(
          () => (document.querySelector(".vp-doc h1")?.textContent ?? "").trim().startsWith("CLI"),
          null,
          { timeout: 5000 },
        )
        .catch(async () => {
          const h1 = (await page.locator(".vp-doc h1").textContent())?.trim();
          throw new Error(`the CLI link rendered "${h1}", not the CLI page`);
        });
    });

    if (width < 768) {
      await step(width, "nav", async () => {
        await page.goto(`${base}/getting-started`, { waitUntil: "load" });
        await settle(page);
        await page.locator(".VPNavBarHamburger").click({ timeout: 5000 });
        const screenLink = page.locator(".VPNavScreen a[href='/agents']").first();
        await screenLink.waitFor({ state: "visible", timeout: 5000 });
        const box = await screenLink.boundingBox();
        if (box.x < 0 || box.x + box.width > width) {
          throw new Error("the Agents link in the phone nav screen sits outside the viewport");
        }
        await page.keyboard.press("Escape");
      });
    }

    // Local search: open, query, check the dialog fits, open a result.
    await step(width, "search", async () => {
      await page.goto(`${base}/getting-started`, { waitUntil: "load" });
      await settle(page);
      const searchButton = page.locator(".DocSearch-Button").first();
      if (await searchButton.isVisible()) await searchButton.click();
      else await page.keyboard.press("Control+k");
      await page.waitForSelector(".VPLocalSearchBox", { timeout: 5000 });
      await page.fill("#localsearch-input", "authentication");
      await page.waitForSelector(".VPLocalSearchBox .result", { timeout: 5000 });
      const shell = await page.locator(".VPLocalSearchBox .shell").boundingBox();
      if (shell.x < -1 || shell.x + shell.width > width + 1) {
        throw new Error(
          `the dialog is ${Math.round(shell.width)}px wide, outside the ${width}px viewport`,
        );
      }
      const hits = await page.locator(".VPLocalSearchBox .result").count();
      report.push({ width, route: "search:authentication", results: hits });
      await page.locator(".VPLocalSearchBox .result").first().click();
      await page.waitForFunction(() => location.pathname !== "/getting-started", null, {
        timeout: 5000,
      });
      await page.waitForFunction(
        () => (document.querySelector(".vp-doc h1")?.textContent ?? "").trim() !== "",
        null,
        { timeout: 5000 },
      );
    });

    await context.close();
  }
} finally {
  await browser.close();
}

const pageLoads = report.filter((r) => r.codeBlocks !== undefined);
console.log(
  `checked ${routes.length} pages at ${widths.join(", ")}px (${pageLoads.length} page loads), ` +
    `${pageLoads.reduce((n, r) => n + r.codeBlocks, 0)} code blocks ` +
    `(${pageLoads.reduce((n, r) => n + r.scrollingCodeBlocks, 0)} scroll sideways inside their block, by design)`,
);
if (process.env.QA_JSON) console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f.width}px ${f.where}: ${f.message}`);
  process.exit(1);
}
console.log("no overflow, navigation or search failures");
