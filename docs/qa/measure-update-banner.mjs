#!/usr/bin/env bun
/**
 * QA #1255 — update banner, version display and release notes modal at
 * 375 / 768 / 1280 px. Headless WebKit only; never opens a visible browser.
 *
 * Serves the built SPA from a throwaway fixture root through the shared
 * ui-harness. The update and restart endpoints are answered by the page's
 * route interception, so no supervisor, helper or real restart is ever reached:
 * the restart POST is recorded and faked. Everything else talks to the fixture
 * server, which has an empty board.
 *
 * Usage: bun docs/qa/measure-update-banner.mjs [--shots dir]
 * Output: one PASS/FAIL line per check; exit 1 when any check fails.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

// health reports `isPreviewBuild` so `?shotState=` preview fixtures apply.
process.env.REPOOS_PREVIEW_CHILD = "1";

const { values } = parseArgs({
  options: { shots: { type: "string" } },
});
const shotsDir = values.shots;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const WIDTHS = [375, 768, 1280];
const RUNNING = "0.5.92";
const NEXT = "0.6.0";
const HAND_RUN_COMMAND = "repoos restart --root /fake/project --port 7123";
const NOTES = [
  "## Highlights",
  "",
  "- The update banner now says what changed",
  "- Release notes open in the update dialog",
].join("\n");

/** Throwaway empty board: no tasks, no recovery, no auto-launch (#0260). */
const fixture = mkdtempSync(join(tmpdir(), "repoos-qa-1255-"));
mkdirSync(join(fixture, "work"), { recursive: true });
writeFileSync(join(fixture, "repoos.toml"), 'theme = "dark"\nuiTheme = "classic"\n\n');

const { startPreviewServer, launchWebkit, isPlaywrightUnavailable, teardownUiHarness } =
  await import("../../src/commands/ui-harness.ts");

const server = await startPreviewServer(fixture);
const base = server.url.replace(/\/$/, "");

let browser;
try {
  browser = await launchWebkit({ repoRoot: fixture });
} catch (err) {
  if (isPlaywrightUnavailable(String(err))) {
    console.log(JSON.stringify({ skipped: String(err) }));
    await server.close();
    rmSync(fixture, { recursive: true, force: true });
    process.exit(0);
  }
  throw err;
}

/** In-page helpers (self-contained: Playwright serializes the function). */
const PAGE_HELPERS = `
  window.__qa = {
    rect(el) {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    },
    visible(el) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
    /* Descendants of a root whose box leaves the layout viewport sideways. */
    offscreenIn(root) {
      const vw = document.documentElement.clientWidth;
      return [...root.querySelectorAll("*")]
        .filter((el) => this.visible(el))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -0.5 || r.right > vw + 0.5;
        })
        .map((el) => el.tagName.toLowerCase() + " " + String(el.textContent || "").trim().slice(0, 40));
    },
    /* True when something other than the element (or its descendant) is hit at the centre of
       any of its line fragments. A wrapped inline link has one box per line, and the union box
       (getBoundingClientRect) can centre in the gap between lines, so test each fragment. */
    covered(el) {
      const boxes = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      return boxes.some((r) => {
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(top === el || (top !== null && el.contains(top)));
      });
    },
    intersects(a, b) {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 0 &&
        Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 0;
    },
  };
`;

/**
 * Update endpoints for one scenario. `supervised` picks the systemd or
 * hand-run payload; `restartFails` makes the restart POST return an error.
 * The restart POST is recorded and never reaches the server.
 */
async function installUpdateRoutes(page, { restart, supervised = false, restartFails = false }) {
  const calls = [];
  const idle = { on: false };
  await page.route("**/api/release/run", (route) =>
    route.fulfill({ json: { state: "idle", phase: null } }),
  );
  await page.route("**/api/release/available", (route) =>
    route.fulfill({
      json: {
        currentVersion: RUNNING,
        latestVersion: NEXT,
        available: true,
        releaseNotes: NOTES,
        releaseUrl: "https://github.com/repo-os/repoos/releases/tag/v0.6.0",
        installKind: "standalone",
        upgradeCommand: "repoos upgrade",
      },
    }),
  );
  await page.route("**/api/update-status", (route) => {
    if (!restart) {
      return route.fulfill({
        json: {
          restartPending: false,
          restartWhenIdlePending: false,
          runningVersion: RUNNING,
          installedVersion: RUNNING,
          activeWork: { agents: 0, checks: 0 },
          supervised: false,
          supervisorKind: "none",
          restartFailure: null,
          restartCommand: HAND_RUN_COMMAND,
        },
      });
    }
    return route.fulfill({
      json: {
        restartPending: true,
        restartWhenIdlePending: idle.on,
        runningVersion: RUNNING,
        installedVersion: NEXT,
        activeWork: { agents: 2, checks: 1 },
        supervised,
        supervisorKind: supervised ? "systemd" : "none",
        supervisorPlatform: supervised ? "systemd" : undefined,
        restartFailure: null,
        restartCommand: HAND_RUN_COMMAND,
      },
    });
  });
  await page.route("**/api/update-status/restart", async (route) => {
    const body = route.request().postDataJSON() ?? {};
    calls.push({ whenIdle: !!body.whenIdle, cancel: !!body.cancel });
    if (body.cancel) {
      idle.on = false;
      return route.fulfill({ json: { state: "not-stale" } });
    }
    if (body.whenIdle) {
      idle.on = true;
      return route.fulfill({ json: { state: "waiting" } });
    }
    if (restartFails) {
      return route.fulfill({
        status: 500,
        json: { error: "The service manager could not restart this server." },
      });
    }
    return route.fulfill({ json: { state: "restarting" } });
  });
  return { calls };
}

