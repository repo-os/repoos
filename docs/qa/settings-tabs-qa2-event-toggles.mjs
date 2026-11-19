#!/usr/bin/env bun
/**
 * Settings QA round-2, phase F (task #1222): the hand-rendered notification
 * event toggles (store-backed, not schema fields). Toggle the first event
 * switch, reload, verify it stuck, then restore.
 */
import { webkit } from "@playwright/test";
import { startPreviewServer } from "../../src/commands/ui-harness.js";
import { makeSmokeFixture } from "../../src/commands/ui-smoke.js";

const fixture = makeSmokeFixture();
const server = await startPreviewServer(fixture);
const base = server.url;

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${base}/settings?tab=notifications`, { waitUntil: "load" });
await page.waitForSelector(".settings-page", { timeout: 10_000 });
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("#settings-panel-notifications .setting-row")].filter(
    (r) => r.querySelector("[role='switch']") && r.getBoundingClientRect().width > 0,
  );
  const last = rows[rows.length - 1];
  return {
    count: rows.length,
    label:
      last
        ?.querySelector(".setting-label")
        ?.textContent?.trim()
        .replace(/\s+/g, " ")
        .slice(0, 60) ?? "",
  };
});
const switches = page.locator("#settings-panel-notifications [role='switch']");
const count = info.count;
const before = await switches.nth(count - 1).getAttribute("aria-checked");
const label = info.label;
await switches.nth(count - 1).click();
await page.waitForTimeout(1400);
await page.reload({ waitUntil: "load" });
await page.waitForSelector(".settings-page", { timeout: 10_000 });
await page.waitForTimeout(600);
const after = await page
  .locator("#settings-panel-notifications [role='switch']")
  .nth(count - 1)
  .getAttribute("aria-checked");
console.log(JSON.stringify({ count, label, before, after, stuck: after !== before }));
// restore
if (after !== before) {
  await page
    .locator("#settings-panel-notifications [role='switch']")
    .nth(count - 1)
    .click();
  await page.waitForTimeout(1200);
}

await browser.close();
await server.close();
process.exit(0);
