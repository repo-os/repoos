#!/usr/bin/env bun
/**
 * Settings QA round-2, phase C (task #1222): flows the schema-control audit
 * does not reach, driven headlessly against the same throwaway fixture:
 *
 *   1. repoos.toml tab — edit the raw TOML, save, reload, verify it stuck;
 *      then submit malformed TOML and verify a visible error and that the
 *      prior valid content is still on disk.
 *   2. Notifications custom controls — numeric thresholds reject negatives
 *      with a visible error; event toggles render inside the visible panel.
 *   3. Security — session duration saves and reloads.
 *   4. General hand-rendered controls — floating agent buttons switch:
 *      save + reload survival.
 *
 * Writes only to the fixture's scratch repoos.toml; headless WebKit only.
 */
import { webkit } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startPreviewServer } from "../../src/commands/ui-harness.js";
import { makeSmokeFixture } from "../../src/commands/ui-smoke.js";

const fixture = makeSmokeFixture();
const server = await startPreviewServer(fixture);
const base = server.url;
const results = [];
const note = (name, data) => {
  results.push({ name, ...data });
  console.error(`[c] ${name}: ${JSON.stringify(data).slice(0, 220)}`);
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
const panel = (tab) => `#settings-panel-${tab}`;
/** Wait until the raw editor is loaded and in sync with disk. */
const rawReady = async () => {
  await page.waitForFunction(
    () => {
      const t = document.querySelector("textarea[aria-label='repoos.toml contents']");
      const status = document.querySelector(".toml-raw-status");
      return (
        t instanceof HTMLTextAreaElement &&
        !t.disabled &&
        t.value.length > 0 &&
        status?.textContent?.includes("In sync")
      );
    },
    { timeout: 10_000 },
  );
};

// 1. repoos.toml tab ---------------------------------------------------------
try {
  await settings("toml");
  await rawReady();
  const beforeTOML = await page.inputValue("textarea[aria-label='repoos.toml contents']");
  const edited = beforeTOML + "\n# qa-round-2 marker\n";
  await page.fill("textarea[aria-label='repoos.toml contents']", edited);
  await page.click(".toml-raw-actions button:has-text('Save')");
  await page.waitForTimeout(1200);
  const diskAfterSave = readFileSync(join(fixture, "repoos.toml"), "utf8");
  note("toml save", {
    stuck: diskAfterSave.includes("qa-round-2 marker"),
    dirtyCleared: (await page.locator(".toml-raw-status").textContent())?.includes("In sync"),
  });
  await page.reload({ waitUntil: "load" });
  await rawReady();
  const afterReload = await page.inputValue("textarea[aria-label='repoos.toml contents']");
  note("toml reload", { restored: afterReload.includes("qa-round-2 marker") });

  // malformed TOML: server must refuse, error visible, disk unchanged
  const validSnapshot = readFileSync(join(fixture, "repoos.toml"), "utf8");
  await page.fill("textarea[aria-label='repoos.toml contents']", "not = [valid toml");
  await page.click(".toml-raw-actions button:has-text('Save')");
  await page.waitForTimeout(1000);
  const errText = await page
    .locator(".toml-raw-error")
    .textContent()
    .catch(() => null);
  const diskAfterBad = readFileSync(join(fixture, "repoos.toml"), "utf8");
  note("toml invalid", {
    errorShown: Boolean(errText),
    errorText: errText ? errText.trim().slice(0, 120) : null,
    diskUnchanged: diskAfterBad === validSnapshot,
  });
  // restore
  await page.fill("textarea[aria-label='repoos.toml contents']", validSnapshot);
  await page.click(".toml-raw-actions button:has-text('Save')");
  await page.waitForTimeout(800);
} catch (e) {
  note("toml flow crashed", { error: String(e.message ?? e).slice(0, 300) });
}

// 2. Notifications custom controls ------------------------------------------
try {
  await settings("notifications");
  const notif = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { missing: true };
    const labels = [...root.querySelectorAll("label, .setting-label")]
      .map((l) => l.textContent.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const switches = root.querySelectorAll('[role="switch"]').length;
    const inputs = [...root.querySelectorAll("input")].map((i) => ({
      type: i.type,
      aria: i.getAttribute("aria-label") ?? "",
    }));
    return { switchCount: switches, inputCount: inputs.length, inputs: inputs.slice(0, 15) };
  }, panel("notifications"));
  note("notifications inventory", notif);

  const spendSel = `${panel("notifications")} input[type='number']`;
  const spendCount = await page.locator(spendSel).count();
  for (let i = 0; i < spendCount; i++) {
    const el = page.locator(spendSel).nth(i);
    const min = await el.getAttribute("min");
    const before = await el.inputValue();
    await el.fill(String(Number(min ?? 0) - 1));
    await page.waitForTimeout(1300);
    const err = await page
      .locator(".save-msg.err")
      .first()
      .textContent()
      .catch(() => null);
    note(`notification-number-${i}`, { min, before, error: err ? err.trim().slice(0, 120) : null });
    await page.reload({ waitUntil: "load" });
    await settings("notifications");
  }
} catch (e) {
  note("notifications flow crashed", { error: String(e.message ?? e).slice(0, 300) });
}

// 3. Security ----------------------------------------------------------------
try {
  await settings("security");
  const sec = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { missing: true };
    return {
      numberFields: root.querySelectorAll("input[type='number']").length,
      switches: root.querySelectorAll('[role="switch"]').length,
      selects: root.querySelectorAll("button[role='combobox']").length,
      texts: root.querySelectorAll("input[type='text'], input:not([type])").length,
    };
  }, panel("security"));
  note("security inventory", sec);
  const secNum = page.locator(`${panel("security")} input[type='number']`).first();
  if ((await secNum.count()) > 0) {
    const before = await secNum.inputValue();
    const target = String(Number(before || 8) + 1);
    await secNum.fill(target);
    await page.waitForTimeout(1300);
    await page.reload({ waitUntil: "load" });
    await settings("security");
    const restored = await page
      .locator(`${panel("security")} input[type='number']`)
      .first()
      .inputValue();
    note("security session duration", { expected: target, restored });
  }
} catch (e) {
  note("security flow crashed", { error: String(e.message ?? e).slice(0, 300) });
}

// 4. General hand-rendered controls ------------------------------------------
try {
  await settings("general");
  const floats = page.locator('[data-test-id="floating-heads-setting"] [role="switch"]');
  if ((await floats.count()) > 0) {
    const before = await floats.first().getAttribute("aria-checked");
    await floats.first().click();
    await page.waitForTimeout(1300);
    await page.reload({ waitUntil: "load" });
    await settings("general");
    const after = await page
      .locator('[data-test-id="floating-heads-setting"] [role="switch"]')
      .first()
      .getAttribute("aria-checked");
    note("floating heads switch", { before, after });
    if (after !== before) {
      await page.locator('[data-test-id="floating-heads-setting"] [role="switch"]').first().click();
      await page.waitForTimeout(1200);
    }
  } else {
    note("floating heads switch", { missing: true });
  }
} catch (e) {
  note("general flow crashed", { error: String(e.message ?? e).slice(0, 300) });
}

await browser.close();
await server.close();
console.log(JSON.stringify({ results, fixture }, null, 2));
process.exit(0);
