/**
 * Sign-in, OTP entry, user menu and users list QA pass (#1239).
 *
 * Headless WebKit against the built app, served in-process with auth disabled
 * (the harness default), while Playwright intercepts every `/api/auth/**`
 * request and answers it from fixtures. No account, mailbox, credential or
 * visible browser is involved; the email addresses below are placeholders.
 *
 * Covered at 375 / 768 / 1280 px:
 *   - sign-in: wrong code, expired code (the server gives both the same copy),
 *     locked-out verify attempts, an unreadable proxy error body, offline at
 *     the status probe and offline while sending the code
 *   - OTP keyboard path: Enter with a partial code must not submit
 *   - users list: no native <select>/confirm(), the shared dialog guards
 *     removal, offline shows a real error instead of "No users added yet.",
 *     and action buttons are touch-sized on a phone
 *   - user menu: keyboard open, Escape closes and returns focus, log out
 *
 * Skips cleanly when Playwright/WebKit is not installed.
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
  type SmokeRoute,
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
const QA_ADMIN = "qa-admin@example.com";

const STATUS_OK = {
  enabled: true,
  bootstrapNeeded: false,
  hasGoogle: false,
  hasEmailProvider: true,
  repoName: "QA fixture",
};
const ME_SIGNED_OUT = { authEnabled: true, authenticated: false };
const ME_ADMIN = { authEnabled: true, authenticated: true, email: QA_ADMIN, role: "admin" };
const USERS = {
  users: [
    { email: QA_ADMIN, role: "admin", displayName: null, authSource: "allowlist" },
    { email: QA_MEMBER, role: "member", displayName: null, authSource: "allowlist" },
  ],
};

/** An answer for one request: a JSON body, a raw body, or a dropped connection. */
type Reply = "abort" | { status: number; body?: unknown; raw?: string; contentType?: string };
/** Keyed by `METHOD /api/path` (the path keeps its percent-encoding). */
type Replies = Record<string, Reply>;

const SIGNED_OUT: Replies = {
  "GET /api/auth/status": { status: 200, body: STATUS_OK },
  "GET /api/auth/me": { status: 200, body: ME_SIGNED_OUT },
  "POST /api/auth/request-otp": { status: 200, body: { ok: true } },
};
const SIGNED_IN: Replies = {
  "GET /api/auth/status": { status: 200, body: STATUS_OK },
  "GET /api/auth/me": { status: 200, body: ME_ADMIN },
  "GET /api/auth/users": { status: 200, body: USERS },
  "DELETE /api/auth/users/qa-member%40example.com": { status: 200, body: { ok: true } },
  "POST /api/auth/logout": { status: 200, body: { ok: true } },
};

/**
 * Every `/api/**` request listed in `replies` is answered from it. Anything
 * else passes through to the real fixture server (auth disabled), so the app
 * gets real config and health data instead of the 404s that make a page
 * render its "Couldn't load" state.
 */
async function routeApi(page: SmokePage, replies: Replies, calls: string[]): Promise<void> {
  await page.route("**/api/**", async (route: SmokeRoute) => {
    const request = route.request() as unknown as { url(): string; method(): string };
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    calls.push(key);
    const reply: Reply | undefined = replies[key];
    if (reply === undefined) {
      await route.fulfill({ response: await route.fetch() });
      return;
    }
    if (reply === "abort") {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: reply.status,
      contentType: reply.contentType ?? "application/json",
      body: reply.raw ?? JSON.stringify(reply.body ?? {}),
    });
  });
}

/** A fresh page at `width` that records uncaught page errors. */
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

