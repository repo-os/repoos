// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
const integrationCss = readFileSync(
  resolve(__dirname, "../src/components/IntegrationStatusBar.vue"),
  "utf8",
)
  .split("<style scoped>")[1]!
  .split("</style>")[0]!;

// #1170: tablet and small desktop widths run the 60px icon rail (720-900px) or
// the 210px sidebar beside a centred integration pill (901-1140px). Rules
// written for the wide layout must not leak into those bands: the Work parked
// toggles overlapped the Active column and the pill, the Settings tab strip
// clipped its last tab, and the rail's theme switcher and build widget spilled
// past the rail edge. These geometry checks run in WebKit with the real shared
// CSS so jsdom's lack of layout cannot hide them.

// Same optional browser dependency as the UI smoke check; no browser install is
// performed by a test.
describe.skipIf(!existsSync(webkit.executablePath()))("tablet icon rail layout (WebKit)", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await webkit.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each([720, 768, 900])(
    "hides the rail's theme switcher and build widget at %spx",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      try {
        await page.setContent(
          `<style>${css}</style><div style="display:flex;height:800px"><aside class="sidebar"><nav>Navigation</nav><div class="theme-switch"><button>Classic</button><button>Clear</button></div><div class="build-widget"><span class="build-hash">build 9737e86</span></div></aside><main style="flex:1"></main></div>`,
        );
        const display = await page.evaluate(() => ({
          sidebar: document.querySelector<HTMLElement>(".sidebar")!.getBoundingClientRect().width,
          themeSwitch: getComputedStyle(document.querySelector(".theme-switch")!).display,
          buildWidget: getComputedStyle(document.querySelector(".build-widget")!).display,
        }));
        expect(display.sidebar).toBe(60);
        expect(display.themeSwitch).toBe("none");
        expect(display.buildWidget).toBe("none");
      } finally {
        await page.close();
      }
    },
  );

  it.each([720, 768, 900, 940, 1000])(
    "scrolls the Settings tab strip instead of clipping its last tab at %spx",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      try {
        const tabs = [
          "General",
          "Notifications",
          "Security",
          "Advanced",
          "Import/Export",
          "Support",
          "repoos.toml",
        ];
        // The strip sits beside the sidebar (60px rail to 900px, 210px above)
        // with the page's 26px gutters, as in the live Settings view.
        const sidebar = width <= 900 ? 60 : 210;
        await page.setContent(
          `<style>${css}</style><div style="display:flex"><aside class="sidebar" style="width:${sidebar}px"></aside><main style="flex:1;min-width:0;padding:0 26px"><div class="settings-tabs" role="tablist">${tabs.map((label) => `<button role="tab" class="settings-tab-btn">${label}</button>`).join("")}</div></main></div>`,
        );
        // Seven tabs need about 695px, more than the strip gets beside the
        // rail or the 210px sidebar up to 1000px. The strip must scroll, or the
        // last tab is clipped at the content edge with no way to reach it.
        const overflowX = await page
          .locator(".settings-tabs")
          .evaluate((el) => getComputedStyle(el).overflowX);
        expect(overflowX).toBe("auto");
      } finally {
        await page.close();
      }
    },
  );

  it.each([768, 900, 1000, 1101, 1120, 1140])(
    "lifts the Work parked toggles above the integration pill and off the sidebar at %spx",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      try {
        await page.setContent(
          `<style>${css}\n${integrationCss}</style><div style="display:flex;height:800px"><aside class="sidebar"><nav>Navigation</nav></aside><main style="flex:1;min-width:0;position:relative"><div class="work-page" style="height:800px"><div class="board" style="height:100%"></div><section class="parked-lists"><div class="parked-toggles"><button class="human-toggle">Human (11)</button><button class="held-toggle">Held (11)</button><button class="archived-toggle">Archived (9)</button></div></section></div></main></div><div class="ibar-wrap"><div class="ibar"><span>Integration pipeline idle</span></div></div>`,
        );
        const geometry = await page.evaluate(() => {
          const box = (el: Element) => el.getBoundingClientRect();
          return {
            rail: box(document.querySelector(".sidebar")!).right,
            pill: box(document.querySelector(".ibar")!).top,
            toggles: Array.from(document.querySelectorAll(".parked-toggles > button"), (button) => {
              const { left, top, height } = box(button);
              return { left, bottom: top + height, height };
            }),
          };
        });
        expect(geometry.toggles).toHaveLength(3);
        for (const toggle of geometry.toggles) {
          // One line of chips: a squeezed row wrapped "Human (11)" onto two.
          expect(toggle.height).toBeLessThan(40);
          expect(toggle.left).toBeGreaterThanOrEqual(geometry.rail);
          expect(toggle.bottom).toBeLessThanOrEqual(geometry.pill);
        }
      } finally {
        await page.close();
      }
    },
  );

  it("keeps the Work parked toggles in normal flow below the 761px dock breakpoint", async () => {
    // Phone-reflow Work (720-760px) stacks the board and must not get the
    // fixed dock or its fade, or both cover cards mid-scroll.
    const page = await browser.newPage({ viewport: { width: 740, height: 800 } });
    try {
      await page.setContent(
        `<style>${css}</style><div class="work-page"><div class="board"></div><section class="parked-lists"><div class="parked-toggles"><button class="human-toggle">Human (11)</button></div></section></div>`,
      );
      const position = await page
        .locator(".parked-lists")
        .evaluate((el) => getComputedStyle(el).position);
      expect(position).not.toBe("fixed");
    } finally {
      await page.close();
    }
  });
});
