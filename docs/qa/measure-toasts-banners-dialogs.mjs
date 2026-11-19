#!/usr/bin/env bun
/**
 * QA #1225 — toasts, banners and dialogs together: stacking, dismissal and
 * keyboard use at 375 / 768 / 1280 px. Headless WebKit only; never opens a
 * visible browser or steals focus.
 *
 * Serves the built SPA (dist/ui) from a throwaway fixture root through the
 * shared ui-harness (the same server path `repoos check`'s smoke gate uses),
 * with REPOOS_PREVIEW_CHILD=1 so `?shotState=` preview fixtures apply. State
 * comes from fixtures and real clicks — nothing writes to a live board.
 *
 * Usage: bun docs/qa/measure-toasts-banners-dialogs.mjs [--shots dir]
 * Output: JSON findings on stdout; exit 1 when any check fails.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

// health reports `isPreviewBuild` so preview-board fixtures apply (#0743).
process.env.REPOOS_PREVIEW_CHILD = "1";

const { values } = parseArgs({
  options: { shots: { type: "string" } },
});
const shotsDir = values.shots;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const WIDTHS = [375, 768, 1280];

/** Throwaway empty board: no tasks, no recovery, no auto-launch (#0260). */
const fixture = mkdtempSync(join(tmpdir(), "repoos-qa-1225-"));
mkdirSync(join(fixture, "work"), { recursive: true });
writeFileSync(join(fixture, "repoos.toml"), 'theme = "dark"\nuiTheme = "classic"\n\n');
// One branchless review task (review recovery skips branchless tasks, so the
// fixture server never spawns a reviewer for it) — the drawer scenario opens
// it through the standard `/work?task=9001` route.
const now = new Date().toISOString();
writeFileSync(
  join(fixture, "work", "9001-drawer-qa-fixture.md"),
  [
    "---",
    'id: "9001"',
    "title: QA drawer fixture",
    "type: bug",
    "status: review",
    "priority: p2",
    "area: web",
    `created_at: "${now}"`,
    `updated_at: "${now}"`,
    "---",
    "",
    "Fixture task for the drawer-over-toasts scenario in the #1225 QA pass.",
    "",
  ].join("\n"),
);

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
    intersect(a, b) {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w > 0 && h > 0;
    },
    visible(el) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
    rect(el) {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    },
    viewport() {
      return { vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight };
    },
    toastRects() {
      return [...document.querySelectorAll(".toast-item")]
        .filter((el) => this.visible(el))
        .map((el) => ({ ...this.rect(el), msg: el.textContent.trim().slice(0, 60) }));
    },
    navControls() {
      const sels = [".topbar button", ".topbar a", ".tabbar button", ".tabbar a"];
      return sels
        .flatMap((s) => [...document.querySelectorAll(s)])
        .filter((el) => this.visible(el) && el.closest(".toast-panel") === null)
        .map((el) => ({ ...this.rect(el), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40) }));
    },
    toastsBlockingNav() {
      const toasts = this.toastRects();
      return this.navControls()
        .map((c) => ({ control: c.label, coveredBy: toasts.filter((t) => this.intersect(t, c)).length }))
        .filter((r) => r.coveredBy > 0);
    },
    toastSelfOverlaps() {
      const toasts = this.toastRects();
      const out = [];
      for (let i = 0; i < toasts.length; i++)
        for (let j = i + 1; j < toasts.length; j++)
          if (this.intersect(toasts[i], toasts[j])) out.push([toasts[i].msg, toasts[j].msg]);
      return out;
    },
    offscreenToasts() {
      const { vw, vh } = this.viewport();
      return this.toastRects()
        .filter((r) => r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1)
        .map((r) => ({ ...r, vw, vh }));
    },
    /* Which element would actually receive a pointer event at a point — used
       to prove a dismiss control is dead (something floats over it). */
    topElementAt(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className && el.className.baseVal === undefined ? el.className : "").slice(0, 60),
        text: (el.textContent || "").trim().slice(0, 40),
      };
    },
    /* Dismiss buttons whose center is hit-tested by something else. */
    deadButtons(selector) {
      return [...document.querySelectorAll(selector)]
        .filter((btn) => this.visible(btn))
        .map((btn) => {
          const r = btn.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const live = top !== null && (top === btn || btn.contains(top) || top.contains(btn));
          return live
            ? null
            : {
                label: (btn.getAttribute("aria-label") || btn.textContent || "").trim().slice(0, 40),
                top: top
                  ? top.tagName.toLowerCase() +
                    "." +
                    String(
                      top.className && top.className.baseVal === undefined ? top.className : "",
                    ).slice(0, 50)
                  : "none",
              };
        })
        .filter(Boolean);
    },
    closeButtons() {
      return [...document.querySelectorAll(".toast-item .toast-close")].filter((el) => this.visible(el));
    },
  };