async function textOf(page: SmokePage, selector: string): Promise<string> {
  await waitUntil(`${selector} to have text`, async () => {
    return (
      (await page.evaluate(
        (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? "",
        selector,
      )) !== ""
    );
  });
  return page.evaluate(
    (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? "",
    selector,
  );
}

async function expectNoHorizontalOverflow(page: SmokePage, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
}

async function heightOf(page: SmokePage, selector: string): Promise<number> {
  return page.evaluate(
    (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height ?? 0,
    selector,
  );
}

/** Email step → Enter submits the address → wait for the code field. */
async function requestCode(page: SmokePage): Promise<void> {
  await waitUntil("the email field", () => exists(page, 'input[aria-label="Email address"]'));
  await page.click('input[aria-label="Email address"]');
  await page.keyboard.type(QA_MEMBER);
  await page.keyboard.press("Enter");
  await waitUntil("the code field", () => exists(page, 'input[aria-label="One-time code"]'));
}

async function typeCode(page: SmokePage, code: string): Promise<void> {
  await page.click('input[aria-label="One-time code"]');
  await page.keyboard.type(code);
}

describeBrowser("sign-in, users and user menu QA (#1239)", () => {
  it("has a usable headless browser and server", () => {
    expect(bootErrors).toEqual([]);
    expect(unavailable).toBe(false);
  });

  describe.each(VIEWPORTS)("sign-in at %dpx", (width) => {
    it("says an invalid or expired code is invalid, keeps the page usable and clears the field", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(
        page,
        {
          ...SIGNED_OUT,
          "POST /api/auth/verify-otp": {
            status: 401,
            body: { error: "Invalid or expired code" },
          },
        },
        calls,
      );
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      await requestCode(page);
      await typeCode(page, "123456");
      await page.click(".login-btn.primary");
      expect(await textOf(page, ".login-error")).toBe("Invalid or expired code");
      expect(
        await page.evaluate(() => document.querySelector(".login-error")?.getAttribute("role")),
      ).toBe("alert");
      expect(
        await page.evaluate(
          () =>
            (document.querySelector('input[aria-label="One-time code"]') as HTMLInputElement).value,
        ),
      ).toBe("");
      await expectNoHorizontalOverflow(page, width);
      expect(pageErrors).toEqual([]);
      await page.close();
    });

    it("tells a locked-out visitor to wait, in plain English", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(
        page,
        {
          ...SIGNED_OUT,
          "POST /api/auth/verify-otp": {
            status: 429,
            body: { error: "Too many failed attempts. Please wait before trying again." },
          },
        },
        calls,
      );
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      await requestCode(page);
      await typeCode(page, "654321");
      await page.click(".login-btn.primary");
      expect(await textOf(page, ".login-error")).toContain("Too many failed attempts");
      await expectNoHorizontalOverflow(page, width);
      expect(pageErrors).toEqual([]);
      await page.close();
    });

    it("does not blame the network for an unreadable error body from a proxy", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(
        page,
        {
          ...SIGNED_OUT,
          "POST /api/auth/verify-otp": {
            status: 502,
            contentType: "text/html",
            raw: "<html><body>Bad gateway</body></html>",
          },
        },
        calls,
      );
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      await requestCode(page);
      await typeCode(page, "111111");
      await page.click(".login-btn.primary");
      const message = await textOf(page, ".login-error");
      expect(message).not.toContain("Network error");
      expect(message).toMatch(/server/i);
      await page.close();
    });

    it("Enter with a partial code sends nothing and keeps what was typed", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, SIGNED_OUT, calls);
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      await requestCode(page);
      await typeCode(page, "12");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      expect(calls.filter((c) => c === "POST /api/auth/verify-otp")).toEqual([]);
      expect(
        await page.evaluate(
          () =>
            (document.querySelector('input[aria-label="One-time code"]') as HTMLInputElement).value,
        ),
      ).toBe("12");
      await page.close();
    });

    it("offline at the status probe shows a plain-English message with a retry", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, { ...SIGNED_OUT, "GET /api/auth/status": "abort" }, calls);
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      expect(await textOf(page, '[data-testid="login-status-error"]')).toMatch(/server/i);
      expect(await exists(page, '[data-testid="login-retry"]')).toBe(true);
      await expectNoHorizontalOverflow(page, width);
      await page.close();
    });

    it("offline while sending the code shows a network message", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, { ...SIGNED_OUT, "POST /api/auth/request-otp": "abort" }, calls);
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      await waitUntil("the email field", () => exists(page, 'input[aria-label="Email address"]'));
      await page.click('input[aria-label="Email address"]');
      await page.keyboard.type(QA_MEMBER);
      await page.keyboard.press("Enter");
      expect(await textOf(page, ".login-error")).toBe("Network error — try again");
      await page.close();
    });

    it("keeps the sign-in controls touch-sized on a phone", async () => {
      if (width !== 375) return;
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, SIGNED_OUT, calls);
      await page.goto(`${server!.url}/login`, { waitUntil: "load", timeout: 15_000 });
      await waitUntil("the send button", () => exists(page, ".login-btn.primary"));
      expect(await heightOf(page, ".login-btn.primary")).toBeGreaterThanOrEqual(44);
      await page.close();
    });
  });

  describe.each(VIEWPORTS)("users list at %dpx", (width) => {
    it("uses the styled role dropdown and the shared dialog, never a native select or confirm()", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, SIGNED_IN, calls);
      await page.goto(`${server!.url}/settings?tab=security`, {
        waitUntil: "load",
        timeout: 15_000,
      });
      await waitUntil("the user rows", () => exists(page, ".auth-user-row"));
      expect(
        await page.evaluate(
          () => document.querySelectorAll('.auth-add-row select:not([aria-hidden="true"])').length,
        ),
      ).toBe(0);
      await page.evaluate(() => {
        const spy = window as unknown as { __nativeConfirm: number };
        spy.__nativeConfirm = 0;
        window.confirm = () => {
          spy.__nativeConfirm += 1;
          return false;
        };
      });
      await page.click(".auth-user-row:nth-child(2) .auth-action.danger");
      await waitUntil("the removal dialog", () => exists(page, '[role="dialog"]'));
      expect(await textOf(page, '[role="dialog"]')).toContain(`Remove ${QA_MEMBER}?`);
      await page.evaluate(() => {
        const confirm = [...document.querySelectorAll('[role="dialog"] button')].find(
          (b) => b.textContent?.trim() === "Remove user",
        );
        (confirm as HTMLButtonElement | undefined)?.click();
      });
      await waitUntil("the delete request", async () =>
        calls.includes("DELETE /api/auth/users/qa-member%40example.com"),
      );
      expect(
        await page.evaluate(
          () => (window as unknown as { __nativeConfirm: number }).__nativeConfirm,
        ),
      ).toBe(0);
      await expectNoHorizontalOverflow(page, width);
      expect(pageErrors).toEqual([]);
      await page.close();
    });

    it("shows a plain-English error, not an empty list, when users cannot load", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, { ...SIGNED_IN, "GET /api/auth/users": "abort" }, calls);
      await page.goto(`${server!.url}/settings?tab=security`, {
        waitUntil: "load",
        timeout: 15_000,
      });
      await waitUntil(
        "the users load to finish",
        async () => !(await exists(page, ".auth-loading")),
      );
      expect(await exists(page, ".auth-empty")).toBe(false);
      expect(await textOf(page, ".auth-error")).toMatch(/couldn.t load users/i);
      await page.close();
    }, 30_000);

    it("gives the row actions touch-sized targets on a phone", async () => {
      if (width !== 375) return;
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, SIGNED_IN, calls);
      await page.goto(`${server!.url}/settings?tab=security`, {
        waitUntil: "load",
        timeout: 15_000,
      });
      await waitUntil("the user rows", () => exists(page, ".auth-user-row"));
      expect(
        await heightOf(page, ".auth-user-row:nth-child(2) .auth-action.danger"),
      ).toBeGreaterThanOrEqual(44);
      await page.close();
    });
  });

  describe.each(VIEWPORTS)("user menu at %dpx", (width) => {
    it("opens from the keyboard, closes on Escape and returns focus, and logs out", async () => {
      const pageErrors: string[] = [];
      const calls: string[] = [];
      const page = await openPage(width, pageErrors);
      await routeApi(page, SIGNED_IN, calls);
      await page.goto(`${server!.url}/settings`, { waitUntil: "load", timeout: 15_000 });
      await waitUntil("the user menu trigger", () => exists(page, ".user-menu-trigger"));
      await page.focus(".user-menu-trigger");
      await page.keyboard.press("Enter");
      await waitUntil("the user menu", () => exists(page, ".user-menu-popover"));
      expect(
        await page.evaluate(() =>
          document.querySelector(".user-menu-popover")?.getAttribute("role"),
        ),
      ).toBe("menu");
      await page.keyboard.press("Escape");
      await waitUntil("the menu to close", async () => !(await exists(page, ".user-menu-popover")));
      expect(
        await page.evaluate(() => document.activeElement?.className ?? "(none)"),
        "focus after Escape",
      ).toContain("user-menu-trigger");
      await page.click(".user-menu-trigger");
      await waitUntil("the user menu again", () => exists(page, ".user-menu-logout"));
      await page.click(".user-menu-logout");
      await waitUntil("the logout request", async () => calls.includes("POST /api/auth/logout"));
      await expectNoHorizontalOverflow(page, width);
      await page.close();
    });
  });
});
