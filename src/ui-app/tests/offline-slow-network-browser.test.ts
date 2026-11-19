/**
 * Slow network / offline QA pass (#1226).
 *
 * Headless WebKit against the built app, served from a throwaway fixture root,
 * with Playwright request interception driving the three failure modes the QA
 * pass covers — no visible browser, no real outage:
 *
 *   - offline:   every `/api/**` request is aborted (connection refused)
 *   - 500:       every `/api/**` request answers HTTP 500
 *   - slow:      responses stall past the client's own timeout, or arrive late
 *
 * Each page under test (Work, the task drawer, Agents, Settings) must show a
 * plain-English status — never a blank screen or an endless spinner — stay
 * usable at 375 / 768 / 1280 px, and recover once the server is reachable
 * again. Skips cleanly when Playwright/WebKit is not installed.
 */
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSmokeFixture } from "../../commands/ui-smoke.js";
import {
  isPlaywrightUnavailable,
  launchWebkit,
  startPreviewServer,
  teardownUiHarness,
  type PreviewServer,
  type SmokeBrowser,
  type SmokePage,
} from "../../commands/ui-harness.js";

let browser: SmokeBrowser | null = null;
let server: PreviewServer | null = null;
let fixtureRoot: string | null = null;
let unavailable = false;
const bootErrors: string[] = [];
try {
  fixtureRoot = makeSmokeFixture();
  server = await startPreviewServer(fixtureRoot);
  browser = await launchWebkit();
} catch (err) {
  const message = (err as Error).message ?? String(err);
  if (isPlaywrightUnavailable(message)) unavailable = true;
  else bootErrors.push(message);
}

const describeBrowser = browser && !unavailable ? describe : describe.skip;

afterAll(async () => {
  // #1226 review round 1: close each artifact that exists, even when an
  // earlier boot step failed (launchWebkit throwing after startPreviewServer
  // must still close the server) and never let one close skip the rest —
  // teardownUiHarness already tolerates partial inputs and folds failures.
  try {
    await teardownUiHarness({
      browser: browser ?? undefined,
      server: server ?? undefined,
      removeFixture: () => {
        if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
      },
    });
  } catch (err) {
    console.error((err as Error).message);
  }
  fixtureRoot = null;
});

const VIEWPORTS = [375, 768, 1280] as const;

/** A fresh page that records uncaught errors (asserted per test). */
async function openPage(width: (typeof VIEWPORTS)[number] = 1280): Promise<SmokePage> {
  const page = await browser!.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (err: Error) => {
    // Same tolerance as the UI smoke gate: WebKit reports failed optional API
    // requests as page errors when the ephemeral fixture server is still
    // settling (or rejects one during teardown). They do not affect what
    // these tests assert. Anything else is a real defect.
    if (!err.message.includes("/api/") || !err.message.includes("access control checks")) {
      bootErrors.push(`pageerror: ${err.message}`);
    }
  });
  return page;
}

/** Every `/api/**` request fails the same way for the whole scenario. */
async function failAllApi(
  page: SmokePage,
  fail: (route: Parameters<Parameters<SmokePage["route"]>[1]>[0]) => Promise<void>,
): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    // The SSE stream and app assets are not part of the scenario.
    if (url.pathname === "/api/events") {
      await route.fulfill({ response: await route.fetch() });
      return;
    }
    await fail(route);
  });
}

/** Abort everything — the server is unreachable. */
async function goOffline(page: SmokePage): Promise<void> {
  await failAllApi(page, async (route) => {
    await route.abort();
  });
}

/** HTTP 500 with a plain-English JSON error, like a real server-side failure. */
async function failAllWith500(page: SmokePage): Promise<void> {
  await failAllApi(page, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "The server hit an unexpected error" }),
    });
  });
}

async function expectNoHorizontalOverflow(page: SmokePage, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
}