`;

async function newPage(width) {
  const ctx = await browser.newContext({ serviceWorkers: "allow" });
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: 800 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  return { ctx, page, errors };
}

const findings = [];

function record(scenario, width, ok, detail) {
  findings.push({ scenario, width, ok, detail });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${scenario} @${width}${detail ? " — " + JSON.stringify(detail) : ""}`,
  );
}

async function waitToasts(page, count) {
  await page.waitForFunction((n) => document.querySelectorAll(".toast-item").length >= n, count, {
    timeout: 10_000,
  });
}

async function waitDrawer(page) {
  // Radix unmounts the drawer when closed; presence is the whole signal. (A
  // `position: fixed` element reports `offsetParent === null`, so visibility
  // can't be checked that way here.)
  await page.waitForFunction(() => document.querySelector(".drawer-wrap.drawer") !== null, undefined, {
    timeout: 10_000,
  });
}

// ── Scenario 1: a full toast stack — layout, overlap, dismiss ────────────────
async function toastStackScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      await page.goto(`${base}/work?shotState=toast:stack`, { waitUntil: "load", timeout: 15_000 });
      await page.waitForTimeout(1_500); // board mount + fixture apply
      await page.evaluate(PAGE_HELPERS);
      await waitToasts(page, 5);

      if (shotsDir) {
        await page.screenshot({ path: join(shotsDir, `toast-stack-${width}.png`) });
      }

      const offscreen = await page.evaluate(() => window.__qa.offscreenToasts());
      record("toast-stack:all-in-viewport", width, offscreen.length === 0, offscreen);

      const selfOverlaps = await page.evaluate(() => window.__qa.toastSelfOverlaps());
      record("toast-stack:no-overlap", width, selfOverlaps.length === 0, selfOverlaps);

      const navBlocked = await page.evaluate(() => window.__qa.toastsBlockingNav());
      record("toast-stack:nav-clear", width, navBlocked.length === 0, navBlocked);

      // Topbar must not reach under the stack either: the panel starts below
      // the 64px topbar on every width; catch a taller wrapped topbar.
      const topbarGap = await page.evaluate(() => {
        const bar = document.querySelector(".topbar");
        const panel = document.querySelector(".toast-panel");
        if (!bar || !panel) return null;
        return Math.round(panel.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
      });
      record(
        "toast-stack:below-topbar",
        width,
        topbarGap === null || topbarGap >= 0,
        topbarGap === null ? "topbar/panel not found" : { gap: topbarGap },
      );

      // Dismiss by real click: the BOTTOM-most toast (last message) goes away.
      const bottomMsg = await page.evaluate(() => {
        const btns = window.__qa.closeButtons();
        return btns[btns.length - 1].closest(".toast-item").textContent.trim().slice(0, 60);
      });
      await page.evaluate(() => {
        const btns = window.__qa.closeButtons();
        btns[btns.length - 1].click();
      });
      await page.waitForFunction(() => document.querySelectorAll(".toast-item").length === 4, undefined, {
        timeout: 5_000,
      });
      const remaining = await page.evaluate(() =>
        [...document.querySelectorAll(".toast-item")].map((el) =>
          el.textContent.trim().slice(0, 40),
        ),
      );
      record(
        "toast-stack:click-dismiss",
        width,
        !remaining.some((m) => m.startsWith(bottomMsg.slice(0, 40))),
        { removed: bottomMsg, remaining: remaining.length },
      );

      // Dismiss by keyboard: focus a close button, press Enter.
      await page.evaluate(() => window.__qa.closeButtons()[0].focus());
      const focusedMsg = await page.evaluate(() => {
        const item = document.activeElement.closest(".toast-item");
        return item ? item.textContent.trim().slice(0, 60) : null;
      });
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelectorAll(".toast-item").length === 3, undefined, {
        timeout: 5_000,
      });
      const after = await page.evaluate(() =>
        [...document.querySelectorAll(".toast-item")].map((el) =>
          el.textContent.trim().slice(0, 40),
        ),
      );
      record(
        "toast-stack:keyboard-dismiss",
        width,
        focusedMsg !== null && !after.some((m) => focusedMsg.startsWith(m)),
        { focused: focusedMsg },
      );

      // Dead-dismiss probe: each remaining close button must be the
      // elementFromPoint target at its own center.
      const dead = await page.evaluate(() => window.__qa.deadButtons(".toast-item .toast-close"));
      record("toast-stack:close-buttons-live", width, dead.length === 0, dead);

      if (errors.length) record("toast-stack:page-errors", width, false, errors);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