async function newPage(width, height = 800) {
  const ctx = await browser.newContext({ serviceWorkers: "allow" });
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.addInitScript(PAGE_HELPERS);
  const errors = [];
  // Uncaught exceptions only. A reload aborts in-flight API fetches, and WebKit
  // reports each aborted request as "... due to access control checks."; that is
  // navigation noise, not an app error. The deliberate 500 is a fake restart POST.
  page.on("pageerror", (e) => {
    const message = String(e.message);
    if (!/due to access control checks/.test(message)) errors.push(message.slice(0, 160));
  });
  return { ctx, page, errors };
}

const findings = [];

function record(scenario, width, ok, detail) {
  findings.push({ scenario, width, ok, detail });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${scenario} @${width}${detail === undefined ? "" : " — " + JSON.stringify(detail)}`,
  );
}

async function shot(page, name, width) {
  if (!shotsDir) return;
  // Let the dialog's entrance fade finish, so the capture shows the settled state.
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shotsDir, `${name}-${width}.png`) });
}

/** Common fit checks for a visible root: inside the viewport and every control hit-testable. */
async function fitReport(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const vw = document.documentElement.clientWidth;
    const r = window.__qa.rect(root);
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      vw,
      offscreen: window.__qa.offscreenIn(root),
      uncovered: [...root.querySelectorAll("button, a")]
        .filter((el) => window.__qa.visible(el))
        .filter((el) => window.__qa.covered(el))
        .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)),
    };
  }, selector);
}

function fitOk(report) {
  return (
    report !== null &&
    report.left >= 0 &&
    report.right <= report.vw &&
    report.offscreen.length === 0 &&
    report.uncovered.length === 0
  );
}

// --- Scenarios ------------------------------------------------------------

/** Hand-run and supervised restart dialog: the restart notice a user acts on. */
async function restartScenario(name, { supervised }) {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    const { calls } = await installUpdateRoutes(page, { restart: true, supervised });
    try {
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      const dialog = page.locator('[data-test-id="installed-restart-notice"]');
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
      const text = (await dialog.innerText()).replace(/\s+/g, " ");
      record(
        `${name}: copy names both versions`,
        width,
        text.includes(`RepoOS v${NEXT} is installed`) && text.includes(`still running v${RUNNING}`),
      );
      record(
        `${name}: copy says what a restart does`,
        width,
        text.includes("briefly interrupts agents and checks"),
      );
      record(
        `${name}: no internal jargon in copy`,
        width,
        !/serve flags|#0214/.test(text),
        text.match(/serve flags|#0214/)?.[0] ?? undefined,
      );
      const fit = await fitReport(page, '[data-test-id="installed-restart-notice"]');
      record(`${name}: dialog fits`, width, fitOk(fit), fitOk(fit) ? undefined : fit);

      if (supervised) {
        await page.getByRole("button", { name: "Restart when idle" }).click();
        await page
          .getByText("Restart is waiting for agents, reviews and checks to finish.")
          .waitFor({ timeout: 5_000 });
        await shot(page, `${name}-waiting`, width);
        record(
          `${name}: waiting line uses the muted 12px size`,
          width,
          await page.getByRole("status").evaluate((el) => getComputedStyle(el).fontSize === "12px"),
        );
        record(
          `${name}: waiting state offers Cancel`,
          width,
          (await page.getByRole("button", { name: "Cancel" }).count()) === 1,
        );
        await page.getByRole("button", { name: "Cancel" }).click();
        await page.getByRole("button", { name: "Restart when idle" }).waitFor({ timeout: 5_000 });
        record(`${name}: Cancel returns to Restart when idle`, width, true);
      } else {
        await page.getByRole("button", { name: "Restart when idle" }).click();
        await page
          .getByText("Restart is waiting for agents, reviews and checks to finish.")
          .waitFor({ timeout: 5_000 });
        await shot(page, `${name}-waiting`, width);
        record(
          `${name}: waiting line uses the muted 12px size`,
          width,
          await page.getByRole("status").evaluate((el) => getComputedStyle(el).fontSize === "12px"),
        );
        record(
          `${name}: waiting state disables Restart now`,
          width,
          await page.getByRole("button", { name: "Restart now" }).isDisabled(),
        );
        await page.getByRole("button", { name: "Cancel" }).click();
        await page.getByRole("button", { name: "Restart when idle" }).waitFor({ timeout: 5_000 });
        record(`${name}: Cancel returns to Restart when idle`, width, true);
      }

      await page.getByRole("button", { name: "Restart now" }).click();
      await page.getByRole("button", { name: "Restarting…" }).waitFor({ timeout: 5_000 });
      await shot(page, `${name}-restarting`, width);
      record(`${name}: Restart now shows Restarting…`, width, true);
      record(
        `${name}: restart posts recorded, none reached the server`,
        width,
        calls.length === 3 && calls.at(-1).whenIdle === false,
        calls,
      );
      record(`${name}: no uncaught page errors`, width, errors.length === 0, errors);
    } catch (err) {
      record(`${name}: scenario ran`, width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Failure: the restart POST fails, and the retry copy names the command. */
async function failureScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    await installUpdateRoutes(page, { restart: true, supervised: false, restartFails: true });
    try {
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      const dialog = page.locator('[data-test-id="installed-restart-notice"]');
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("button", { name: "Restart now" }).click();
      const alert = page.locator('[data-test-id="installed-restart-notice"] [role="alert"]');
      await alert.waitFor({ state: "visible", timeout: 5_000 });
      const text = (await alert.innerText()).replace(/\s+/g, " ");
      await shot(page, "failure-hand-run", width);
      record(
        "failure: alert explains what failed",
        width,
        text.startsWith("Restart failed: The service manager could not restart this server."),
      );
      record(
        "failure: alert gives the command to run by hand",
        width,
        text.includes(HAND_RUN_COMMAND),
      );
      const failFit = await fitReport(page, '[data-test-id="installed-restart-notice"]');
      record(
        "failure: failed alert fits",
        width,
        fitOk(failFit),
        fitOk(failFit) ? undefined : failFit,
      );
      record(
        "failure: Restart now stays enabled to retry",
        width,
        await page.getByRole("button", { name: "Restart now" }).isEnabled(),
      );
      record("failure: no uncaught page errors", width, errors.length === 0, errors);
    } catch (err) {
      record("failure: scenario ran", width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Failure fixture (`release:restartError`) must still name the command to run. */
async function restartErrorFixtureScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      await page.goto(`${base}/work?shotState=release:restartError`, {
        waitUntil: "load",
        timeout: 15_000,
      });
      const alert = page.locator('[data-test-id="installed-restart-notice"] [role="alert"]');
      await alert.waitFor({ state: "visible", timeout: 10_000 });
      const text = (await alert.innerText()).replace(/\s+/g, " ");
      await shot(page, "failure-fixture", width);
      record(
        "restartError fixture: names the command to run",
        width,
        /repoos\s+\S+/.test(text.replace("Restart failed:", "")),
        text.slice(0, 160),
      );
      record("restartError fixture: no uncaught page errors", width, errors.length === 0, errors);
    } catch (err) {
      record("restartError fixture: scenario ran", width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Available update: banner, release notes modal, and both dismiss paths. */
async function bannerScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    await installUpdateRoutes(page, { restart: false });
    try {
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      const banner = page.locator(".release-update-banner");
      await banner.waitFor({ state: "visible", timeout: 10_000 });
      const copy = (await banner.innerText()).replace(/\s+/g, " ");
      record(
        "banner: names the new version in plain English",
        width,
        copy.includes(`RepoOS ${NEXT} is ready`) && /See what.s new/.test(copy),
      );
      await shot(page, "banner-available", width);
      record(
        "banner: fits and is not covered by mobile navigation",
        width,
        await page.evaluate(() => {
          const b = document.querySelector(".release-update-banner");
          const tabbar = document.querySelector(".tabbar");
          const dismiss = document.querySelector(".release-update-dismiss");
          const inside = window.__qa.rect(b);
          const vw = document.documentElement.clientWidth;
          return (
            inside.left >= 0 &&
            inside.right <= vw &&
            (!tabbar || !window.__qa.visible(tabbar) || !window.__qa.intersects(b, tabbar)) &&
            !window.__qa.covered(dismiss)
          );
        }),
      );

      await banner.locator("strong").click();
      const modal = page.locator(".release-update-modal", { hasText: `Upgrade to RepoOS ${NEXT}` });
      await modal.waitFor({ state: "visible", timeout: 5_000 });
      await shot(page, "release-notes-modal", width);
      const modalText = (await modal.textContent()).replace(/\s+/g, " ");
      record(
        "modal: explains the upgrade in plain English",
        width,
        modalText.includes("Copy the command to upgrade") &&
          new RegExp(`Installed\\s*${RUNNING.replaceAll(".", "\\.")}`).test(modalText),
      );
      record(
        "modal: release notes are rendered",
        width,
        (await page.locator(".release-update-markdown li").count()) === 2,
      );
      record(
        "modal: release-note list shows bullet markers",
        width,
        await page
          .locator(".release-update-markdown ul")
          .first()
          .evaluate((el) => getComputedStyle(el).listStyleType !== "none"),
      );
      record(
        "modal: fits the viewport",
        width,
        fitOk(await fitReport(page, ".release-update-modal")),
      );

      await modal.getByRole("button", { name: "Not now" }).click();
      await modal.waitFor({ state: "detached", timeout: 5_000 });
      await banner.waitFor({ state: "detached", timeout: 5_000 });
      record("dismiss: Not now hides the banner", width, true);

      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(800);
      record(
        "dismiss: banner stays hidden after reload",
        width,
        (await page.locator(".release-update-banner").count()) === 0,
      );
      record("no uncaught page errors", width, errors.length === 0, errors);
    } catch (err) {
      record("banner: scenario ran", width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Banner X dismisses without opening the modal, and a reload keeps it gone. */
async function bannerXScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    await installUpdateRoutes(page, { restart: false });
    try {
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      await page.locator(".release-update-banner").waitFor({ state: "visible", timeout: 10_000 });
      await page.locator(".release-update-dismiss").click();
      await page.locator(".release-update-banner").waitFor({ state: "detached", timeout: 5_000 });
      record("dismiss X: banner closes", width, true);
      record(
        "dismiss X: does not open the release notes modal",
        width,
        (await page.locator(".release-update-modal").count()) === 0,
      );
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(800);
      record(
        "dismiss X: stays gone after reload",
        width,
        (await page.locator(".release-update-banner").count()) === 0,
      );
      record("dismiss X: no uncaught page errors", width, errors.length === 0, errors);
    } catch (err) {
      record("dismiss X: scenario ran", width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Dismissing the restart notice keeps it closed on reload until a newer version. */
async function restartDismissScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    await installUpdateRoutes(page, { restart: true, supervised: false });
    try {
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      const dialog = page.locator('[data-test-id="installed-restart-notice"]');
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("button", { name: "Dismiss restart notice" }).click();
      await dialog.waitFor({ state: "detached", timeout: 5_000 });
      record("restart dismiss: X closes the notice", width, true);
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(1_000);
      record("restart dismiss: stays closed after reload", width, (await dialog.count()) === 0);
      record("restart dismiss: no uncaught page errors", width, errors.length === 0, errors);
    } catch (err) {
      record("restart dismiss: scenario ran", width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Version display: the sidebar build label is readable at every width. */
async function versionScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    await installUpdateRoutes(page, { restart: false });
    try {
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      await page.waitForTimeout(800);
      const label = page.locator(".build-ver");
      const count = await label.count();
      const shown = count > 0 && (await label.first().isVisible());
      const text = shown ? (await label.first().innerText()).trim() : "";
      record(
        "version: sidebar build label reads vX.Y.Z when shown",
        width,
        !shown || /^v\d+\.\d+\.\d+/.test(text),
        { shown, text },
      );
      record("version: no uncaught page errors", width, errors.length === 0, errors);
    } catch (err) {
      record("version: scenario ran", width, false, String(err).slice(0, 200));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

let failed = 0;
try {
  console.log(`serving ${base}`);
  for (const run of [
    ["banner", bannerScenario],
    ["banner dismiss X", bannerXScenario],
    ["restart supervised", () => restartScenario("supervised", { supervised: true })],
    ["restart hand-run", () => restartScenario("hand-run", { supervised: false })],
    ["restart failure", failureScenario],
    ["restartError fixture", restartErrorFixtureScenario],
    ["restart dismiss", restartDismissScenario],
    ["version", versionScenario],
  ]) {
    console.log(`\n== ${run[0]}`);
    await run[1]();
  }
} catch (err) {
  failed = 1;
  console.error("scenario crashed:", err);
} finally {
  failed = failed !== 0 || findings.some((f) => !f.ok) ? 1 : 0;
  console.log(`\n${findings.length} checks, ${findings.filter((f) => !f.ok).length} failed`);
  await teardownUiHarness({
    browser,
    server,
    removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
  }).catch((err) => console.error("teardown:", String(err)));
}
process.exit(failed);
