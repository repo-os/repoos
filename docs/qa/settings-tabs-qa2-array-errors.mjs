#!/usr/bin/env bun
/**
 * Settings QA round-2, phase E2 (task #1222): invalid-entry error visibility
 * for the validated array fields, checked BEFORE any reload (the reload resets
 * the save message, so error capture must happen while the rejection is on
 * screen). Valid entries are already proven to save by the control audit.
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
  console.error(`[e2] ${name}: ${JSON.stringify(data).slice(0, 260)}`);
};

// key → { tab, invalid }
const PROBES = [
  { key: "release.email.to", tab: "general", invalid: "not-an-email" },
  { key: "model_routing.roles", tab: "general", invalid: "not-a-role" },
  { key: "uiVerification.viewportWidths", tab: "general", invalid: "-5" },
  { key: "remoteValidation.tailscaleHosts", tab: "advanced", invalid: "%%% no spaces allowed" },
  { key: "reviewVerification.testGlobs", tab: "general", invalid: "  " },
];

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const settings = async (tab) => {
  await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
  await page.waitForSelector(".settings-page", { timeout: 10_000 });
  await page.waitForTimeout(600);
};

for (const p of PROBES) {
  try {
    await settings(p.tab);
    const sel = `[data-config-key="${p.key}"] input`;
    if ((await page.locator(sel).count()) === 0) {
      note(p.key, { visible: false });
      continue;
    }
    const before = await page.inputValue(sel);
    await page.fill(sel, p.invalid);
    await page.waitForTimeout(1500);
    // Error must be visible NOW, before any reload.
    const fieldErr = await page
      .locator(
        `[data-config-key="${p.key}"] [role="alert"], [data-config-key="${p.key}"] .ff-error`,
      )
      .first()
      .textContent({ timeout: 1200 })
      .catch(() => null);
    const globalErr = await page
      .locator(".save-msg.err")
      .first()
      .textContent({ timeout: 1200 })
      .catch(() => null);
    note(p.key, {
      invalid: p.invalid,
      fieldErr: fieldErr ? fieldErr.trim().slice(0, 130) : null,
      globalErr: globalErr ? globalErr.trim().slice(0, 130) : null,
      errorVisible: Boolean(fieldErr || globalErr),
    });
    // Restore the prior value without asserting (fixture is throwaway).
    await page.fill(sel, before);
    await page.waitForTimeout(900);
  } catch (e) {
    note(`${p.key} crashed`, { error: String(e.message ?? e).slice(0, 200) });
  }
}

await browser.close();
await server.close();
console.log(JSON.stringify({ results }, null, 2));
process.exit(0);