// ── Scenario 2: board load-error banner — visible, retry clears it ───────────
// Two surfaces for the same failed board fetch: the desktop board banner and
// the mobile queue's own error state. Each must fit its viewport and its
// Retry control must clear it (not a stuck banner).
//
// The failure is produced by intercepting /api/board (the fixture-pinned
// `work:failedLoad` state cannot model "retry works": refresh() re-applies the
// capture fixture on every successful reload by design, #0782), so Retry is
// tested against a real recovery, not a pinned one.
async function boardBannerScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      const bannerSel = '[data-testid="work-load-error"], [data-testid="mobile-work-load-error"]';
      // Fail every /api/board until the Retry step: the board fetch fails, the
      // page boots healthy otherwise.
      await page.route("**/api/board", (route) => route.abort());
      await page.goto(`${base}/work`, { waitUntil: "load", timeout: 15_000 });
      await page.waitForFunction((sel) => document.querySelector(sel) !== null, bannerSel, {
        timeout: 15_000,
      });
      await page.evaluate(PAGE_HELPERS);

      if (shotsDir) {
        await page.screenshot({ path: join(shotsDir, `board-banner-${width}.png`) });
      }

      const probe = await page.evaluate((sel) => {
        const banner = document.querySelector(sel);
        const { vw, vh } = window.__qa.viewport();
        const r = window.__qa.rect(banner);
        const retry = [...banner.querySelectorAll("button")].find((b) => window.__qa.visible(b));
        const dead = window.__qa.deadButtons(sel + " button");
        return {
          surface: banner.getAttribute("data-testid"),
          inViewport: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1,
          rect: r,
          hasRetry: !!retry,
          retryLabel: retry ? retry.textContent.trim() : null,
          dead,
        };
      }, bannerSel);
      record("board-banner:surface", width, true, probe.surface);
      record("board-banner:in-viewport", width, probe.inViewport, probe.rect);
      record("board-banner:retry-present", width, probe.hasRetry && probe.dead.length === 0, {
        label: probe.retryLabel,
        dead: probe.dead,
      });

      // Not stuck: with the failure lifted, Retry reloads the board and the
      // banner clears itself.
      await page.unroute("**/api/board");
      await page.evaluate((sel) => {
        const banner = document.querySelector(sel);
        const retry = [...banner.querySelectorAll("button")].find((b) => window.__qa.visible(b));
        retry.click();
      }, bannerSel);
      await page.waitForFunction((sel) => document.querySelector(sel) === null, bannerSel, {
        timeout: 15_000,
      });
      record("board-banner:retry-clears", width, true, null);

      if (errors.length) record("board-banner:page-errors", width, false, errors);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

