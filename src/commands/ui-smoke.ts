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
import {
  startPreviewServer,
  launchWebkit,
  isPlaywrightUnavailable,
  type SmokeBrowser,
  type SmokeContext,
} from "./ui-harness.js";

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
  // A review task with a stored report drives the send-to-engineer dialog
  // flow below (#0638). No `branch` in the frontmatter — review recovery
  // skips branchless tasks, so the fixture server never spawns a reviewer
  // for it, and the seeded report is never treated as interrupted work.
  const now = new Date().toISOString();
  writeFileSync(
    join(root, "work", "9001-smoke-review-fixture.md"),
    [
      "---",
      'id: "9001"',
      "title: Smoke review fixture",
      "type: feature",
      "status: review",
      "priority: p2",
      "area: web",
      `created_at: "${now}"`,
      `updated_at: "${now}"`,
      "---",
      "",
      "Fixture task for the send-to-engineer note dialog in the UI smoke test.",
      "",
    ].join("\n"),
  );
  mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
  writeFileSync(
    join(root, ".repoos", "reviews", "9001.md"),
    [
      "---",
      'task: "9001"',
      `at: "${now}"`,
      "agent: reviewer",
      "cli: smoke",
      "model: smoke",
      "branch: feat/smoke-fixture",
      "state: ok",
      "---",
      "",
      "## Verdict",
      "",
      "good to go",
      "",
    ].join("\n"),
  );
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
  let context: SmokeContext | undefined;
  try {
    browser = await launchWebkit();
    context = await browser.newContext({ serviceWorkers: "block" });
  } catch (err) {
    server.close();
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }
  try {
    const page = await context.newPage();
    const consoleErrs: string[] = [];
    const pageErrors: string[] = [];
    // Known-benign API 404s, tracked by URL: the drawer's best-effort usage
    // fetch (`loadTaskUsage`) 404s for a task with no recorded sessions, and
    // the browser logs every failed resource as a console error. The app
    // handles the response (same precedent as the /api/ pageerror filter
    // below), so one tolerated 404 per such URL keeps the gate honest without
    // masking real failures.
    const benign404Urls = new Set<string>();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrs.push(msg.text());
    });
    page.on("response", (res) => {
      if (res.status() === 404 && /\/api\/tasks\/[^/]+\/stats$/.test(res.url())) {
        benign404Urls.add(res.url());
      }
    });
    page.on("pageerror", (err) => {
      // WebKit reports failed optional API requests as page errors when the
      // ephemeral fixture server rejects them during startup. These requests
      // do not affect SPA mounting or the layout assertions below.
      if (!err.message.includes("/api/") || !err.message.includes("access control checks")) {
        pageErrors.push(err.message);
      }
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

    const assertNoHorizontalOverflow = async (label: string, url: string) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(
        () =>
          document.readyState === "complete" &&
          Boolean(document.querySelector("#app")?.textContent?.trim()),
        { timeout: 5_000 },
      );
      const dims = await page.evaluate(() => ({
        scrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (dims.scrollWidth > dims.innerWidth) {
        throw new Error(
          `${label} overflow at 375px viewport: body scrollWidth ${dims.scrollWidth} > innerWidth ${dims.innerWidth}`,
        );
      }
    };

    await assertNoHorizontalOverflow("dashboard", server.url);
    await assertNoHorizontalOverflow("docs", `${server.url}/repo`);

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

    // ── Teleported text fields take real clicks and focus (#0638) ───────
    // The area picker's free-text input and the send-to-engineer note both
    // live in body-teleported layers above a modal drawer. The drawer's Radix
    // focus trap used to yank focus straight back (no caret, no typing), and
    // an intermediate fix suppressed document-level focus events, which
    // starved the global tooltip handler. The layers now pause the trap via
    // their own radix FocusScope, so drive both flows with REAL pointer
    // clicks (page.click, not el.click() — only real pointer events trigger
    // the browser's focus-on-click default action): focus must stick, typing
    // must land, and a focused control inside the layer must still raise the
    // global tooltip.
    const goWork = async (): Promise<void> => {
      await page.evaluate(() => {
        const navItems = document.querySelectorAll(".nav-item");
        for (const item of Array.from(navItems)) {
          if (item.textContent?.includes("Work")) (item as HTMLElement).click();
        }
      });
      await page.waitForTimeout(500);
    };
    const assertActive = async (sel: string, what: string): Promise<void> => {
      const ok = await page.evaluate(
        (s) => document.activeElement === document.querySelector(s),
        sel,
      );
      if (!ok) throw new Error(`${what} did not take focus on a real click (#0638)`);
    };

    // (a) Area picker over the New-task drawer's modal dialog.
    await goWork();
    await page.click(".new-btn");
    await page.waitForTimeout(400);
    await page.click(".drawer-tabs .tab-btn:nth-child(2)"); // Manual mode form
    await page.waitForTimeout(200);
    await page.click("#nt-area"); // opens the teleported picker panel
    await page.waitForTimeout(300);
    const areaInput = 'input[aria-label="Add a custom area"]';
    await page.click(areaInput);
    await assertActive(areaInput, "area picker free-text input");
    await page.keyboard.type("smoke-area");
    const typedArea = await page.evaluate(
      (s) => (document.querySelector(s) as HTMLInputElement | null)?.value ?? "",
      areaInput,
    );
    if (typedArea !== "smoke-area") {
      throw new Error(`area picker input did not accept typing: "${typedArea}"`);
    }
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    // Enter committed the custom area, so the picker now offers to register
    // it — a title-carrying control INSIDE the layer. Focusing it must raise
    // the global tooltip (round-2 regression: suppressed focus events starved
    // exactly this handler).
    const offerBtn = 'div[data-overlay-layer="floating"] button[title]';
    const hasOffer = await page.evaluate((s) => document.querySelector(s) !== null, offerBtn);
    if (!hasOffer) {
      throw new Error("custom area was not committed to the picker selection");
    }
    await page.focus(offerBtn);
    await page.waitForTimeout(120);
    const tooltipShown = await page.evaluate(() => {
      const tip = document.querySelector(".app-tooltip");
      return (
        tip instanceof HTMLElement &&
        tip.classList.contains("show") &&
        (tip.textContent ?? "").includes("repoos.toml")
      );
    });
    if (!tooltipShown) {
      throw new Error("global tooltip did not appear for a focused control inside the area picker");
    }
    await page.keyboard.press("Escape"); // close the picker panel
    await page.keyboard.press("Escape"); // close the new-task drawer
    await page.waitForTimeout(300);

    // (b) Send-to-engineer note over a review task's drawer. The fixture
    // seeds task 9001 (status review) with a stored report so the button is
    // enabled; the flow stops before confirming, so nothing is spawned.
    await goWork();
    await page.click('[data-task-id="9001"]');
    await page.waitForTimeout(600); // drawer opens on the Review tab
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").includes("Send engineer"),
        );
        return Boolean(btn && !btn.hasAttribute("disabled"));
      },
      { timeout: 5_000 },
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("Send engineer"),
      );
      (btn as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    const noteArea = "textarea.ste-note";
    await page.click(noteArea);
    await assertActive(noteArea, "send-to-engineer note textarea");
    await page.keyboard.type("smoke note text");
    const noteValue = await page.evaluate(
      () =>
        (document.querySelector("textarea.ste-note") as HTMLTextAreaElement | null)?.value ?? "",
    );
    if (noteValue !== "smoke note text") {
      throw new Error(`send-to-engineer note did not accept typing: "${noteValue}"`);
    }
    const withNote = await page.evaluate(() =>
      (document.querySelector(".ste-actions button:nth-child(2)")?.textContent ?? "").includes(
        "with note",
      ),
    );
    if (!withNote) {
      throw new Error("confirm button did not reflect the typed note");
    }
    await page.keyboard.press("Escape"); // close the note dialog (never confirmed)
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape"); // close the drawer
    await page.waitForTimeout(300);

    // ── UI recovery banner regression (#0420) ───────────────────────────
    // Intercept /api/health to return a build hash that differs from the
    // client's, which triggers checkUiBuild → showStaleUi on the next
    // route navigation (afterEach hook). Asserts the reload banner renders.
    {
      const recovPage = await context.newPage();
      try {
        await recovPage.goto(server.url, { waitUntil: "load", timeout: 20_000 });
        // Override health to report a different build hash than the client has.
        await recovPage.route("**/api/health", async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as Record<string, unknown>;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ...body, buildHash: "stale-build-hash-for-smoke-test" }),
          });
        });
        // Navigate to another route — afterEach fires checkUiBuild which
        // compares buildHash and calls showStaleUi when they differ.
        await recovPage.evaluate(() => {
          const navItems = document.querySelectorAll(".nav-item");
          for (const item of Array.from(navItems)) {
            if (item.textContent?.includes("Work")) {
              (item as HTMLElement).click();
              return;
            }
          }
        });
        await recovPage.waitForFunction(
          () =>
            document.querySelector(".ui-recovery-banner") !== null ||
            document.body.innerText.includes("RepoOS was updated"),
          { timeout: 5_000 },
        );
      } finally {
        await recovPage.close();
      }
    }

    // Check for zero console errors
    if (consoleErrs.length > 0) {
      // Tolerate one generic failed-resource 404 per known-benign stats 404
      // (the drawer's best-effort usage fetch on a task with no sessions);
      // everything else — other 404s included — is a real failure.
      const resource404 = consoleErrs.filter((t) => t.startsWith("Failed to load resource"));
      const other = consoleErrs.filter((t) => !t.startsWith("Failed to load resource"));
      const excess404 = resource404.slice(benign404Urls.size);
      if (other.length > 0 || excess404.length > 0) {
        const fatal = [...other, ...excess404];
        let msg = "Console errors (" + fatal.length + "): " + fatal.join("; ");
        if (pageErrors.length > 0) msg += " | Page errors: " + pageErrors.join("; ");
        throw new Error(msg);
      }
    }
    if (pageErrors.length > 0) {
      throw new Error("Page errors (" + pageErrors.length + "): " + pageErrors.join("; "));
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    server.close();
    rmSync(fixture, { recursive: true, force: true });
  }
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
        c.dim("    Install: bun add -d @playwright/test && bunx playwright install webkit"),
      );
      return 0;
    }
    console.log(c.red("  ✗ UI smoke test failed: " + msg.split("\n")[0]));
    if (msg.includes("\n")) console.log(c.dim(msg));
    return 1;
  }
}
