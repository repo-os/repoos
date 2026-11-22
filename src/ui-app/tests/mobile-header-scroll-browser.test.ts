// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// QA for #1258: the header row shares one control height, and the phone page
// scrollbar is hidden without changing touch or keyboard scrolling. Headless
// WebKit only, with the real shared stylesheet plus the TopBar and NoticeBell
// scoped styles, on static markup that mirrors their templates.
const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
const scopedCss = ["TopBar", "NoticeBell"]
  .map(
    (name) =>
      readFileSync(resolve(__dirname, `../src/components/${name}.vue`), "utf8")
        .split("<style scoped>")[1]!
        .split("</style>")[0],
  )
  .join("\n");

const WIDTHS = [375, 412, 768, 1280] as const;
const THEMES = ["dark", "light"] as const;
// The header row's controls. Every one reads `--topbar-control-h`.
const CONTROLS = [
  ".repo-pill",
  ".search-input",
  ".notice-bell-trigger",
  ".theme-toggle",
  ".help-menu-trigger",
  ".user-menu-trigger",
] as const;

const header = `<div class="topbar">
  <div class="logo-mark"></div>
  <div class="repo-pill-wrapper"><button class="repo-pill" type="button"><svg width="12" height="12" viewBox="0 0 24 24"></svg><span class="mono repo-pill-text">repoos-worktrees-feat-mobile-polish-open-on-work</span></button></div>
  <div class="search-wrap"><div class="search-input"><span class="search-placeholder">Search</span><kbd>⌘K</kbd></div></div>
  <div class="spacer"></div>
  <div class="notice-bell-wrapper"><button class="notice-bell-trigger" type="button" aria-label="Notifications"></button></div>
  <button class="theme-toggle" type="button" aria-label="Switch to light mode"></button>
  <div class="help-menu-wrapper"><button class="help-menu-trigger" type="button" aria-label="Help and support"></button></div>
  <div class="user-menu-wrapper"><button class="user-menu-trigger" type="button" aria-label="User menu"></button></div>
</div>`;

// Enough rows to overflow the page scrollport at every tested height.
const rows = Array.from(
  { length: 60 },
  (_, i) => `<div class="page-row" style="height:40px">Row ${i + 1}</div>`,
).join("");

function appMarkup(): string {
  return `<style>${css}\n${scopedCss}</style><div id="app"><div class="app-shell">${header}<div class="main"><div class="page-scroll-body">${rows}</div></div></div></div>`;
}

// Always runs, with or without a browser: the phone rule that hides the bar.
describe("phone page scrollbar rule", () => {
  const phoneBlock = css.slice(css.indexOf("/* #1258: on phones the routed page"));
  it("hides the routed page's webkit scrollbar and scrollbar-width on phone widths", () => {
    expect(phoneBlock).toMatch(
      /@media \(max-width: 719\.98px\)\s*\{\s*\.main > :not\(\.spin\)\s*\{\s*scrollbar-width: none;\s*\}\s*\.main > :not\(\.spin\)::-webkit-scrollbar\s*\{\s*display: none;\s*\}/,
    );
  });
  it("drops the reserved right padding on phones so the gutters match", () => {
    expect(phoneBlock).toMatch(
      /\.page-scroll-body,\s*\.agents-tab-content\s*\{\s*padding-right: 0;/,
    );
  });
});

describe.skipIf(!existsSync(webkit.executablePath()))(
  "header row and phone page scrollbar (WebKit)",
  () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await webkit.launch();
    });
    afterAll(async () => {
      await browser?.close();
    });

    it.each(WIDTHS.flatMap((width) => THEMES.map((theme) => ({ width, theme }))))(
      "gives every header control one height and centres it at $width px ($theme)",
      async ({ width, theme }) => {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        try {
          await page.setContent(appMarkup());
          await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
          const measured = await page.evaluate(
            (selectors) => {
              const topbar = document
                .querySelector<HTMLElement>(".topbar")!
                .getBoundingClientRect();
              const center = topbar.top + topbar.height / 2;
              const controls = selectors.map((selector) => {
                const el = document.querySelector<HTMLElement>(selector)!;
                const rect = el.getBoundingClientRect();
                return {
                  selector,
                  height: rect.height,
                  centerOffset: rect.top + rect.height / 2 - center,
                };
              });
              const pill = getComputedStyle(document.querySelector(".repo-pill")!);
              return {
                controls,
                pillRadius: pill.borderTopLeftRadius,
                pillFontSize: pill.fontSize,
                pillFontWeight: pill.fontWeight,
                documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
              };
            },
            [...CONTROLS],
          );

          // One token: 30px on desktop, 44px on phones and small tablets.
          const expected = width <= 900 ? 44 : 30;
          for (const control of measured.controls) {
            expect(control.height, control.selector).toBe(expected);
            // The topbar's 1px bottom border moves its content centre by half a pixel.
            expect(Math.abs(control.centerOffset), control.selector).toBeLessThanOrEqual(0.5);
          }
          expect(measured.pillRadius).toBe("999px");
          expect(measured.pillFontSize).toBe("13px");
          expect(Number(measured.pillFontWeight)).toBeGreaterThanOrEqual(600);
          expect(measured.documentOverflow).toBeLessThanOrEqual(0);
        } finally {
          await page.close();
        }
      },
    );

    it.each([375, 412])(
      "hides the phone page scrollbar with equal gutters and no sideways scroll at %spx",
      async (width) => {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        try {
          await page.setContent(appMarkup());
          const geometry = await page.evaluate(() => {
            const main = document.querySelector<HTMLElement>(".main")!;
            const scroller = document.querySelector<HTMLElement>(".page-scroll-body")!;
            const mainRect = main.getBoundingClientRect();
            const scrollRect = scroller.getBoundingClientRect();
            const before = scroller.scrollTop;
            scroller.scrollTop = 200;
            const scrolled = scroller.scrollTop - before;
            return {
              // Headless WebKit draws overlay bars, so the bar's own width is
              // pinned by the stylesheet test below. The layout effect is
              // measurable here: the right padding a visible bar used to
              // reserve is gone, so both gutters match.
              rightPadding: getComputedStyle(scroller).paddingRight,
              leftGutter: scrollRect.left - mainRect.left,
              rightGutter: mainRect.right - scrollRect.right,
              scrolled,
              scrollable: scroller.scrollHeight > scroller.clientHeight,
              documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
              mainOverflow: main.scrollWidth - main.clientWidth,
            };
          });
          expect(geometry.rightPadding).toBe("0px");
          expect(geometry.leftGutter).toBeCloseTo(geometry.rightGutter, 1);
          expect(geometry.scrollable).toBe(true);
          expect(geometry.scrolled).toBeGreaterThan(0);
          expect(geometry.documentOverflow).toBeLessThanOrEqual(0);
          expect(geometry.mainOverflow).toBeLessThanOrEqual(0);
        } finally {
          await page.close();
        }
      },
    );
  },
);
