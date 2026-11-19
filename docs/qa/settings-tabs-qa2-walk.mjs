#!/usr/bin/env bun
/**
 * Settings-tabs QA round-2 walk (task #1222).
 *
 * Boots the BUILT app (dist/ui) against a throwaway fixture repo via the same
 * in-process harness the UI smoke gate uses, then drives headless WebKit over
 * every Settings tab:
 *
 *   A. layout walk — horizontal overflow + off-viewport controls at
 *      375 / 768 / 1280 px for every tab;
 *   B. control audit — for every schema-backed control ([data-config-key])
 *      change the value, wait for the debounced auto-save, reload, and compare
 *      the restored UI value; for number fields also try min-1 and expect a
 *      visible plain-English error and no persisted change.
 *
 * All writes land in the fixture's scratch repoos.toml under a temp dir — the
 * real project config is never touched. Headless only; prints a JSON summary.
 */
import { webkit } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { startPreviewServer } from "../../src/commands/ui-harness.js";
import { makeSmokeFixture } from "../../src/commands/ui-smoke.js";

const widths = (process.env.QA_WIDTHS ?? "375,768,1280").split(",").map(Number);
const auditEnabled = process.env.QA_AUDIT !== "0";
const progressPath = process.env.QA_PROGRESS ?? null;
const progress = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.error(line);
  if (progressPath) {
    try {
      appendFileSync(progressPath, line + "\n");
    } catch {}
  }
};
const TABS = [
  "general",
  "notifications",
  "security",
  "advanced",
  "import-export",
  "support",
  "toml",
];

const fixture = makeSmokeFixture();
const server = await startPreviewServer(fixture);
const base = server.url;

const browser = await webkit.launch();
const out = { base, fixture, layout: [], audit: [], errors: [] };

/** Off-viewport elements whose nearest scrollable ancestor doesn't own the spill. */
const WALK_JS = () => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let p = el.parentElement;
    let scroller = false;
    while (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (/(auto|scroll)/.test(ps.overflowX) && p.scrollWidth > p.clientWidth) {
        scroller = true;
        break;
      }
      p = p.parentElement;
    }
    if (scroller) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const label = (
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.textContent ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 70);
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className ?? "").slice(0, 80),
        label,
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
    if (offenders.length > 40) break;
  }
  return {
    scrollWidth: document.documentElement.scrollWidth,
    vw,
    offenders: offenders.slice(0, 12),
    offenderCount: offenders.length,
  };
};

// --- Phase A: layout walk ---------------------------------------------------
progress("layout walk start");
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => out.errors.push(`${width}px: ${String(e.message).slice(0, 160)}`));
  for (const tab of TABS) {
    await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
    await page.waitForSelector(".settings-page", { timeout: 10_000 });
    await page.waitForTimeout(700);
    const r = await page.evaluate(WALK_JS);
    out.layout.push({ width, tab, overflowX: r.scrollWidth - r.vw, ...r });
    progress(
      `layout ${width}px ${tab}: overflowX=${r.scrollWidth - r.vw} offenders=${r.offenderCount}`,
    );
  }
  await ctx.close();
}
progress("layout walk done");