// ── Scenario 3: release-update dialog — fits, Escape and X both dismiss ──────
async function dialogScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      const open = async () => {
        await page.goto(`${base}/releases?shotState=release:updateAvailable`, {
          waitUntil: "load",
          timeout: 15_000,
        });
        await page.waitForFunction(
          () =>
            document.querySelector(
              '[data-test-id="installed-restart-notice"], .release-update-modal',
            ) !== null,
          undefined,
          { timeout: 10_000 },
        );
        await page.evaluate(PAGE_HELPERS);
      };
      await open();

      if (shotsDir) {
        await page.screenshot({ path: join(shotsDir, `dialog-release-${width}.png`) });
      }

      const fit = await page.evaluate(() => {
        const dlg = document.querySelector(".release-update-modal");
        const { vw, vh } = window.__qa.viewport();
        const r = window.__qa.rect(dlg);
        return {
          inViewport: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1,
          rect: r,
        };
      });
      record("dialog:fits-viewport", width, fit.inViewport, fit.rect);

      // Escape dismisses. The capture fixture is re-applied at the end of every
      // SSE-triggered board refresh (#0782), and for this fixture that re-run
      // opens the dialog again — Escape pressed inside that initial window
      // closes it and the re-apply reopens it ~20ms later, a blink the
      // rAF-polling wait can miss. Press only after the re-application has
      // settled, so the dismissal is the last state change. One guarded retry
      // covers a lost key event (harness input delivery, not app behaviour).
      await page.waitForTimeout(1_500);
      const gone = () =>
        page.waitForFunction(() => document.querySelector(".release-update-modal") === null, undefined, {
          timeout: 5_000,
        });
      try {
        await page.keyboard.press("Escape");
        await gone();
      } catch {
        await page.keyboard.press("Escape");
        await gone();
      }
      record("dialog:escape-dismiss", width, true, null);

      // The X button dismisses too (re-open via fixture reload). Same settle
      // as the Escape check: the refresh re-applies the fixture and re-opens
      // the dialog, so click only after that has settled (#0782).
      await open();
      await page.waitForTimeout(1_500);
      await page.evaluate(() => {
        const btn = document.querySelector('.release-update-modal [aria-label="Close"]');
        btn.click();
      });
      await page.waitForFunction(() => document.querySelector(".release-update-modal") === null, undefined, {
        timeout: 5_000,
      });
      record("dialog:close-button", width, true, null);

      if (errors.length) record("dialog:page-errors", width, false, errors);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

