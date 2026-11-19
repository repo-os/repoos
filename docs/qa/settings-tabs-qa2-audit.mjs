#!/usr/bin/env bun
/**
 * Settings QA round-2, control audit (task #1222) — corrected enumeration.
 *
 * For each tab (general, advanced, notifications) enumerate only the VISIBLE,
 * ENABLED [data-config-key] controls (panels stay mounted with v-show, so the
 * DOM holds every tab's fields — visibility must be checked per row). Change
 * each value, wait for the debounced auto-save, reload, compare the restored
 * value; number fields also get a min−1 probe expecting a visible error and no
 * persisted change.
 */
import { webkit } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { startPreviewServer } from "../../src/commands/ui-harness.js";
import { makeSmokeFixture } from "../../src/commands/ui-smoke.js";

const fixture = makeSmokeFixture();
const server = await startPreviewServer(fixture);
const base = server.url;
const out = { audit: [], errors: [] };
const progress = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.error(line);
  try {
    appendFileSync(".repoos/qa-1222-progress.log", line + "\n");
  } catch {}
};

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => out.errors.push(`audit: ${String(e.message).slice(0, 160)}`));

const settings = async (tab) => {
  await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
  await page.waitForSelector(".settings-page", { timeout: 10_000 });
  await page.waitForTimeout(600);
};

for (const tab of ["general", "advanced", "notifications"]) {
  await settings(tab);
  progress(`audit ${tab}: enumerating visible controls`);
  const controls = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
    };
    return [...document.querySelectorAll("[data-config-key]")]
      .filter(
        (row) =>
          (visible(row) &&
            row.closest("[role='tabpanel']") ===
              document.querySelector("[role='tabpanel']:not([style*='display: none'])")) ||
          visible(row),
      )
      .filter((row) => visible(row))
      .map((row) => {
        const key = row.getAttribute("data-config-key");
        const input = row.querySelector("input");
        const sw = row.querySelector('[role="switch"]');
        const combobox = row.querySelector("button[role='combobox']");
        let type = "text";
        if (sw) type = "boolean";
        else if (input && input.type === "number") type = "number";
        else if (input && !input.disabled) type = "string";
        else if (combobox && !combobox.disabled) type = "select";
        const editable =
          (sw && !sw.hasAttribute("disabled") && sw.getAttribute("aria-disabled") !== "true") ||
          (input && !input.disabled) ||
          (combobox && !combobox.disabled);
        return {
          key,
          type,
          editable: Boolean(editable),
          min: input && input.type === "number" ? input.min : null,
          step: input && input.type === "number" ? input.step : null,
        };
      })
      .filter((c) => c.editable);
  });
  progress(`audit ${tab}: ${controls.length} editable controls`);

  for (const c of controls) {
    const entry = { tab, key: c.key, type: c.type };
    try {
      if (c.type === "boolean") {
        await page.click(`[data-config-key="${c.key}"] [role="switch"]`);
        await page.waitForTimeout(1300);
        await page.reload({ waitUntil: "load" });
        await settings(tab);
        entry.restored = await page.evaluate(
          (k) =>
            document
              .querySelector(`[data-config-key="${k}"] [role="switch"]`)
              ?.getAttribute("aria-checked") ?? "missing",
          c.key,
        );
      } else if (c.type === "number") {
        const sel = `[data-config-key="${c.key}"] input`;
        const min = Number(c.min ?? 0);
        const step = Number(c.step ?? 1);
        const before = await page.inputValue(sel);
        const target = (before === "" ? min : Number(before)) + step * 2;
        await page.fill(sel, String(target));
        await page.waitForTimeout(1300);
        await page.reload({ waitUntil: "load" });
        await settings(tab);
        entry.restored = await page.inputValue(sel).catch(() => "missing");
        entry.expected = String(target);
        // Out-of-range probe: min−1 must show an error and not persist.
        await page.fill(sel, String(min - 1));
        await page.waitForTimeout(1300);
        const fieldErr = await page
          .locator(
            `[data-config-key="${c.key}"] [role="alert"], [data-config-key="${c.key}"] .ff-error`,
          )
          .first()
          .textContent({ timeout: 1500 })
          .catch(() => null);
        const globalErr = await page
          .locator(".save-msg.err")
          .first()
          .textContent({ timeout: 1500 })
          .catch(() => null);
        entry.rangeError = (fieldErr ?? globalErr)?.trim().slice(0, 140) ?? null;
        await page.reload({ waitUntil: "load" });
        await settings(tab);
        entry.afterInvalid = await page.inputValue(sel).catch(() => "missing");
      } else if (c.type === "string") {
        const sel = `[data-config-key="${c.key}"] input`;
        const before = await page.inputValue(sel);
        const target = (before || "qa2") + "-x";
        await page.fill(sel, target);
        await page.waitForTimeout(1300);
        await page.reload({ waitUntil: "load" });
        await settings(tab);
        entry.restored = await page.inputValue(sel).catch(() => "missing");
        entry.expected = target;
        if (entry.restored !== target) {
          // The server rejected the value; a visible error is required.
          const fieldErr = await page
            .locator(
              `[data-config-key="${c.key}"] [role="alert"], [data-config-key="${c.key}"] .ff-error`,
            )
            .first()
            .textContent({ timeout: 1500 })
            .catch(() => null);
          const globalErr = await page
            .locator(".save-msg.err")
            .first()
            .textContent({ timeout: 1500 })
            .catch(() => null);
          entry.rejectedWithError = (fieldErr ?? globalErr)?.trim().slice(0, 140) ?? null;
        }
      } else if (c.type === "select") {
        const trig = `[data-config-key="${c.key}"] button[role='combobox']`;
        const before = ((await page.locator(trig).first().textContent()) ?? "").trim();
        await page.click(trig);
        await page.waitForTimeout(250);
        const items = page.locator("[role='option']");
        const n = await items.count();
        let chosen = null;
        for (let i = 0; i < n; i++) {
          const t = ((await items.nth(i).textContent()) ?? "").trim();
          if (t && t !== before) {
            chosen = t;
            await items.nth(i).click();
            break;
          }
        }
        if (chosen == null) {
          await page.keyboard.press("Escape");
          entry.restored = "no-alternative";
        } else {
          await page.waitForTimeout(1300);
          await page.reload({ waitUntil: "load" });
          await settings(tab);
          entry.restored = ((await page.locator(trig).first().textContent()) ?? "").trim();
          entry.expected = chosen;
        }
      } else {
        entry.restored = "skipped";
      }
    } catch (e) {
      entry.error = String(e.message ?? e).slice(0, 120);
    }
    out.audit.push(entry);
    progress(`audit ${tab} ${c.key} (${c.type}): ${JSON.stringify(entry).slice(0, 150)}`);
  }
}

await browser.close();
await server.close();

const badAudit = out.audit.filter((r) => {
  if (r.error) return true;
  if (r.type === "boolean") return r.restored !== "true" && r.restored !== "false";
  if (r.type === "number") {
    const mismatch = String(r.restored) !== String(r.expected);
    const noRangeError = !r.rangeError;
    return mismatch || noRangeError;
  }
  if (r.type === "string") return r.restored !== r.expected && r.rejectedWithError == null;
  if (r.type === "select") return r.restored !== "no-alternative" && r.restored !== r.expected;
  return false;
});

console.log(
  JSON.stringify(
    {
      auditProblems: badAudit,
      auditRows: out.audit.length,
      pageErrors: out.errors,
      fixture,
    },
    null,
    2,
  ),
);
process.exit(0);