describeBrowser("slow network and offline QA (#1226)", () => {
  it("has a usable headless browser and server", () => {
    expect(bootErrors).toEqual([]);
    expect(unavailable).toBe(false);
  });

  it("offline: Work shows a plain-English failure, no endless skeleton, usable at every width", async () => {
    const page = await openPage();
    try {
      await goOffline(page);
      await page.goto(`${server!.url}/work`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="work-load-error"]') !== null,
        { timeout: 10_000 },
      );
      // The loading shell must have resolved to the error, not spun forever.
      await page.waitForFunction(() => !document.querySelector(".page-loading"), {
        timeout: 5_000,
      });
      const text = await page.evaluate(
        () => document.querySelector('[data-testid="work-load-error"]')?.textContent ?? "",
      );
      expect(text).toContain("Couldn't load this project's tasks");
      expect(text).toContain("Can't reach the RepoOS server");

      // The global recovery banner names the problem in plain English too.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(() => document.querySelector(".ui-recovery-banner") !== null, {
        timeout: 10_000,
      });
      const banner = await page.evaluate(() => {
        const el = document.querySelector(".ui-recovery-banner");
        return { title: el?.querySelector("strong")?.textContent ?? "" };
      });
      expect(banner.title).toContain("is not running");

      for (const width of VIEWPORTS) await expectNoHorizontalOverflow(page, width);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("offline: Agents and Settings replace their skeletons with actionable errors", async () => {
    const page = await openPage();
    try {
      await goOffline(page);
      for (const [route, heading] of [
        ["/agents", "Couldn’t load agents"],
        ["/settings", "Couldn’t load settings"],
      ] as const) {
        await page.goto(`${server!.url}${route}`, { waitUntil: "load", timeout: 20_000 });
        await page.waitForFunction(() => document.querySelector(".page-load-error") !== null, {
          timeout: 10_000,
        });
        await page.waitForFunction(() => !document.querySelector(".page-skeleton"), {
          timeout: 5_000,
        });
        const text = await page.evaluate(
          () => document.querySelector(".page-load-error")?.textContent ?? "",
        );
        expect(text).toContain(heading);
        expect(text).toContain("Check your connection to the RepoOS server");
        const alert = await page.evaluate(
          () => document.querySelector(".page-load-error")?.getAttribute("role") ?? "",
        );
        expect(alert).toBe("alert");
      }
      await expectNoHorizontalOverflow(page, 375);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("HTTP 500: pages show the server's error message, never a blank page", async () => {
    const page = await openPage();
    try {
      await failAllWith500(page);
      await page.goto(`${server!.url}/work`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="work-load-error"]') !== null,
        { timeout: 10_000 },
      );
      const text = await page.evaluate(
        () => document.querySelector('[data-testid="work-load-error"]')?.textContent ?? "",
      );
      // The server's own error body is what the user reads — not "Failed to fetch".
      expect(text).toContain("The server hit an unexpected error");

      await page.goto(`${server!.url}/agents`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector(".page-load-error") !== null, {
        timeout: 10_000,
      });
      await page.goto(`${server!.url}/settings`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector(".page-load-error") !== null, {
        timeout: 10_000,
      });
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("HTTP 500 on task data: the drawer still opens with content", async () => {
    const page = await openPage();
    try {
      // Everything the app boot needs answers normally; only per-task
      // endpoints (handoff status, checks, logs, task records) fail.
      const PASS = ["/api/auth/me", "/api/health", "/api/config", "/api/board", "/api/events"];
      await failAllApi(page, async (route) => {
        const url = new URL(route.request().url());
        if (PASS.some((p) => url.pathname.startsWith(p))) {
          await route.fulfill({ response: await route.fetch() });
          return;
        }
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Task data unavailable right now" }),
        });
      });
      await page.goto(`${server!.url}/work?task=9001&tab=changes`, {
        waitUntil: "load",
        timeout: 20_000,
      });
      await page.waitForFunction(() => document.querySelector(".drawer") !== null, {
        timeout: 15_000,
      });
      const drawer = await page.evaluate(() => {
        const el = document.querySelector(".drawer");
        return {
          text: el?.textContent ?? "",
          tabs: document.querySelectorAll(".drawer-tabs button").length,
        };
      });
      expect(drawer.text).toContain("Smoke review fixture");
      expect(drawer.tabs).toBeGreaterThan(0);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("stalled auth check: the app still boots instead of hanging on the skeleton", async () => {
    const page = await openPage();
    try {
      // Only /api/auth/me stalls. It is plain fetch with no api() timeout, and
      // both the router guard and App's onMounted await it — without the #1226
      // bound this leaves every page an endless skeleton.
      await page.route("**/api/auth/me", () => new Promise<void>(() => {}));
      await page.goto(`${server!.url}/work`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(
        () => (document.body.textContent ?? "").includes("Smoke review fixture"),
        { timeout: 20_000 },
      );
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("stalled server responses: plain-English 'did not respond in time' and a 'not responding' banner", async () => {
    const page = await openPage();
    try {
      // Everything answers instantly except health, the board index and the
      // SSE stream, which stall past their client-side budgets (10 s probe /
      // 15 s GET). The stream is stalled too, so no "the server is back"
      // signal can clear the recovery banner mid-test.
      await page.route("**/api/board", () => new Promise<void>(() => {}));
      await page.route("**/api/health", () => new Promise<void>(() => {}));
      await page.route("**/api/events", () => new Promise<void>(() => {}));
      await page.goto(`${server!.url}/work`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="work-load-error"]') !== null,
        { timeout: 25_000 },
      );
      const text = await page.evaluate(
        () => document.querySelector('[data-testid="work-load-error"]')?.textContent ?? "",
      );
      expect(text).toContain("did not respond in time");
      // The banner's probe (10 s) and the board's own timeout (15 s) land
      // within a second of each other; wait for the banner rather than
      // reading it once — on a slow machine the panel can win the race.
      await page.waitForFunction(
        () =>
          document
            .querySelector(".ui-recovery-banner strong")
            ?.textContent?.includes("is not responding") === true,
        { timeout: 20_000 },
      );
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("recovers in place once the server is reachable again", async () => {
    const page = await openPage();
    try {
      await goOffline(page);
      await page.goto(`${server!.url}/agents`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector(".page-load-error") !== null, {
        timeout: 10_000,
      });

      // The server comes back: lift the interception.
      await page.unroute("**/api/**");

      // The app notices on its own (focus re-probes /api/health) and clears
      // the recovery banner.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(() => !document.querySelector(".ui-recovery-banner"), {
        timeout: 10_000,
      });

      // The page's own Retry button reloads its data — no full reload needed.
      await page.click(".page-load-error button");
      await page.waitForFunction(() => document.querySelector(".agent-tabs") !== null, {
        timeout: 10_000,
      });
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("recovers the board and clears the banner on its own when the server returns", async () => {
    const page = await openPage();
    try {
      await goOffline(page);
      await page.goto(`${server!.url}/work`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="work-load-error"]') !== null,
        { timeout: 10_000 },
      );

      // The server comes back. With no user action at all, the SSE stream
      // reconnects, the index refreshes, the board fills in, and the offline
      // recovery banner clears itself.
      await page.unroute("**/api/**");
      await page.waitForFunction(
        () => (document.body.textContent ?? "").includes("Smoke review fixture"),
        { timeout: 20_000 },
      );
      await page.waitForFunction(() => !document.querySelector(".ui-recovery-banner"), {
        timeout: 10_000,
      });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="work-load-error"]') === null,
        { timeout: 10_000 },
      );
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