// ── Scenario 4: toast stack under an open task drawer ────────────────────────
// `/work?task=9001&shotState=toast:stack` opens the drawer directly over the
// seeded toast stack. The drawer must own the interaction; toasts may sit
// under it but must never block the drawer's own close control.
async function drawerOverToastsScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      await page.goto(`${base}/work?task=9001&shotState=toast:stack`, {
        waitUntil: "load",
        timeout: 15_000,
      });
      await page.evaluate(PAGE_HELPERS);
      await waitDrawer(page);
      await waitToasts(page, 5);

      if (shotsDir) {
        await page.screenshot({ path: join(shotsDir, `drawer-over-toasts-${width}.png`) });
      }

      // The drawer's close button must be the hit-test target at its center.
      // Wait for the entrance animation to settle first: the panel slides in
      // from off-viewport, and a probe during the slide finds the button's
      // centre outside the viewport — elementFromPoint returns null, which
      // would read as a dead button that nothing actually covers.
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('[aria-label="Close task detail"]');
          if (!btn) return false;
          const r = btn.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          return cx >= 0 && cx <= vw && cy >= 0 && cy <= vh;
        },
        undefined,
        { timeout: 5_000 },
      );
      const closeProbe = await page.evaluate(() => {
        const btn = document.querySelector('[aria-label="Close task detail"]');
        if (!btn) return null;
        const r = window.__qa.rect(btn);
        const toasts = window.__qa.toastRects();
        const covered = toasts.filter((t) => window.__qa.intersect(t, r));
        const dead = window.__qa.deadButtons('[aria-label="Close task detail"]');
        return { dead, toastsCoveringClose: covered.length };
      });
      record(
        "drawer-over-toasts:close-live",
        width,
        closeProbe !== null && closeProbe.dead.length === 0,
        closeProbe,
      );

      // Escape closes the drawer. Same settle as the dialog check: presses in
      // the page's first moments can be lost or race the post-refresh fixture
      // re-application (#0782); wait for quiescence, then press — with one
      // guarded retry against lost key delivery.
      await page.waitForTimeout(1_500);
      const drawerGone = () =>
        page.waitForFunction(() => document.querySelector(".drawer-wrap.drawer") === null, undefined, {
          timeout: 5_000,
        });
      try {
        await page.keyboard.press("Escape");
        await drawerGone();
      } catch {
        await page.keyboard.press("Escape");
        await drawerGone();
      }
      record("drawer-over-toasts:escape-dismiss", width, true, null);

      if (errors.length) record("drawer-over-toasts:page-errors", width, false, errors);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

// ── Scenario 5: recovery banner over the toast stack ─────────────────────────
// With toasts seeded, abort the API and fire a focus-triggered health check —
// the same path a stalled server takes — so the offline banner appears on top
// of the stack. The banner may cover page content, but the toasts must either
// stay reachable or get out of the banner's way; the banner's own Dismiss must
// be live and clear it.
async function recoveryBannerScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      await page.goto(`${base}/work?shotState=toast:stack`, { waitUntil: "load", timeout: 15_000 });
      await page.evaluate(PAGE_HELPERS);
      await waitToasts(page, 5);
      // From now on every API request fails, like a stalled server.
      await page.route("**/api/**", (route) => route.abort());
      // A focus-triggered checkUp joins any in-flight health check, and the
      // startup check (fired by the router) may still be in flight here — that
      // focus would be consumed without a fresh probe ever seeing the abort.
      // Keep nudging focus until the banner is up; extra nudges are harmless
      // (showOffline is idempotent and an offline state short-circuits the
      // message path).
      for (let nudge = 0; nudge < 20; nudge++) {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        const up = await page
          .waitForFunction(() => document.querySelector(".ui-recovery-banner") !== null, undefined, {
            timeout: 2_000,
          })
          .then(() => true)
          .catch(() => false);
        if (up) break;
      }
      await page.waitForFunction(() => document.querySelector(".ui-recovery-banner") !== null, undefined, {
        timeout: 15_000,
      });

      if (shotsDir) {
        await page.screenshot({ path: join(shotsDir, `recovery-banner-${width}.png`) });
      }

      const probe = await page.evaluate(() => {
        const banner = document.querySelector(".ui-recovery-banner");
        const bRect = window.__qa.rect(banner);
        const toasts = window.__qa.toastRects();
        const hiddenToasts = toasts.filter((t) => window.__qa.intersect(t, bRect));
        // Is any toast close button dead under the banner?
        const dead = window.__qa.deadButtons(".toast-item .toast-close");
        const dismiss = [...banner.querySelectorAll("button")].find((b) =>
          (b.textContent || "").includes("Dismiss"),
        );
        return {
          banner: bRect,
          toastCount: toasts.length,
          hiddenToasts: hiddenToasts.length,
          dead,
          hasDismiss: !!dismiss,
        };
      });
      record("recovery-banner:toast-close-live", width, probe.dead.length === 0, {
        hiddenToasts: probe.hiddenToasts,
        dead: probe.dead,
      });
      record("recovery-banner:dismiss-present", width, probe.hasDismiss, null);

      // Dismiss clears the banner (not stuck).
      await page.evaluate(() => {
        const banner = document.querySelector(".ui-recovery-banner");
        const dismiss = [...banner.querySelectorAll("button")].find((b) =>
          (b.textContent || "").includes("Dismiss"),
        );
        dismiss.click();
      });
      await page.waitForFunction(() => document.querySelector(".ui-recovery-banner") === null, undefined, {
        timeout: 5_000,
      });
      record("recovery-banner:dismiss-clears", width, true, null);

      if (errors.length) record("recovery-banner:page-errors", width, false, errors);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

