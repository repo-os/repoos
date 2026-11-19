#!/usr/bin/env bun
// First-run QA (#1224): exercises the first-run paths headlessly — create the
// first task from the empty Work state, jump to built-in agents from the empty
// Agents state, and the Copy CLI hint action on the Checks no-plan reminder —
// at 375 and 1280 px. Never opens a visible browser.
//
//   just serve-noauth 7272 &
//   QA_BASE=http://127.0.0.1:7272 QA_SHOTS=<dir> bun docs/qa/first-run-interactions.mjs
import { webkit } from "@playwright/test";

const base = process.env.QA_BASE ?? "http://127.0.0.1:7272";
const widths = [375, 1280];
const browser = await webkit.launch();
const out = [];

for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  const shot = (name) =>
    process.env.QA_SHOTS ? `${process.env.QA_SHOTS}/${width}-${name}.png` : undefined;

  // ── Work: empty → create the first task ──────────────────────────────────
  await page.goto(`${base}/work?shotState=work%3Aempty`, { waitUntil: "load" });
  await page
    .waitForSelector('[data-testid="work-empty-state"], .mobile-queue-empty', { timeout: 15000 })
    .catch((e) => errors.push("work empty: " + e.message.slice(0, 120)));
  const createBtn = page
    .locator('[data-testid="work-empty-state"] button, .mobile-queue-empty button')
    .first();
  const createLabel = (await createBtn.textContent() ?? "").trim();
  await createBtn.click();
  await page.waitForTimeout(800);
  const drawer = await page.evaluate(() => {
    const dialog = document.querySelector("[data-overlay-layer], [role='dialog']");
    return dialog
      ? { open: true, text: (dialog.textContent || "").replace(/\s+/g, " ").slice(0, 120) }
      : { open: false };
  });
  if (shot("work-create-drawer")) await page.screenshot({ path: shot("work-create-drawer") });
  out.push({ width, step: "work create", createLabel, drawer, errors: errors.slice() });
  // Close the drawer so the next probe starts clean.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  // ── Agents: empty → choose a built-in agent ──────────────────────────────
  await page.goto(`${base}/agents?shotState=agents%3Aempty`, { waitUntil: "load" });
  await page
    .waitForSelector('[data-testid="agents-empty-state"]', { timeout: 15000 })
    .catch((e) => errors.push("agents empty: " + e.message.slice(0, 120)));
  const chooseBtn = page.locator('[data-testid="agents-empty-state"] button').first();
  const chooseLabel = (await chooseBtn.textContent() ?? "").trim();
  await chooseBtn.click();
  await page.waitForTimeout(600);
  const teamTab = await page.evaluate(() => {
    const tab = document.getElementById("agents-tab-team");
    const panel = document.getElementById("agents-panel-team");
    return {
      selected: tab?.getAttribute("aria-selected") ?? null,
      panelVisible: Boolean(panel && panel.offsetParent !== null),
    };
  });
  if (shot("agents-team-tab")) await page.screenshot({ path: shot("agents-team-tab") });
  out.push({ width, step: "agents choose", chooseLabel, teamTab, errors: errors.slice() });

  // ── Checks: no plan → reminder renders, Copy CLI hint works ─────────────
  await page.goto(`${base}/checks?shotState=checks%3AemptyPlan&tab=plan`, { waitUntil: "load" });
  await page
    .waitForSelector(".ncpr", { timeout: 15000 })
    .catch((e) => errors.push("checks empty: " + e.message.slice(0, 120)));
  const copyBtn = page.locator(".ncpr-btn").nth(1);
  const copyBefore = (await copyBtn.textContent() ?? "").trim();
  await copyBtn.click();
  await page.waitForTimeout(300);
  const copyAfter = (await copyBtn.textContent() ?? "").trim();
  const redParagraph = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".ck-err")];
    return els.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80));
  });
  if (shot("checks-empty-plan")) await page.screenshot({ path: shot("checks-empty-plan") });
  out.push({
    width,
    step: "checks copy hint",
    copyBefore,
    copyAfter,
    redParagraph,
    errors: errors.slice(),
  });

  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
