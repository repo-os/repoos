#!/usr/bin/env bun
// First-run QA (#1224): measures horizontal overflow and clipped/off-viewport
// controls on the three first-run states — Work with no tasks, Agents with no
// configured roles, and Checks with no check plan — at 375, 768 and 1280 px.
//
// Run against an auth-less preview server from a task worktree:
//   just serve-noauth 7272 &
//   QA_BASE=http://127.0.0.1:7272 QA_SHOTS=<dir> bun docs/qa/measure-first-run-widths.mjs
import { webkit } from "@playwright/test";

const base = process.env.QA_BASE ?? "http://127.0.0.1:7272";
const widths = [375, 768, 1280];
const routes = (
  process.env.QA_ROUTES ??
  "/work?shotState=work%3Aempty,/agents?shotState=agents%3Aempty,/checks?shotState=checks%3AemptyPlan&tab=plan"
).split(",");
const themes = (process.env.QA_THEMES ?? "light").split(",");

const browser = await webkit.launch();
/** Selector each route's first-run state must reach before measuring (#1224). */
const WAIT_FOR = {
  "/work": '[data-testid="work-empty-state"], .mobile-queue-empty',
  "/agents": '[data-testid="agents-empty-state"]',
  "/checks": ".ncpr",
};
const out = [];
for (const width of widths) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
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
      const waitSel = WAIT_FOR[route.split("?")[0]];
      if (waitSel) {
        await page
          .waitForSelector(waitSel, { timeout: 15000 })
          .catch((e) => errors.push("wait " + e.message.slice(0, 120)));
      }
      const applied = await page
        .evaluate(() => document.documentElement.getAttribute("data-repoos-shot-state"))
        .catch(() => null);
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
        // Dead-link probe: every same-origin href that 404s is reported by the
        // caller; here we just collect targets for visibility.
        const links = [...document.querySelectorAll("a[href]")].map((a) => ({
          text: (a.textContent || "").trim().slice(0, 40),
          href: a.getAttribute("href"),
        }));
        return { doc, offenders, links };
      });
      const slug = route.split("?")[0].replace(/\//g, "_") || "_root";
      const state = new URL(route, base).searchParams.get("shotState");
      const shot = `${process.env.QA_SHOTS ?? "."}/${width}-${theme}${slug}-${state ?? "plain"}.png`;
      if (process.env.QA_SHOTS) await page.screenshot({ path: shot, fullPage: false });
      out.push({
        width,
        theme,
        route,
        appliedFixture: applied,
        overflowX: result.doc.scrollWidth - result.doc.vw,
        offenders: result.offenders.slice(0, 15),
        offenderCount: result.offenders.length,
        links: result.links,
        pageErrors: errors.slice(),
      });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
