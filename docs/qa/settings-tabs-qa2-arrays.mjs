#!/usr/bin/env bun
/**
 * Settings QA round-2, phase E (task #1222): array-typed schema fields.
 * For each visible array field the probe types an invalid entry, waits for the
 * debounced save, and requires BOTH a visible error (field-level or global)
 * AND an unchanged persisted value after reload. Valid entries must save and
 * survive reload.
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
  console.error(`[e] ${name}: ${JSON.stringify(data).slice(0, 260)}`);
};

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => note("pageerror", { message: String(e.message).slice(0, 160) }));

// Which schema keys are arrays, straight from the server.
const schemaRes = await fetch(`${base}/api/config`).then((r) => r.json());
const arrayKeys = schemaRes.schema.filter((f) => f.type === "array").map((f) => f.key);
note("array keys", { keys: arrayKeys });

const settings = async (tab) => {
  await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
  await page.waitForSelector(".settings-page", { timeout: 10_000 });
  await page.waitForTimeout(600);
};

for (const key of arrayKeys) {
  try {
    // Find the tab that hosts this key.
    let tab = null;
    for (const t of ["general", "advanced"]) {
      await settings(t);
      if ((await page.locator(`[data-config-key="${key}"]`).count()) > 0) {
        tab = t;
        break;
      }
    }
    if (!tab) {
      note(key, { visible: false });
      continue;
    }
    const sel = `[data-config-key="${key}"] input`;
    const before = await page.inputValue(sel);
    // Invalid probe: an email-shaped key is not a valid role, an empty token is
    // not a valid email, a bare word is not a host record, negatives aren't pixels.
    const invalid =
      key === "release.email.to"
        ? "not-an-email"
        : key === "model_routing.roles"
          ? "definitely not a role"
          : key === "uiVerification.viewportWidths"
            ? "-5"
            : "%%%";
    await page.fill(sel, invalid);
    await page.waitForTimeout(1400);
    const fieldErr = await page
      .locator(`[data-config-key="${key}"] .ff-error, [data-config-key="${key}"] [role="alert"]`)
      .first()
      .textContent({ timeout: 1500 })
      .catch(() => null);
    const globalErr = await page
      .locator(".save-msg.err")
      .first()
      .textContent({ timeout: 1500 })
      .catch(() => null);
    await page.reload({ waitUntil: "load" });
    await settings(tab);
    const after = await page.inputValue(sel).catch(() => "missing");
    note(`${key} invalid`, {
      before,
      invalid,
      fieldErr: fieldErr ? fieldErr.trim().slice(0, 120) : null,
      globalErr: globalErr ? globalErr.trim().slice(0, 120) : null,
      afterInvalid: after,
      unchanged: after === before,
    });

    // Valid probe: a plausible entry must save and survive reload.
    const valid =
      key === "release.email.to"
        ? "qa2@example.com"
        : key === "model_routing.roles"
          ? "engineer"
          : key === "uiVerification.viewportWidths"
            ? "375"
            : "example.test";
    await page.fill(sel, valid);
    await page.waitForTimeout(1400);
    await page.reload({ waitUntil: "load" });
    await settings(tab);
    const afterValid = await page.inputValue(sel).catch(() => "missing");
    note(`${key} valid`, {
      valid,
      afterValid,
      saved:
        afterValid.includes(valid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) ||
        afterValid.includes(valid),
    });
    // Restore
    await page.fill(sel, before);
    await page.waitForTimeout(1200);
  } catch (e) {
    note(`${key} crashed`, { error: String(e.message ?? e).slice(0, 300) });
  }
}

await browser.close();
await server.close();
console.log(JSON.stringify({ results, fixture }, null, 2));
process.exit(0);
