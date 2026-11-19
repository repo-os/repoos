// @vitest-environment jsdom
/**
 * #1231 — QA pass: command palette and search affordances across the three QA
 * widths (375 / 768 / 1280), rendered in headless WebKit against fixtures only.
 *
 * The palette and the header search pill are mounted as real components in
 * jsdom (seeded store + typed query), their serialized markup is injected into
 * WebKit with the real global stylesheet, and every width must pass a
 * no-overflow audit. Also pins the touch/small-screen contract: below 760px
 * the ⌘K chip is hidden (a phone has no keyboard) and the pill becomes a
 * 44px-tall touch target (#1139, #1152). Keyboard *behavior* is covered by
 * keyboard-shortcuts-qa.test.ts in jsdom; this file is layout evidence.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SearchBar from "../src/components/SearchBar.vue";
import SearchOverlay from "../src/components/SearchOverlay.vue";
import { useRepoStore } from "../src/stores/repo";
import { makeTask } from "./component-test-helpers";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "work", query: {} }),
  useRouter: () => ({ push: vi.fn(), currentRoute: { value: { name: "work", query: {} } } }),
}));

/** Real palette markup, rendered open with one live task result. */
async function paletteMarkup(): Promise<string> {
  setActivePinia(createPinia());
  const repo = useRepoStore();
  repo.tasks = [makeTask({ id: "1231", title: "QA pass: keyboard shortcuts" })];
  const wrapper = mount(SearchOverlay, {
    props: { open: true, scope: "all" },
    attachTo: document.body,
  });
  const input = document.querySelector(".search-overlay-input") as HTMLInputElement;
  input.value = "QA pass";
  input.dispatchEvent(new Event("input"));
  // The palette debounces doc-body loads by 200ms; give the render time to settle.
  await new Promise((r) => setTimeout(r, 250));
  const markup = document.querySelector(".search-overlay-backdrop")!.outerHTML;
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

/** Real header search pill markup (palette closed, as the bar renders it). */
function pillMarkup(): string {
  setActivePinia(createPinia());
  const wrapper = mount(SearchBar, { attachTo: document.body });
  const markup = document.querySelector(".search-wrap")!.outerHTML;
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

describe.skipIf(!existsSync(webkit.executablePath()))(
  "command palette QA at 375/768/1280 (WebKit, fixtures)",
  () => {
    let browser: Browser;
    let globalCss: string;
    let palette: string;
    let pill: string;

    beforeAll(async () => {
      browser = await webkit.launch();
      globalCss = readFileSync(resolve(uiRoot, "src/style.css"), "utf8").replace(
        '@import "tailwindcss";',
        "",
      );
      palette = await paletteMarkup();
      pill = pillMarkup();
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function openFixturePage(label: string, width: number): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<style>${globalCss}</style>` +
          `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
          `<div class="app-shell"><div class="topbar"><div class="spacer"></div>${pill}<div class="spacer"></div></div></div>` +
          palette,
      );
      const shots = process.env.QA_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
      }
      return page;
    }

    /** Every visible element must sit inside the viewport horizontally,
     *  except content a horizontal scroller legitimately clips. */
    async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
      return page.evaluate(() => {
        const vw = window.innerWidth;
        const inHorizontalScroller = (start: Element | null): boolean => {
          for (let el: HTMLElement | null = start as HTMLElement; el; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (
              (s.overflowX === "auto" || s.overflowX === "scroll") &&
              el.scrollWidth > el.clientWidth + 1
            )
              return true;
          }
          return false;
        };
        const overflowers: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (!el.offsetParent && style.position !== "fixed") continue;
          if (inHorizontalScroller(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > vw + 1 || rect.left < -1) {
            overflowers.push(
              `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
            );
          }
        }
        return { documentWidth: document.documentElement.scrollWidth, overflowers };
      });
    }

    it.each(VIEWPORTS)(
      "open palette fits, shows results and the keyboard legend at %spx",
      async (width) => {
        const page = await openFixturePage("palette", width);
        try {
          const result = await audit(page);
          expect(result.overflowers, `palette at ${width}px has off-viewport elements`).toEqual([]);
          expect(
            result.documentWidth,
            `palette at ${width}px widens the document`,
          ).toBeLessThanOrEqual(width + 1);

          // The palette dialog itself sits inside the viewport with the
          // 20px side gutters, and the live task result renders.
          const dialog = await page.evaluate(() => {
            const el = document.querySelector<HTMLElement>(".search-overlay")!;
            const rect = el.getBoundingClientRect();
            const close = document.querySelector<HTMLElement>(".search-overlay-close")!;
            const closeRect = close.getBoundingClientRect();
            const closeStyle = getComputedStyle(close);
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
              closeVisible:
                closeRect.width > 0 &&
                closeStyle.display !== "none" &&
                closeStyle.visibility !== "hidden",
              rowTitle: document.querySelector(".search-row-title")?.textContent ?? "",
              legend: document.querySelector(".search-overlay-keyboard-hint")?.textContent ?? "",
            };
          });
          expect(dialog.left).toBeGreaterThanOrEqual(19);
          expect(dialog.right).toBeLessThanOrEqual(width - 19);
          expect(dialog.width).toBeLessThanOrEqual(600);
          expect(dialog.closeVisible, "close button must be visible").toBe(true);
          expect(dialog.rowTitle).toContain("QA pass");
          expect(dialog.legend).toContain("Navigate");
          expect(dialog.legend).toContain("Enter");
          expect(dialog.legend).toContain("Esc");

          // Keyboard operability of the palette chrome: the close button takes
          // focus and shows the app's visible focus ring. (Walking there with
          // Tab is macOS WebKit platform behavior — Tab skips buttons unless
          // Full Keyboard Access is on — so the Tab trap itself is asserted in
          // keyboard-shortcuts-qa.test.ts against the real component.)
          await page.keyboard.press("Tab"); // keyboard interaction flag for :focus-visible
          await page.locator(".search-overlay-close").focus();
          expect(
            await page.evaluate(
              () =>
                (document.activeElement as HTMLElement)?.classList.contains(
                  "search-overlay-close",
                ) &&
                document.activeElement!.matches(":focus-visible") &&
                getComputedStyle(document.activeElement!).outlineWidth === "2px",
            ),
            "close button must show a visible focus ring when focused",
          ).toBe(true);
        } finally {
          await page.close();
        }
      },
    );

    it("hides the ⌘K chip and sizes the pill as a 44px touch target at 375px", async () => {
      const page = await openFixturePage("pill", 375);
      try {
        const pillState = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".search-input")!;
          const rect = el.getBoundingClientRect();
          const kbd = el.querySelector("kbd");
          return {
            height: rect.height,
            width: rect.width,
            kbdDisplay: kbd ? getComputedStyle(kbd).display : null,
          };
        });
        // #1152: at phone width the pill is an icon-only 44×44 button.
        expect(Math.round(pillState.height)).toBe(44);
        expect(Math.round(pillState.width)).toBe(44);
        // #1139: a touch-first phone has no ⌘K to advertise.
        expect(pillState.kbdDisplay).toBe("none");
        expect((await audit(page)).overflowers).toEqual([]);
      } finally {
        await page.close();
      }
    });

    /** #1231 round-2 review follow-up: `--shadow-lg` is declared exactly twice
     *  — at `:root` (dark base, 0.45 alpha) and at `[data-theme="light"]`
     *  (0.16). The ui-theme variant roots never declare it, so the resolved
     *  value depends on a subtle cascade fact: `:root` and
     *  `[data-theme="light"]` tie on specificity and the light declaration
     *  wins by source order. A reviewer worried the light ui-theme variants
     *  fall through to the heavy dark shadow; measuring in WebKit says they
     *  don't. This table pins the computed value for every combination so a
     *  future block reorder, or a `--shadow-lg` added to a ui-theme root,
     *  cannot silently put the dark shadow back on light themes. */
    const uiThemes = [
      "clear",
      "gen z",
      "jelly",
      "gruvbox",
      "catppuccin",
      "hypercolor",
      "solarized",
    ] as const;
    const shadowCases = [
      { label: "default (dark base)", attrs: {}, alpha: "0.45" },
      { label: "light theme", attrs: { "data-theme": "light" }, alpha: "0.16" },
      ...uiThemes.flatMap((theme) => [
        { label: `${theme} ui-theme (dark)`, attrs: { "data-ui-theme": theme }, alpha: "0.45" },
        {
          label: `${theme} ui-theme + light`,
          attrs: { "data-ui-theme": theme, "data-theme": "light" },
          alpha: "0.16",
        },
      ]),
    ];
    it.each(shadowCases)(
      "resolves --shadow-lg to the $alpha alpha shadow for: $label",
      async ({ attrs, alpha }) => {
        const page = await browser.newPage();
        try {
          await page.setContent(`<style>${globalCss}</style><body></body>`);
          const value = await page.evaluate((attrsToSet) => {
            for (const [name, v] of Object.entries(attrsToSet)) {
              document.documentElement.setAttribute(name, v);
            }
            return getComputedStyle(document.documentElement)
              .getPropertyValue("--shadow-lg")
              .trim();
          }, attrs);
          expect(value).toBe(`0 18px 40px rgba(0, 0, 0, ${alpha})`);
        } finally {
          await page.close();
        }
      },
    );
  },
);