// ── Scenario 6: notice-bell popover over the toast stack ─────────────────────
// The bell popover is top-right, the same corner as the toast stack. With the
// stack seeded and the popover deliberately opened, the popover's controls
// must stay live (the toasts drop below it), and closing the popover hands the
// corner back.
async function noticePopoverScenario() {
  for (const width of WIDTHS) {
    const { ctx, page, errors } = await newPage(width);
    try {
      await page.goto(`${base}/work?shotState=toast:stack`, { waitUntil: "load", timeout: 15_000 });
      await page.evaluate(PAGE_HELPERS);
      await waitToasts(page, 5);
      // Real click on the bell trigger (a real pointer event, like touch).
      await page.click('[data-test-id="notice-bell-trigger"]');
      await page.waitForFunction(
        () => document.querySelector('[data-test-id="notice-bell-popover"]') !== null,
        undefined,
        { timeout: 5_000 },
      );
      // Let async popover content land and the ResizeObserver republish the
      // toast drop, so the probe measures the steady state, not one frame.
      await page.waitForTimeout(700);

      if (shotsDir) {
        await page.screenshot({ path: join(shotsDir, `notice-popover-${width}.png`) });
      }

      const probe = await page.evaluate(() => {
        const pop = document.querySelector('[data-test-id="notice-bell-popover"]');
        const popRect = window.__qa.rect(pop);
        const toasts = window.__qa.toastRects();
        const dead = window.__qa.deadButtons(
          '[data-test-id="notice-bell-popover"] button, [data-test-id="notice-bell-popover"] a[href]',
        );
        // After the fix the stack must sit below the popover (no overlap).
        const overlapping = toasts.filter((t) => window.__qa.intersect(t, popRect));
        return {
          popRect,
          overlapping: overlapping.length,
          dead,
          firstToastTop: toasts.length ? Math.round(toasts[0].top) : null,
        };
      });
      record(
        "notice-popover:no-toast-overlap",
        width,
        probe.overlapping === 0 && probe.dead.length === 0,
        {
          overlapping: probe.overlapping,
          dead: probe.dead,
          firstToastTop: probe.firstToastTop,
          pop: probe.popRect,
        },
      );

      // Escape closes the popover and the stack returns above its default top.
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => document.querySelector('[data-test-id="notice-bell-popover"]') === null,
        undefined,
        { timeout: 5_000 },
      );
      const after = await page.evaluate(() => {
        const toasts = window.__qa.toastRects();
        return toasts.length ? Math.round(toasts[0].top) : null;
      });
      record(
        "notice-popover:corner-returned",
        width,
        after !== null && after < probe.firstToastTop,
        { closedTop: after, openTop: probe.firstToastTop },
      );

      if (errors.length) record("notice-popover:page-errors", width, false, errors);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

let failed = 0;
try {
  console.log(`serving ${base}`);
  for (const run of [
    toastStackScenario,
    boardBannerScenario,
    dialogScenario,
    drawerOverToastsScenario,
    recoveryBannerScenario,
    noticePopoverScenario,
  ]) {
    console.log(`\n== ${run.name}`);
    await run();
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
