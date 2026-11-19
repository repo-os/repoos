/**
 * Notification and Telegram settings QA pass (#1249).
 *
 * Headless WebKit against the built app, served in-process with auth disabled
 * (the harness default). Playwright answers every `/api/telegram/**`,
 * `/api/auth/telegram/**` and `/api/ntfy/**` request from fixtures, and turns
 * on the Telegram and ntfy switches in the real `/api/config` answer. No bot
 * token, Telegram account or ntfy topic is real: the values below are
 * placeholders, and any request that leaves the fixture server is aborted.
 *
 * Covered at 375 / 768 / 1280 px on Settings → Notifications:
 *   - disconnected Telegram: connect cards, the BYO token is accepted and
 *     never echoed back into the page
 *   - connected Telegram: the receive mode reads in plain English, the test
 *     message control fits, and unbind asks through the shared dialog
 *   - a failed bound-chat load is an error, never "no chats connected"
 *   - a failed ntfy test says what to check, next to the topic field
 *   - no native confirm() is opened; no page exceptions; no horizontal overflow
 *
 * Skips cleanly when Playwright/WebKit is not installed.
 */
import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
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

/** Placeholder shaped like a bot token; it must never reach the rendered page. */
const FAKE_TOKEN = "000000000:QA-FIXTURE-NOT-A-REAL-TOKEN";
const QA_MEMBER = "qa-member@example.com";
const QA_ADMIN = "qa-admin@example.com";

const ME_ADMIN = { authEnabled: true, authenticated: true, email: QA_ADMIN, role: "admin" };
const TELEGRAM_LINK = {
  telegramUserId: 42,
  email: QA_MEMBER,
  telegramUsername: "qa_member",
  boundAt: "2026-11-01T00:00:00Z",
  boundBy: QA_ADMIN,
  lastSeenAt: null,
  role: "member",
  allowlisted: true,
};
const CONNECTED_STATUS = {
  enabled: true,
  connected: true,
  bot: {
    id: 1,
    username: "qa_fixture_bot",
    displayName: "QA fixture bot",
    canReadAllGroupMessages: false,
    source: "byo-token",
  },
  transport: { mode: "polling" },
  managedProvisioning: { configured: false },
  lastError: null,
  updatedAt: null,
};
const DISCONNECTED_STATUS = {
  enabled: true,
  connected: false,
  transport: { mode: "off" },
  managedProvisioning: { configured: false },
  lastError: null,
  updatedAt: null,
};
const CHAT_ROW = {
  telegramChatId: -1001,
  chatType: "supergroup",
  title: "QA fixture group",
  notificationsEnabled: true,
};

/** An answer for one request: a JSON body, a raw body, or a dropped connection. */
type Reply = "abort" | { status: number; body?: unknown; raw?: string; contentType?: string };
/** Keyed by `METHOD /api/path` (the path keeps its percent-encoding). */
type Replies = Record<string, Reply>;

const OK = (body: unknown): Reply => ({ status: 200, body });
const FAIL = (error: string): Reply => ({ status: 500, body: { error } });

/** Everything the notifications tab fetches, answered from fixtures. */
function baseReplies(overrides: Replies): Replies {
  return {
    "GET /api/auth/me": OK(ME_ADMIN),
    "GET /api/telegram/status": OK(CONNECTED_STATUS),
    "GET /api/auth/telegram/links": OK({ links: [TELEGRAM_LINK] }),
    "GET /api/auth/telegram/chats": OK({ chats: [CHAT_ROW] }),
    "POST /api/ntfy/test": OK({ ok: true }),
    "PATCH /api/auth/telegram/chats/-1001": OK({ ok: true, chat: CHAT_ROW }),
    "DELETE /api/auth/telegram/links/42": OK({ ok: true }),
    "POST /api/telegram/disconnect": OK({ ok: true }),
    "POST /api/telegram/connect": OK({ ok: true, warnings: [] }),
    ...overrides,
  };
}

/**
 * Answers `/api/**` from `replies`; anything else passes through to the
 * fixture server. `GET /api/config` is fetched for real and only the Telegram
 * and ntfy switches are turned on, so the tab renders its live sections.
 * Every call is recorded; any request that would leave for Telegram is aborted.
 */
async function routeApi(page: SmokePage, replies: Replies, calls: string[]): Promise<void> {
  await page.route("**/api.telegram.org/**", async (route: SmokeRoute) => {
    calls.push("EXTERNAL api.telegram.org");
    await route.abort();
  });
  await page.route("**/api/**", async (route: SmokeRoute) => {
    const request = route.request() as unknown as { url(): string; method(): string };
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    calls.push(key);
    if (key === "GET /api/config") {
      const real = await route.fetch();
      const data = (await real.json()) as { config: Record<string, unknown> };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...data,
          config: {
            ...data.config,
            "telegram.enabled": true,
            telegram: { ...(data.config.telegram as object | undefined), enabled: true },
            ntfyEnabled: true,
            ntfyTopic: "repoos_qa_fixture",
          },
        }),
      });
      return;
    }
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

async function bodyText(page: SmokePage): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function expectNoHorizontalOverflow(page: SmokePage, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
}

/** Counts any native confirm()/alert() the page would open; it answers "no". */
async function spyOnNativeDialogs(page: SmokePage): Promise<void> {
  await page.evaluate(() => {
    const spy = window as unknown as { __nativeDialogs: number };
    spy.__nativeDialogs = 0;
    window.confirm = () => {
      spy.__nativeDialogs += 1;
      return false;
    };
    window.alert = () => {
      spy.__nativeDialogs += 1;
    };
  });
}

