/**
 * Login, lock-screen-free sign-in and session-expiry QA pass (#1273).
 *
 * Headless WebKit against the built app, served in-process with auth disabled
 * (the harness default). Playwright answers every `/api/auth/**` request from
 * fixtures, so no account, mailbox or credential is involved; the addresses
 * below are placeholders. Never a visible browser.
 *
 * Covered at 375 / 768 / 1280 px:
 *   - every login state (email, code, status error, bootstrap, Google) fits the
 *     viewport with no horizontal overflow
 *   - the resend and "use a different email" links are at least 44px tall
 *   - keyboard focus on an input draws a visible ring
 *   - going back to the email step clears the previous wrong-code message
 *   - `?expired=1` tells a visitor their session ended and why they are here
 *
 * Skips cleanly when Playwright/WebKit is not installed.
 */
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeSmokeFixture } from "../../commands/ui-smoke.js";
import {
  isPlaywrightUnavailable,
  launchWebkit,
  startPreviewServer,
  teardownUiHarness,
  type PreviewServer,
  type SmokeBrowser,
  type SmokePage,
  type SmokeRoute,
} from "../../commands/ui-harness.js";

// Full-suite runs share the machine with other browser suites, so a page load can
// take well over the default 30s test budget; the 30s navigation timeouts in this file allow for it.
vi.setConfig({ testTimeout: 90_000 });

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
type Width = (typeof VIEWPORTS)[number];

const QA_MEMBER = "qa-member@example.com";
const SIGNED_OUT_ME = { authEnabled: true, authenticated: false };
const STATUS = {
  enabled: true,
  bootstrapNeeded: false,
  hasGoogle: false,
  hasEmailProvider: true,
  repoName: "QA fixture",
};

