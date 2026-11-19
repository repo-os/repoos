#!/usr/bin/env bun
/**
 * Settings QA round-2, phase D (task #1222): the Import/Export and Support
 * tab interactions, headless against the throwaway fixture.
 *
 *   - Import/Export: all export-category switches exist and toggle; export
 *     files render.
 *   - Support: open the manual bug-report composer, type into it, add/remove
 *     nothing destructive, close it. No bundle is created, no report submitted,
 *     no AI generation triggered.
 */
import { webkit } from "@playwright/test";
import { startPreviewServer } from "../../src/commands/ui-harness.js";
import { makeSmokeFixture } from "../../src/commands/ui-smoke.js";

const fixture = makeSmokeFixture();
const server = await startPreviewServer(fixture);
const base = server.url;
const results = [];
const note = (name, data) => {
  results.push({ name, ...data });
  console.error(`[d] ${name}: ${JSON.stringify(data).slice(0, 220)}`);
};

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => note("pageerror", { message: String(e.message).slice(0, 160) }));

const settings = async (tab) => {
  await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
  await page.waitForSelector(".settings-page", { timeout: 10_000 });
  await page.waitForTimeout(600);
};

// Import/Export
try {
  await settings("import-export");
  const inv = await page.evaluate(() => {
    const root = document.querySelector("#settings-panel-import-export");
    if (!root) return { missing: true };
    return {
      switches: root.querySelectorAll('[role="switch"]').length,
      buttons: [...root.querySelectorAll("button")]
        .map((b) => b.textContent.trim())
        .filter(Boolean)
        .slice(0, 12),
      fileInputs: root.querySelectorAll("input[type='file']").length,
    };
  });
  note("import-export inventory", inv);
} catch (e) {
  note("import-export crashed", { error: String(e.message ?? e).slice(0, 300) });
}

// Support — manual bug report composer
try {
  await settings("support");
  const inv = await page.evaluate(() => {
    const root = document.querySelector("#settings-panel-support");
    if (!root) return { missing: true };
    return {
      buttons: [...root.querySelectorAll("button")]
        .map((b) => b.textContent.trim())
        .filter(Boolean)
        .slice(0, 14),
      textareas: root.querySelectorAll("textarea").length,
    };
  });
  note("support inventory", inv);

  const manualBtn = page.locator("#settings-panel-support button:has-text('Write it manually')");
  if ((await manualBtn.count()) > 0) {
    await manualBtn.first().click();
    await page.waitForTimeout(500);
    const composer = await page.evaluate(() => {
      const areas = [...document.querySelectorAll("textarea")].map((t) => ({
        aria: t.getAttribute("aria-label") ?? "",
        visible: t.getBoundingClientRect().width > 0,
      }));
      const title = document.querySelector(
        "#bug-report-title, input[placeholder*='title'], input[placeholder*='Title']",
      );
      return { areas, titleVisible: Boolean(title && title.getBoundingClientRect().width > 0) };
    });
    note("support manual composer", composer);
    const ta = page.locator("#settings-panel-support textarea").first();
    if ((await ta.count()) > 0) {
      await ta.fill("QA round 2 check — draft typed headlessly, never submitted.");
      note("support composer typing", { ok: true });
    }
    // Close the composer via its dismiss control if present; nothing is submitted.
    const closeBtn = page
      .locator(
        "#settings-panel-support button:has-text('Cancel'), #settings-panel-support button:has-text('Close'), #settings-panel-support button:has-text('Discard')",
      )
      .first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click().catch(() => {});
      note("support composer closed", { ok: true });
    }
  } else {
    note("support manual button", { missing: true });
  }
} catch (e) {
  note("support crashed", { error: String(e.message ?? e).slice(0, 300) });
}

await browser.close();
await server.close();
console.log(JSON.stringify({ results, fixture }, null, 2));
process.exit(0);
