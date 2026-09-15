/**
 * RepoOS's own headless UI smoke test (#0348).
 *
 * `repoos check`'s ui-smoke step is per-project and opt-in: it runs whatever a
 * project declares (a `smoke` package.json script, or `[check] uiSmoke` in
 * repoos.toml). RepoOS dogfoods that mechanism instead of keeping a
 * RepoOS-only branch in check.ts: its own `smoke` script (scripts/ui-smoke.mjs)
 * calls `cmdUISmoke()` below against the freshly built dist/.
 *
 * Server startup + webkit launch share the harness in ui-harness.ts with the
 * screenshot script (#0213).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c } from "../cli/colors.js";
import { startPreviewServer, launchWebkit, type SmokeBrowser } from "./ui-harness.js";

/**
 * Build a throwaway, empty fixture repo to serve the built SPA against.
 * The smoke test only cares that the built UI renders with zero console errors,
 * so booting it against the live checkout's real board drags in job recovery
 * and preview auto-launch reconciliation for every active/review task (0260).
 * A bare `work/` + minimal `repoos.toml` avoids all of that: no tasks, no
 * recovery, no auto-launch — constant cost regardless of board size.
 */
function makeSmokeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-smoke-"));
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "repoos.toml"), 'theme = "dark"\nuiTheme = "classic"\n\n');
  return root;
}

/**
 * Start the dev server, run Playwright WebKit smoke tests, then stop.
 * Exports failures as thrown errors. Server startup + webkit launch share the
 * harness in ui-harness.ts with the screenshot script (#0213).
 */