// --- Phase B: control audit (save → reload → compare, and numeric bounds) ---
if (auditEnabled) {
  progress("audit start");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => out.errors.push(`audit: ${String(e.message).slice(0, 160)}`));

  await page.goto(`${base}/settings`, { waitUntil: "load" });
  await page.waitForSelector(".settings-page", { timeout: 10_000 });

  const waitSaved = async () => {
    // The debounced auto-save fires ~450ms after the last edit; wait until the
    // save indicator is idle for a stretch.
    await page.waitForTimeout(1300);
  };

  for (const tab of ["general", "notifications", "advanced"]) {
    await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
    await page.waitForSelector(".settings-page", { timeout: 10_000 });
    await page.waitForTimeout(700);

    const controls = await page.evaluate(() =>
      [...document.querySelectorAll("[data-config-key]")].map((row) => {
        const key = row.getAttribute("data-config-key");
        const input = row.querySelector("input");
        const sw = row.querySelector('[role="switch"]');
        const trigger = row.querySelector("button[role='combobox'], .select-trigger, button");
        let type = "text";
        if (sw) type = "boolean";
        else if (input && input.type === "number") type = "number";
        else if (input) type = "string";
        else if (trigger) type = "select";
        return {
          key,
          type,
          min: input && input.type === "number" ? input.min : null,
          step: input && input.type === "number" ? input.step : null,
        };
      }),
    );

    for (const c of controls) {
      const entry = { tab, key: c.key, type: c.type };
      try {
        if (c.type === "boolean") {
          await page.click(`[data-config-key="${c.key}"] [role="switch"]`);
          await waitSaved();
          await page.reload({ waitUntil: "load" });
          await page.waitForSelector(".settings-page", { timeout: 10_000 });
          await page.waitForTimeout(500);
          const after = await page.evaluate(
            (k) =>
              document
                .querySelector(`[data-config-key="${k}"] [role="switch"]`)
                ?.getAttribute("aria-checked") ?? "missing",
            c.key,
          );
          entry.restored = after;
        } else if (c.type === "number") {
          const min = Number(c.min ?? 0);
          const step = Number(c.step ?? 1);
          const target = min + step * 2;
          const sel = `[data-config-key="${c.key}"] input`;
          await page.fill(sel, String(target));
          await waitSaved();
          await page.reload({ waitUntil: "load" });
          await page.waitForSelector(".settings-page", { timeout: 10_000 });
          await page.waitForTimeout(500);
          const after = await page.inputValue(sel).catch(() => "missing");
          entry.restored = after;
          entry.expected = String(target);
          // Out-of-range probe: min-1 should surface an error, not save.
          await page.fill(sel, String(min - 1));
          await waitSaved();
          const err = await page
            .locator(".save-msg.err")
            .first()
            .textContent()
            .catch(() => null);
          entry.rangeError = err ? err.trim().slice(0, 140) : null;
          await page.reload({ waitUntil: "load" });
          await page.waitForSelector(".settings-page", { timeout: 10_000 });
          await page.waitForTimeout(400);
          entry.afterInvalid = await page.inputValue(sel).catch(() => "missing");
        } else if (c.type === "string") {
          const sel = `[data-config-key="${c.key}"] input`;
          const before = await page.inputValue(sel);
          const target = (before || "qa2") + "-x";
          await page.fill(sel, target);
          await waitSaved();
          await page.reload({ waitUntil: "load" });
          await page.waitForSelector(".settings-page", { timeout: 10_000 });
          await page.waitForTimeout(500);
          entry.restored = await page.inputValue(sel).catch(() => "missing");
          entry.expected = target;
        } else if (c.type === "select") {
          const trig = `[data-config-key="${c.key}"] button`;
          const before = (await page.locator(trig).first().textContent()) ?? "";
          await page.click(trig);
          await page.waitForTimeout(250);
          const items = page.locator("[role='option']");
          const n = await items.count();
          let chosen = null;
          for (let i = 0; i < n; i++) {
            const t = (await items.nth(i).textContent()) ?? "";
            if (t.trim() && t.trim() !== before.trim()) {
              chosen = t.trim();
              await items.nth(i).click();
              break;
            }
          }
          if (chosen == null) {
            await page.keyboard.press("Escape");
            entry.restored = "no-alternative";
          } else {
            await waitSaved();
            await page.reload({ waitUntil: "load" });
            await page.waitForSelector(".settings-page", { timeout: 10_000 });
            await page.waitForTimeout(500);
            entry.restored = ((await page.locator(trig).first().textContent()) ?? "").trim();
            entry.expected = chosen;
          }
        } else {
          entry.restored = "skipped";
        }
      } catch (e) {
        entry.error = String(e.message ?? e).slice(0, 160);
      }
      out.audit.push(entry);
      progress(`audit ${tab} ${c.key} (${c.type}): ${JSON.stringify(entry).slice(0, 120)}`);
      // go back to the tab (a reload may have landed elsewhere)
      await page.goto(`${base}/settings?tab=${tab}`, { waitUntil: "load" });
      await page.waitForSelector(".settings-page", { timeout: 10_000 });
      await page.waitForTimeout(300);
    }
  }
  await ctx.close();
  progress("audit done");
}

await browser.close();
await server.close();

const badLayout = out.layout.filter((r) => r.overflowX > 0 || r.offenderCount > 0);
const badAudit = out.audit.filter((r) => {
  if (r.error) return true;
  if (r.type === "boolean") return r.restored !== "true";
  if (r.type === "number") {
    const mismatch = String(r.restored) !== String(r.expected);
    const noRangeError = !r.rangeError;
    const invalidSaved =
      r.afterInvalid !== undefined &&
      r.expected !== undefined &&
      r.afterInvalid === String(Number(r.expected)); // out-of-range value stuck
    return mismatch || noRangeError || invalidSaved;
  }
  if (r.type === "string") return r.restored !== r.expected;
  if (r.type === "select")
    return r.restored === "no-alternative" ? false : r.restored !== r.expected;
  return false;
});

console.log(
  JSON.stringify(
    {
      layoutProblems: badLayout,
      auditProblems: badAudit,
      layoutRows: out.layout.length,
      auditRows: out.audit.length,
      pageErrors: out.errors,
      fixture,
    },
    null,
    2,
  ),
);
progress("done");
// The ephemeral server keeps a handle alive; the walk is complete here.
process.exit(0);
