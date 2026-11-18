#!/usr/bin/env bun
// Measures horizontal overflow and clipped/off-viewport controls on each main route.
import { webkit } from "@playwright/test";

const base = process.env.QA_BASE ?? "http://127.0.0.1:7272";
const widths = [375, 768];
const routes = (
  process.env.QA_ROUTES ??
  "/,/work,/releases,/settings,/agents,/checks,/stories,/inputs,/secrets,/dev,/repo,/deployments"
).split(",");
const themes = (process.env.QA_THEMES ?? "light").split(",");

const browser = await webkit.launch();
const out = [];
for (const width of widths) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      colorScheme: theme === "dark" ? "dark" : "light",
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    for (const route of routes) {
      await page
        .goto(base + route, { waitUntil: "load" })
        .catch((e) => errors.push("goto " + e.message.slice(0, 120)));
      await page.waitForTimeout(1500);
      const result = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const doc = { scrollWidth: document.documentElement.scrollWidth, vw };
        const offenders = [];
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Ignore elements inside a horizontal scroller on purpose.
          let p = el.parentElement,
            scroller = false;
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
            const label = (el.getAttribute("aria-label") || el.textContent || "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 60);
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && el.className.baseVal === undefined
                ? String(el.className)
                : ""
              ).slice(0, 80),
              label,
              left: Math.round(r.left),
              right: Math.round(r.right),
            });
          }
          if (offenders.length > 40) break;
        }
        return { doc, offenders };
      });
      const shot = `${process.env.QA_SHOTS ?? "."}/${width}-${theme}${route.replace(/\//g, "_") || "_root"}.png`;
      if (process.env.QA_SHOTS) await page.screenshot({ path: shot, fullPage: false });
      out.push({
        width,
        theme,
        route,
        overflowX: result.doc.scrollWidth - result.doc.vw,
        offenders: result.offenders.slice(0, 15),
        offenderCount: result.offenders.length,
      });
    }
    out.push({ width, theme, pageErrors: errors });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
