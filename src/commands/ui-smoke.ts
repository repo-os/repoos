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
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { c } from "../cli/colors.js";
import { findRepoRoot } from "../core/config.js";
import { makeTempDir } from "../core/temp-dir.js";
import {
  startPreviewServer,
  launchWebkit,
  isPlaywrightUnavailable,
  teardownUiHarness,
  combineHarnessErrors,
  type SmokeBrowser,
  type SmokeContext,
  type SmokePage,
} from "./ui-harness.js";

/**
 * Build a throwaway, empty fixture repo to serve the built SPA against.
 * The smoke test only cares that the built UI renders with zero console errors,
 * so booting it against the live checkout's real board drags in job recovery
 * and preview auto-launch reconciliation for every active/review task (0260).
 * A bare `work/` + minimal `repoos.toml` avoids all of that: no tasks, no
 * recovery, no auto-launch — constant cost regardless of board size.
 */
export function makeSmokeFixture(): string {
  const root = makeTempDir("repoos-smoke-");
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
/** Work view is lazy-loaded; under a loaded gate the board can appear after 500ms. */
async function waitForWorkBoard(page: SmokePage): Promise<void> {
  await page.waitForFunction(() => document.querySelector(".work-page") !== null, {
    timeout: 10_000,
  });
  // Board and Pipeline both stay mounted (#1062 scroll preservation); ensure the
  // board is the active pane before smoke clicks task cards on it.
  await page.evaluate(() => {
    for (const btn of Array.from(document.querySelectorAll(".view-toggle-btn"))) {
      if (btn.textContent?.includes("Board") && !btn.classList.contains("active")) {
        (btn as HTMLElement).click();
      }
    }
  });
  await page.waitForFunction(
    () => {
      const board = document.querySelector(".board");
      return board instanceof HTMLElement && board.offsetParent !== null;
    },
    { timeout: 10_000 },
  );
}

async function runUISmokeTest(): Promise<void> {
  const fixture = makeSmokeFixture();
  let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;
  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  // The body failure (if any) is held here rather than thrown from the try, so
  // the finally below can always run the full teardown and then combine both
  // failures instead of one masking the other (#0859). The wrapper object keeps
  // a thrown `undefined`/`null` from looking like success.
  let primaryError: { error: unknown } | undefined;
  try {
    server = await startPreviewServer(fixture);
    browser = await launchWebkit({
      repoRoot: findRepoRoot(),
      onQueueLine: (line) => console.log(c.dim(`  ${line}`)),
    });
    context = await browser.newContext({ serviceWorkers: "block" });
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
    // Resource-failure console errors, keyed to the URL that failed so each
    // can be matched against `benign404Urls` rather than tolerated by count.
    const resourceErrs: { text: string; url: string }[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.startsWith("Failed to load resource")) {
        resourceErrs.push({ text, url: msg.location().url });
      } else {
        consoleErrs.push(text);
      }
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

    const assertNoHorizontalOverflow = async (
      label: string,
      url: string,
      width = 375,
    ): Promise<void> => {
      await page.setViewportSize({ width, height: width < 600 ? 812 : 900 });
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
          `${label} overflow at ${width}px viewport: body scrollWidth ${dims.scrollWidth} > innerWidth ${dims.innerWidth}`,
        );
      }
    };

    await assertNoHorizontalOverflow("dashboard", server.url);
    await assertNoHorizontalOverflow("docs", `${server.url}/repo`);
    // #1133 — the Agents page replaced its header log with inline per-card
    // status. Check both desktop and phone widths, and that the removed block
    // and toggle do not come back.
    await assertNoHorizontalOverflow("agents", `${server.url}/agents`, 1280);
    const legacyLastRuns = await page.evaluate(() => ({
      block: Boolean(document.querySelector('[data-testid="agents-last-runs"]')),
      toggle: Boolean(document.querySelector('[data-testid="agents-last-runs-toggle"]')),
    }));
    if (legacyLastRuns.block || legacyLastRuns.toggle) {
      throw new Error("Agents page still renders the removed last-runs block or toggle (#1133)");
    }
    await assertNoHorizontalOverflow("agents", `${server.url}/agents`);

    // Navigate to work page and click +New Task
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      const navItems = document.querySelectorAll(".nav-item");
      for (const item of Array.from(navItems)) {
        if (item.textContent?.includes("Work")) (item as HTMLElement).click();
      }
    });
    await waitForWorkBoard(page);

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
      await waitForWorkBoard(page);
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
    await page.click('.task-card[data-task-id="9001"]');
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

    // ── Phone task detail is one full-screen drawer (#1137) ─────────────
    // A queue card, Search and a ?task=<id>&tab= deep link all open the same
    // shared drawer. At 360px it must fit the viewport with its 44px
    // Back/close controls on-screen, every tab reachable by scrolling, and
    // 16px chat inputs so iOS Safari does not zoom on focus.
    {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`${server.url}/work?task=9001&tab=changes`, {
        waitUntil: "load",
        timeout: 20_000,
      });
      await page.waitForFunction(
        () => {
          const drawer = document.querySelector(".drawer");
          if (!(drawer instanceof HTMLElement)) return false;
          const r = drawer.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return false;
          // The drawer slides in over 280ms. Measuring mid-animation reports
          // the translated controls as off-screen, which on a loaded runner
          // used to fail this check even though the settled layout is correct
          // (#1137). Wait for the transform to settle before measuring.
          return getComputedStyle(drawer).transform === "none";
        },
        { timeout: 10_000 },
      );
      await page.waitForTimeout(250);

      const detail = await page.evaluate(() => {
        const rect = (el: Element | null) => {
          if (!(el instanceof HTMLElement)) return null;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return {
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            display: s.display,
            label: el.getAttribute("aria-label"),
          };
        };
        const strip = document.querySelector(".drawer-tabs");
        const closes = document.querySelectorAll('[data-test-id="task-detail-close"]');
        return {
          scrollWidth: document.body.scrollWidth,
          innerWidth: window.innerWidth,
          scrollX: window.scrollX,
          drawer: rect(document.querySelector(".drawer")),
          back: rect(document.querySelector(".drawer-mobile-back")),
          close: rect(closes[0] ?? null),
          closeCount: closes.length,
          hasTabStrip: strip instanceof HTMLElement,
          activeTab:
            document.querySelector(".drawer-tabs .tab-btn.active")?.textContent?.trim() ?? null,
        };
      });
      const geometry = JSON.stringify(detail);
      const within = (r: { left: number; right: number } | null): boolean =>
        r !== null && r.left >= 0 && r.right <= detail.innerWidth + 1;

      if (detail.scrollWidth > detail.innerWidth) {
        throw new Error(
          `phone task detail overflows at 360px: body scrollWidth ${detail.scrollWidth} > innerWidth ${detail.innerWidth} (${geometry}) (#1137)`,
        );
      }
      if (detail.closeCount !== 1) {
        throw new Error(
          `expected exactly one task-detail close control, found ${detail.closeCount} (${geometry}) (#1137)`,
        );
      }
      if (!detail.back || detail.back.display === "none" || !within(detail.back)) {
        throw new Error(
          `phone task detail Back control is missing or off-screen at 360px (${geometry}) (#1137)`,
        );
      }
      if (detail.back.width < 44 || detail.back.height < 44 || !detail.back.label) {
        throw new Error(
          `phone task detail Back control must be 44x44 with an accessible name (${geometry}) (#1137)`,
        );
      }
      if (
        !detail.close ||
        !within(detail.close) ||
        detail.close.width < 44 ||
        detail.close.height < 44 ||
        !detail.close.label
      ) {
        throw new Error(
          `phone task detail close control must be on-screen, 44x44 and labelled (${geometry}) (#1137)`,
        );
      }
      if (!detail.hasTabStrip) {
        throw new Error("phone task detail did not render its tab strip (#1137)");
      }
      if (!detail.activeTab || !/changes/i.test(detail.activeTab)) {
        throw new Error(
          `?tab=changes did not select the Changes tab (got "${detail.activeTab}") (#1137)`,
        );
      }

      // Every tab, including the expand control at the end, must be reachable
      // by scrolling the strip horizontally.
      const lastTabReachable = await page.evaluate(() => {
        const strip = document.querySelector(".drawer-tabs");
        if (!(strip instanceof HTMLElement)) return false;
        strip.scrollLeft = strip.scrollWidth;
        const tabs = strip.querySelectorAll(".tab-btn");
        const last = tabs[tabs.length - 1];
        if (!(last instanceof HTMLElement)) return false;
        const r = last.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1;
      });
      if (!lastTabReachable) {
        throw new Error("the last drawer tab stays unreachable by touch at 360px (#1137)");
      }

      await page.evaluate(() => {
        for (const tab of Array.from(document.querySelectorAll(".drawer-tabs .tab-btn"))) {
          if ((tab.textContent ?? "").trim().startsWith("PM")) {
            (tab as HTMLElement).click();
            return;
          }
        }
      });
      await page.waitForTimeout(300);
      const composerFont = await page.evaluate(() => {
        const ta = document.querySelector(".ai-chat-compose textarea");
        if (!(ta instanceof HTMLElement)) return null;
        return parseFloat(getComputedStyle(ta).fontSize);
      });
      if (composerFont !== null && composerFont < 16) {
        throw new Error(
          `phone drawer chat textarea is ${composerFont}px; iOS zoom needs >=16px (#1137)`,
        );
      }

      const smallControls = await page.evaluate(() => {
        const bad: string[] = [];
        for (const sel of [".pm-canned-item", ".agent-override-bar button"]) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            if (!(el instanceof HTMLElement)) continue;
            const h = el.getBoundingClientRect().height;
            if (h < 43.5) bad.push(`${sel} ${Math.round(h)}px`);
          }
        }
        return bad;
      });
      if (smallControls.length > 0) {
        throw new Error(
          `phone drawer controls under the 44px touch floor: ${smallControls.join(", ")} (#1137)`,
        );
      }

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

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

    // Exercise the actual Checks route across the responsive matrix that
    // prompted #1163. Keep screenshots out of this loop: the goal is to
    // isolate page navigation/layout from repeated capture work.
    {
      const checksPage = await context.newPage();
      const checksPageErrors: string[] = [];
      checksPage.on("pageerror", (err) => {
        if (!err.message.includes("/api/") || !err.message.includes("access control checks")) {
          checksPageErrors.push(err.message);
        }
      });
      const tabs = [
        { label: "Now", query: "now" },
        { label: "Runs", query: "runs" },
        { label: "Test suite", query: "test-suite" },
        { label: "Check plan", query: "plan" },
      ] as const;
      const widths = [1440, 390, 320] as const;

      try {
        for (const appearance of ["light", "dark"] as const) {
          // The app reads its appearance preference during startup.
          await checksPage.goto(server.url, { waitUntil: "load", timeout: 20_000 });
          await checksPage.evaluate((theme) => {
            localStorage.setItem("repoos.theme", theme);
          }, appearance);

          for (const width of widths) {
            await checksPage.setViewportSize({ width, height: width < 600 ? 812 : 900 });
            await checksPage.goto(new URL("/checks?tab=now", server.url).toString(), {
              waitUntil: "load",
              timeout: 20_000,
            });
            await checksPage.waitForFunction(
              () =>
                document.querySelector(".ck-title") !== null &&
                document.querySelector('[role="tab"][aria-selected="true"]') !== null,
              { timeout: 10_000 },
            );

            const renderedAppearance = await checksPage.evaluate(
              () => document.documentElement.dataset.theme,
            );
            if (renderedAppearance !== appearance) {
              throw new Error(
                `Checks theme mismatch at ${width}px: expected ${appearance}, got ${renderedAppearance}`,
              );
            }

            for (const tab of tabs) {
              await checksPage.click(`button[role="tab"]:has-text("${tab.label}")`, {
                timeout: 5_000,
              });
              await checksPage.waitForTimeout(50);
              const state = await checksPage.evaluate(() => {
                const selected = document.querySelector('[role="tab"][aria-selected="true"]');
                return {
                  query: new URL(window.location.href).searchParams.get("tab"),
                  selected: selected?.textContent?.trim(),
                  scrollWidth: document.body.scrollWidth,
                  viewportWidth: window.innerWidth,
                };
              });
              if (state.query !== tab.query || state.selected !== tab.label) {
                throw new Error(
                  `Checks ${tab.label} navigation failed at ${width}px (${appearance}): ` +
                    `query=${state.query}, selected=${state.selected}`,
                );
              }
              if (state.scrollWidth > state.viewportWidth) {
                throw new Error(
                  `Checks ${tab.label} overflows at ${width}px (${appearance}): ` +
                    `body scrollWidth ${state.scrollWidth} > viewport ${state.viewportWidth}`,
                );
              }
            }
          }
        }
        if (checksPageErrors.length > 0) {
          throw new Error(`Checks page errors: ${checksPageErrors.join("; ")}`);
        }
      } finally {
        await checksPage.close();
      }
      console.log(c.dim("  · Checks tabs passed at 1440, 390 and 320px in light and dark mode"));
    }

    // Check for zero console errors
    {
      // Tolerate failed-resource errors only for the known-benign stats 404
      // URLs (the drawer's best-effort usage fetch on a task with no
      // sessions); every other failed resource is a real failure.
      const unexpected = resourceErrs
        .filter((e) => !benign404Urls.has(e.url))
        .map((e) => e.text + (e.url ? " (" + e.url + ")" : ""));
      const fatal = [...consoleErrs, ...unexpected];
      if (fatal.length > 0) {
        let msg = "Console errors (" + fatal.length + "): " + fatal.join("; ");
        if (pageErrors.length > 0) msg += " | Page errors: " + pageErrors.join("; ");
        throw new Error(msg);
      }
    }
    if (pageErrors.length > 0) {
      throw new Error("Page errors (" + pageErrors.length + "): " + pageErrors.join("; "));
    }
  } catch (err) {
    primaryError = { error: err };
  } finally {
    try {
      await teardownUiHarness({
        context,
        browser,
        server,
        // Await every close BEFORE deleting the root: async state persistence
        // can recreate `.repoos/` underneath it, and a throwing browser close
        // must not skip the server close. See #0858, #0859.
        removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
      });
    } catch (teardownErr) {
      primaryError = primaryError
        ? { error: combineHarnessErrors(primaryError.error, teardownErr) }
        : { error: teardownErr };
    }
  }
  if (primaryError) throw primaryError.error;
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
