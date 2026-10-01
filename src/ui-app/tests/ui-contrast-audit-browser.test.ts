/**
 * Browser-level half of the #0617 theme-flip race fix. The pure/jsdom tests in
 * `ui-contrast-audit.test.ts` cover the decision logic and the DOM re-assert;
 * these drive the real engine (`settleScopeInPage` / `contrastProbe`) against a
 * minimal self-contained page so a *delayed theme apply* and an *active CSS
 * transition* are exercised where they actually occur.
 *
 * No built app is needed — the page is `about:blank` plus a couple of inline
 * styles — so this stays fast and independent of `dist/`. It skips cleanly when
 * Playwright/WebKit is not installed, exactly like the `rendered-contrast`
 * check step.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  isPlaywrightUnavailable,
  launchWebkit,
  type SmokeBrowser,
  type SmokePage,
} from "../../commands/ui-harness.js";
import {
  contrastProbe,
  settleScopeInPage,
  type ScopeAttributes,
} from "../../commands/ui-contrast-audit.js";

let browser: SmokeBrowser | null = null;
let unavailable = false;
try {
  browser = await launchWebkit();
} catch (err) {
  if (isPlaywrightUnavailable((err as Error).message)) unavailable = true;
  else throw err;
}

const describeBrowser = browser ? describe : describe.skip;

afterAll(async () => {
  if (browser) await browser.close();
});

/** A fresh page whose scope tokens track `data-theme`. */
async function openPage(): Promise<SmokePage> {
  const page = await browser!.newPage();
  await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="probe-target">contrast text</div>';
    const s = document.createElement("style");
    s.textContent =
      ':root[data-theme="dark"]{--txt-faint:#79809b}' +
      ':root[data-theme="light"]{--txt-faint:#626c7f}' +
      "#probe-target{color:var(--txt-faint)}";
    document.head.appendChild(s);
  });
  return page;
}

describeBrowser("contrast audit theme-flip race in WebKit (#0617)", () => {
  it("has a usable browser when this suite runs", () => {
    expect(unavailable).toBe(false);
  });

  it("probe reclaims the scope when a delayed apply lands between flip and probe", async () => {
    const page = await openPage();
    try {
      const attrs: ScopeAttributes = { uiTheme: "classic", mode: "light" };
      await page.evaluate(settleScopeInPage, attrs);
      // The config store's async `applyTheme()` resolves *after* the audit's
      // settle — the gap the two-evaluate design left open.
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.dataset.uiTheme = "classic";
      });
      const probe = await page.evaluate(contrastProbe, { exemptSelectors: [], scope: attrs });
      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      const fg = probe.samples.find((s) => s.selector.includes("probe-target"))?.fg;
      expect(theme).toBe("light");
      expect(fg).toBe("rgb(98, 108, 127)"); // light --txt-faint, not the dark #79809b
    } finally {
      await page.close();
    }
  });

  it("settle waits out an active 300ms theme transition before resolving", async () => {
    const page = await openPage();
    try {
      await page.evaluate(() => {
        const s = document.createElement("style");
        s.textContent =
          "#probe-target{background:#000;transition:background-color 300ms linear}" +
          ':root[data-theme="light"] #probe-target{background:#fff}';
        document.head.appendChild(s);
        document.documentElement.dataset.theme = "dark";
        void document.documentElement.offsetHeight;
      });
      const running = await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
        void document.documentElement.offsetHeight;
        return document
          .getAnimations()
          .filter(
            (a) => typeof (a as { transitionProperty?: unknown }).transitionProperty === "string",
          ).length;
      });
      expect(running).toBeGreaterThan(0);

      const started = Date.now();
      const settled = await page.evaluate(settleScopeInPage, {
        uiTheme: "classic",
        mode: "light",
      });
      const elapsed = Date.now() - started;

      expect(settled.theme).toBe("light");
      expect(settled.pending).toBe(0);
      // It did not resolve at the ~3-frame attribute stability point (~50ms).
      expect(elapsed).toBeGreaterThan(150);
    } finally {
      await page.close();
    }
  });
});