async function nativeDialogCount(page: SmokePage): Promise<number> {
  return page.evaluate(() => (window as unknown as { __nativeDialogs: number }).__nativeDialogs);
}

/** Clicks the visible button with this exact label, inside a dialog or the page. */
async function clickButton(page: SmokePage, label: string, scope = "body"): Promise<void> {
  await page.evaluate(
    ({ text, root }: { text: string; root: string }) => {
      const scopeEl = document.querySelector(root) ?? document.body;
      const button = [...scopeEl.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === text,
      );
      (button as HTMLButtonElement | undefined)?.click();
    },
    { text: label, root: scope },
  );
}

/** Opens Settings on the Notifications tab and waits for the Telegram section. */
async function openNotifications(page: SmokePage): Promise<void> {
  await page.goto(`${server!.url}/settings?tab=notifications`, {
    waitUntil: "load",
    timeout: 15_000,
  });
  await waitUntil("the Telegram section", () => exists(page, "#setting-telegram\\.enabled"));
}

describeBrowser("notification and Telegram settings QA (#1249)", () => {
  it("has a usable headless browser and server", () => {
    expect(bootErrors).toEqual([]);
    expect(server).not.toBeNull();
    expect(browser).not.toBeNull();
  });

  for (const width of VIEWPORTS) {
    describe(`at ${width}px`, () => {
      it("connects a bot: the token is accepted and never echoed into the page", async () => {
        const pageErrors: string[] = [];
        const calls: string[] = [];
        const page = await openPage(width, pageErrors);
        await routeApi(
          page,
          baseReplies({ "GET /api/telegram/status": OK(DISCONNECTED_STATUS) }),
          calls,
        );
        await openNotifications(page);

        await waitUntil("the BYO token field", () => exists(page, "#tgp-byo-token"));
        await expectNoHorizontalOverflow(page, width);
        await page.click("#tgp-byo-token");
        await page.keyboard.type(FAKE_TOKEN);
        await clickButton(page, "Connect");
        await waitUntil("the connect request", async () =>
          calls.includes("POST /api/telegram/connect"),
        );
        await page.waitForTimeout(300);

        const text = await bodyText(page);
        expect(text).not.toContain(FAKE_TOKEN);
        expect(await page.evaluate(() => document.body.innerHTML)).not.toContain(FAKE_TOKEN);
        expect(calls).not.toContain("EXTERNAL api.telegram.org");
        expect(pageErrors).toEqual([]);
        await page.close();
      });

      it("reads the connected state in plain English and asks before unbinding", async () => {
        const pageErrors: string[] = [];
        const calls: string[] = [];
        const page = await openPage(width, pageErrors);
        await routeApi(page, baseReplies({}), calls);
        await openNotifications(page);
        // Spy after navigation: a goto would reset the window the spy patches.
        await spyOnNativeDialogs(page);

        await waitUntil("the connected status", async () =>
          (await bodyText(page)).includes("Connected to QA fixture bot"),
        );
        const text = await bodyText(page);
        expect(text).toContain("checking Telegram for messages");
        expect(text).not.toContain("transport");
        await expectNoHorizontalOverflow(page, width);

        await clickButton(page, "Unbind");
        await waitUntil("the unbind dialog", () => exists(page, '[role="dialog"]'));
        expect(await bodyText(page)).toContain("Unbind @qa_member (qa-member@example.com)?");
        expect(calls).not.toContain("DELETE /api/auth/telegram/links/42");

        await clickButton(page, "Unbind", '[role="dialog"]');
        await waitUntil("the unbind request", async () =>
          calls.includes("DELETE /api/auth/telegram/links/42"),
        );
        expect(await nativeDialogCount(page)).toBe(0);
        expect(pageErrors).toEqual([]);
        await page.close();
      });

      it("says a failed chat-list load is an error, not an empty list", async () => {
        const pageErrors: string[] = [];
        const calls: string[] = [];
        const page = await openPage(width, pageErrors);
        await routeApi(
          page,
          baseReplies({ "GET /api/auth/telegram/chats": FAIL("Auth store unavailable") }),
          calls,
        );
        await openNotifications(page);

        await waitUntil("the chat load error", async () =>
          (await bodyText(page)).includes("Couldn't load your Telegram chats."),
        );
        const text = await bodyText(page);
        expect(text).not.toContain("No Telegram chats are connected yet");
        await expectNoHorizontalOverflow(page, width);
        expect(pageErrors).toEqual([]);
        await page.close();
      });

      it("tells the user what to check when the ntfy test fails", async () => {
        const pageErrors: string[] = [];
        const calls: string[] = [];
        const page = await openPage(width, pageErrors);
        await routeApi(
          page,
          baseReplies({ "POST /api/ntfy/test": FAIL("ntfy topic is empty") }),
          calls,
        );
        await openNotifications(page);

        await waitUntil("the ntfy test button", () =>
          page.evaluate(() =>
            [...document.querySelectorAll("button")].some((b) =>
              b.textContent?.includes("Send test"),
            ),
          ),
        );
        await clickButton(page, "Send test");
        await waitUntil("the ntfy failure message", async () =>
          (await bodyText(page)).includes("Couldn't send the test notification."),
        );
        expect(await bodyText(page)).toContain("Check that the topic matches");
        await expectNoHorizontalOverflow(page, width);
        expect(pageErrors).toEqual([]);
        await page.close();
      });
    });
  }
});