async function runUISmokeTest(): Promise<void> {
  const fixture = makeSmokeFixture();
  let server;
  try {
    server = await startPreviewServer(fixture);
  } catch (err) {
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }
  let browser: SmokeBrowser | undefined;
  try {
    browser = await launchWebkit();
  } catch (err) {
    server.close();
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }
  try {
    const page = await browser.newPage();
    const consoleErrs: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrs.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(server.url, { waitUntil: "load", timeout: 20_000 });

    // Check page title is correct
    const title = await page.title();
    if (title !== "RepoOS") throw new Error(`Unexpected title: "${title}"`);

    // Verify we are testing the built Vite SPA, which references hashed
    // assets in /assets/.
    const hashedAsset = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      return scripts.some((s) => (s.getAttribute("src") ?? "").startsWith("/assets/"));
    });
    if (!hashedAsset) {
      throw new Error("Served page is not the built Vite app (no /assets/ bundle)");
    }

    // Check that the app MOUNTED — no unrendered mustache in the DOM
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("{{") || bodyText.includes("}}")) {
      throw new Error("Unrendered mustache found in DOM — Vue did not mount");
    }

    // Check that a known root element rendered with real content
    const appEl = await page.$("#app");
    if (!appEl) throw new Error("#app element not found");

    const hasBrand = await page.evaluate(() => document.body.innerText.includes("RepoOS"));
    if (!hasBrand) throw new Error('Expected "RepoOS" in rendered content');

    // Navigate to work page and click +New Task
    await page.evaluate(() => {
      const navItems = document.querySelectorAll(".nav-item");
      for (const item of Array.from(navItems)) {
        if (item.textContent?.includes("Work")) (item as HTMLElement).click();
      }
    });
    await page.waitForTimeout(500);

    // Verify work page rendered
    const workEl = await page.$(".board");
    if (!workEl) {
      consoleErrs.push("Work page board not rendered — check page navigation");
    }

    // Check that the +New Task button exists
    const newBtn = await page.$(".new-btn");
    if (!newBtn) {
      consoleErrs.push("+New Task button not found in DOM");
    }

    // ── CSS regression guard: utility spacing must actually apply ─────
    // Tailwind v4 emits all its CSS inside cascade layers. If an
    // UNLAYERED reset such as `*{padding:0;margin:0}` is ever added to
    // style.css, it silently beats every spacing utility (unlayered rules
    // take precedence over @layer rules), collapsing padding on shadcn
    // controls while console stays clean. Flag any non-explicit-zero
    // spacing utility whose computed value is 0.
    const assertUtilitySpacing = async (where: string) => {
      const offenders = await page.evaluate(() => {
        const AXIS: Record<string, string[]> = {
          p: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
          px: ["paddingLeft", "paddingRight"],
          py: ["paddingTop", "paddingBottom"],
          pt: ["paddingTop"],
          pr: ["paddingRight"],
          pb: ["paddingBottom"],
          pl: ["paddingLeft"],
          m: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
          mx: ["marginLeft", "marginRight"],
          my: ["marginTop", "marginBottom"],
          mt: ["marginTop"],
          mr: ["marginRight"],
          mb: ["marginBottom"],
          ml: ["marginLeft"],
        };
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if (!(el instanceof HTMLElement)) continue;
          const s = getComputedStyle(el) as unknown as Record<string, string>;
          for (const cls of el.classList) {
            if (cls.startsWith("-")) continue; // negative margins are intentional
            const m = /^([pm])([trblxy]?)-(?:\[)?([1-9])/.exec(cls);
            if (!m) continue;
            for (const prop of AXIS[m[1] + m[2]] ?? []) {
              if (parseFloat(s[prop] as string) <= 0) {
                bad.push(`${cls} → ${prop} = ${s[prop]} on <${el.tagName.toLowerCase()}>`);
                break;
              }
            }
          }
        }
        return [...new Set(bad)];
      });
      if (offenders.length > 0) {
        throw new Error(
          "Utility spacing collapsed on " + where + ": " + offenders.slice(0, 6).join("; "),
        );
      }
    };

    await assertUtilitySpacing("dashboard");

    // Re-run the guard on the settings page (covers shadcn Button + Select)
    await page.evaluate(() => {
      const navItems = document.querySelectorAll(".nav-item");
      for (const item of Array.from(navItems)) {
        if (item.textContent?.includes("Settings")) (item as HTMLElement).click();
      }
    });
    await page.waitForTimeout(500);
    await assertUtilitySpacing("settings");

    // Check for zero console errors
    if (consoleErrs.length > 0) {
      let msg = "Console errors (" + consoleErrs.length + "): " + consoleErrs.join("; ");
      if (pageErrors.length > 0) msg += " | Page errors: " + pageErrors.join("; ");
      throw new Error(msg);
    }
    if (pageErrors.length > 0) {
      throw new Error("Page errors (" + pageErrors.length + "): " + pageErrors.join("; "));
    }
  } finally {
    if (browser) await browser.close();
    server.close();
    rmSync(fixture, { recursive: true, force: true });
  }
}

/** A missing @playwright/test install or WebKit binary — a skip, not a failure. */
function isPlaywrightUnavailable(msg: string): boolean {
  return (
    msg.includes("Cannot find module") ||
    msg.includes("not installed") ||
    msg.includes("Executable doesn't exist")
  );
}

/**
 * Run the smoke test with the same outcomes `repoos check` used to apply
 * in-process: pass → 0, Playwright/WebKit unavailable → skip (0), anything
 * else → 1. Returns the exit code so the caller decides how to exit.
 */
export async function cmdUISmoke(): Promise<number> {
  try {
    await runUISmokeTest();
    console.log(c.green("  ✔ UI smoke test passed"));
    return 0;
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (isPlaywrightUnavailable(msg)) {
      console.log(c.dim("  · Playwright not available — UI smoke test skipped"));
      console.log(
        c.dim("    Install: bun add -d @playwright/test && npx playwright install webkit"),
      );
      return 0;
    }
    console.log(c.red("  ✗ UI smoke test failed: " + msg.split("\n")[0]));
    if (msg.includes("\n")) console.log(c.dim(msg));
    return 1;
  }
}