/** Answers the auth endpoints; `status` may be "abort" to model an offline server. */
async function routeAuth(
  page: SmokePage,
  opts: {
    status?: unknown | "abort";
    verifyOtp?: { status: number; body: unknown };
    calls?: string[];
  } = {},
): Promise<void> {
  await page.route("**/api/auth/**", async (route: SmokeRoute) => {
    const request = route.request() as unknown as { url(): string; method(): string };
    const key = `${request.method()} ${new URL(request.url()).pathname}`;
    opts.calls?.push(key);
    if (key === "GET /api/auth/status") {
      if (opts.status === "abort") return route.abort();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts.status ?? STATUS),
      });
    }
    if (key === "GET /api/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SIGNED_OUT_ME),
      });
    }
    if (key === "POST /api/auth/request-otp") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    if (key === "POST /api/auth/verify-otp" && opts.verifyOtp) {
      return route.fulfill({
        status: opts.verifyOtp.status,
        contentType: "application/json",
        body: JSON.stringify(opts.verifyOtp.body),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function openPage(width: Width, pageErrors: string[]): Promise<SmokePage> {
  const page = await browser!.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (err: Error) => {
    pageErrors.push(err.message);
  });
  return page;
}

async function waitUntil(what: string, probe: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (await probe()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function exists(page: SmokePage, selector: string): Promise<boolean> {
  return page.evaluate((sel: string) => document.querySelector(sel) !== null, selector);
}

async function expectNoHorizontalOverflow(page: SmokePage, width: number): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
}

async function typeCode(page: SmokePage, code: string): Promise<void> {
  await page.click('input[aria-label="One-time code"]');
  await page.keyboard.type(code);
}

/** The email step: type the address and press Enter to request the code. */
async function requestCode(page: SmokePage): Promise<void> {
  await waitUntil("the email field", () => exists(page, 'input[aria-label="Email address"]'));
  await page.click('input[aria-label="Email address"]');
  await page.keyboard.type(QA_MEMBER);
  await page.keyboard.press("Enter");
  await waitUntil("the code field", () => exists(page, 'input[aria-label="One-time code"]'));
}

describeBrowser("login and session-expiry flows QA (#1273)", () => {
  it("has a usable headless browser and server", () => {
    expect(bootErrors).toEqual([]);
    expect(unavailable).toBe(false);
  });

  describe.each(VIEWPORTS)("at %dpx", (width) => {
    it("fits every login state on screen", async () => {
      const pageErrors: string[] = [];
      const states: Array<{ name: string; setup: (page: SmokePage) => Promise<void> }> = [
        {
          name: "email",
          setup: async (page) => {
            await routeAuth(page);
            await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
            await waitUntil("the email field", () =>
              exists(page, 'input[aria-label="Email address"]'),
            );
          },
        },
        {
          name: "code with a wrong-code message",
          setup: async (page) => {
            await routeAuth(page, {
              verifyOtp: { status: 401, body: { error: "Invalid or expired code" } },
            });
            await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
            await requestCode(page);
            await typeCode(page, "123456");
            await page.click(".login-btn.primary");
            await waitUntil("the error", () => exists(page, ".login-error"));
          },
        },
        {
          name: "status error",
          setup: async (page) => {
            await routeAuth(page, { status: "abort" });
            await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
            await waitUntil("the status error", () =>
              exists(page, '[data-testid="login-status-error"]'),
            );
          },
        },
        {
          name: "bootstrap admin",
          setup: async (page) => {
            await routeAuth(page, { status: { ...STATUS, bootstrapNeeded: true } });
            await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
            await waitUntil("the admin field", () =>
              exists(page, 'input[aria-label="Administrator email"]'),
            );
          },
        },
        {
          name: "email with Google",
          setup: async (page) => {
            await routeAuth(page, { status: { ...STATUS, hasGoogle: true } });
            await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
            await waitUntil("the Google button", () => exists(page, ".login-btn.google"));
          },
        },
        {
          name: "session expired notice",
          setup: async (page) => {
            await routeAuth(page);
            await page.goto(`${server!.url}/login?expired=1`, {
              waitUntil: "load",
              timeout: 30_000,
            });
            await waitUntil("the expired notice", () =>
              exists(page, '[data-testid="login-session-expired"]'),
            );
          },
        },
      ];
      for (const state of states) {
        const page = await openPage(width, pageErrors);
        await state.setup(page);
        await expectNoHorizontalOverflow(page, width);
        expect(pageErrors, `${state.name} at ${width}px`).toEqual([]);
        await page.close();
      }
    });

    it("gives the resend and change-email links a touch-sized target", async () => {
      const pageErrors: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeAuth(page);
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
      await requestCode(page);
      const heights = await page.evaluate(() =>
        [...document.querySelectorAll(".login-link")].map(
          (el) => el.getBoundingClientRect().height,
        ),
      );
      expect(heights).toHaveLength(2);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
      await page.close();
    });

    it("draws a visible ring on a keyboard-focused input", async () => {
      const pageErrors: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeAuth(page);
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
      await waitUntil("the email field", () => exists(page, 'input[aria-label="Email address"]'));
      await page.click(".login-page");
      await page.keyboard.press("Tab");
      const ring = await page.evaluate(() => {
        const el = document.querySelector('input[aria-label="Email address"]');
        return {
          focused: document.activeElement === el,
          focusVisible: el?.matches(":focus-visible") ?? false,
          outline: el ? getComputedStyle(el).outlineStyle : "missing",
        };
      });
      expect(ring.focused).toBe(true);
      expect(ring.focusVisible).toBe(true);
      expect(ring.outline).not.toBe("none");
      await page.close();
    });

    it("clears the wrong-code message when the visitor goes back to the email step", async () => {
      const pageErrors: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeAuth(page, {
        verifyOtp: { status: 401, body: { error: "Invalid or expired code" } },
      });
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 30_000 });
      await requestCode(page);
      await typeCode(page, "123456");
      await page.click(".login-btn.primary");
      await waitUntil("the error", () => exists(page, ".login-error"));
      await page.click("text=Use a different email");
      await waitUntil("the email field again", () =>
        exists(page, 'input[aria-label="Email address"]'),
      );
      expect(await exists(page, ".login-error")).toBe(false);
      await page.close();
    });
  });
});
