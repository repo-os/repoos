/**
 * Telegram admin-route tests (#0531).
 *
 * Routes accept the BYO token once, server-side, and never carry credential
 * material — the token, the webhook secret, or the encrypted envelope — back
 * to the browser. Unauthenticated and non-admin callers are refused; managed
 * provisioning reports honest unavailability while BYO stays available.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { SESSION_COOKIE_NAME } from "../../core/auth.js";
import { TelegramApiClient } from "../../server/telegram/api.js";
import { TelegramCredentialStore, telegramConnectionPath } from "../../server/telegram/store.js";
import { LocalTelegramProvider } from "../../server/telegram/provider.js";
import {
  createManagedProvisioningClient,
  ManagedProvisioningUnavailableError,
} from "../../server/telegram/provisioning.js";
import type { ManagedProvisioningClient } from "../../server/telegram/types.js";
import {
  telegramConnect,
  telegramDisconnect,
  telegramProfile,
  telegramProvisionBegin,
  telegramProvisionRedeem,
  telegramProvisionStatus,
  telegramStatus,
  telegramTransport,
} from "../../server/routes/telegram";
import { resetTelegramProviders, setTelegramProvider } from "../../server/telegram/index.js";

const TOKEN = "1234567890:AAAdminRoutesFakeTokenValueXX";
const TOKEN2 = "1234567891:AASecondTokenValueTwoOrMoreCharsXX";
const API_URL = "https://api.telegram.org";
const ADMIN_EMAIL = "admin@repoos.org";
const MEMBER_EMAIL = "member@repoos.org";

let tmpRoot: string;
const providers: LocalTelegramProvider[] = [];

const botMe = (): Record<string, unknown> => ({
  id: 246810,
  is_bot: true,
  first_name: "RepoOS Bot",
  username: "repoos_bot",
  can_read_all_group_messages: false,
});

/** Handlers every disconnect test needs (#0539). */
function disconnectApiDefaults(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deleteWebhook: true,
    getWebhookInfo: () => ({ url: "" }),
    logOut: (_body: unknown, ctx: { callToken: string; revokedTokens: Set<string> }) => {
      ctx.revokedTokens.add(ctx.callToken);
      return true;
    },
    close: true,
    ...overrides,
  };
}

function fakeApi(handlers: Record<string, unknown> = {}) {
  const revokedTokens = new Set<string>();
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fetcher = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = url.split("/").pop() ?? "";
    const tokenMatch = url.match(/\/bot([^/]+)\//);
    const callToken = tokenMatch?.[1] ?? "";
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    calls.push({ method, body });

    if (method === "getMe" && revokedTokens.has(callToken)) {
      return new Response(
        JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const scripted = handlers[method];
    const result =
      scripted === undefined
        ? undefined
        : typeof scripted === "function"
          ? scripted(body, { callToken, revokedTokens })
          : scripted;

    if (method === "logOut" && result !== undefined && result !== false) {
      revokedTokens.add(callToken);
    }

    const text =
      result === undefined
        ? JSON.stringify({ ok: false, error_code: 404, description: `no fake for ${method}` })
        : JSON.stringify({ ok: true, result });
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function makeReq(body?: unknown, cookie?: string): IncomingMessage {
  const req = {
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    url: "/api/telegram",
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body ?? {}), "utf8");
    },
  };
  return req as unknown as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: unknown;
  raw: string;
}

function makeRes(): { res: ServerResponse; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined, raw: "" };
  const res = {
    setHeader() {},
    writeHead(code: number) {
      fake.status = code;
    },
    end(payload: string) {
      fake.raw = String(payload);
      try {
        fake.payload = JSON.parse(String(payload));
      } catch {
        fake.payload = payload;
      }
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function ctx(config: RepoOSConfig): RouteContext {
  return { config } as unknown as RouteContext;
}

interface Harness {
  config: RepoOSConfig;
  provider: LocalTelegramProvider;
  calls: { method: string; body: Record<string, unknown> }[];
  /** Present when a real auth session was installed ("admin"/"member"). */
  cookie: string | null;
}

/**
 * Per-test route context:
 *  - `auth: "admin"|"member"` installs a real auth session (with auth.enabled)
 *    and returns the cookie the admin gate reads.
 *  - `auth: undefined` models the auth-disabled trusted-operator instance,
 *    where the middleware lets everything through and per-route gates treat
 *    the caller as the operator.
 *  - A provider with scripted API handlers is registered under `root`, so the
 *    routes' singleton `getTelegramProvider` and this test share one instance.
 */
function harness(options: {
  auth?: "admin" | "member";
  apiHandlers?: Record<string, unknown>;
  provisioningService?: ManagedProvisioningClient;
}): Harness {
  const api = fakeApi(disconnectApiDefaults(options.apiHandlers ?? {}));
  const config = {
    root: tmpRoot,
    telegram: { enabled: true, provisioningUrl: "" },
    ...(options.auth ? { auth: { enabled: true } } : {}),
  } as unknown as RepoOSConfig;
  const provider = new LocalTelegramProvider({
    resolveConfig: () => ({
      enabled: true,
      provisioningUrl: process.env.REPOOS_TELEGRAM_PROVISIONING_URL ?? "",
      provisioningKey: process.env.REPOOS_TELEGRAM_PROVISIONING_KEY || undefined,
    }),
    root: tmpRoot,
    repositoryName: "repoos",
    store: new TelegramCredentialStore(tmpRoot),
    createApi: (token) => new TelegramApiClient(token, { fetcher: api.fetcher }),
    ...(options.provisioningService
      ? { createProvisioning: () => options.provisioningService as ManagedProvisioningClient }
      : {}),
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  setTelegramProvider(tmpRoot, provider);
  providers.push(provider);
  let cookie: string | null = null;
  if (options.auth) {
    cookie = sessionCookie(
      options.auth === "admin" ? ADMIN_EMAIL : MEMBER_EMAIL,
      options.auth === "admin" ? "admin" : "member",
    );
  }
  return { config, provider, calls: api.calls, cookie };
}

/**
 * A harness variant whose live config says the integration is disabled —
 * shared by the enabled-gate tests and the off-while-disabled exemption.
 */
function disabledHarness(options: { apiHandlers?: Record<string, unknown> } = {}): Harness {
  const api = fakeApi(disconnectApiDefaults(options.apiHandlers ?? {}));
  const config = {
    root: tmpRoot,
    telegram: { enabled: false, provisioningUrl: "" },
  } as unknown as RepoOSConfig;
  const provider = new LocalTelegramProvider({
    // The provider's own view is disabled too: this is the honest default.
    resolveConfig: () => ({ enabled: false, provisioningUrl: "" }),
    root: tmpRoot,
    repositoryName: "repoos",
    store: new TelegramCredentialStore(tmpRoot),
    createApi: (token) => new TelegramApiClient(token, { fetcher: api.fetcher }),
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  setTelegramProvider(tmpRoot, provider);
  providers.push(provider);
  return { config, provider, calls: api.calls, cookie: null };
}

/** Install `email` with `role` and mint a session cookie. */
function sessionCookie(email: string, role: "admin" | "member"): string {
  resetAuthStoreInstance();
  const store = getAuthStore(tmpRoot);
  if (!store) throw new Error("auth store unavailable in test env");
  store.upsertUser(email, role, null);
  const token = store.createSession(email, role, 3600);
  if (!token) throw new Error("could not create auth session in test env");
  return `${SESSION_COOKIE_NAME}=${token}`;
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "repoos-telegram-routes-"));
  process.env.REPOOS_SECRET_STORE_KEY = Buffer.alloc(32, 7).toString("hex");
  delete process.env.REPOOS_TELEGRAM_PROVISIONING_KEY;
  delete process.env.REPOOS_TELEGRAM_PROVISIONING_URL;
});

afterEach(async () => {
  for (const provider of providers.splice(0)) {
    await provider.stopPolling();
  }
  resetTelegramProviders();
  resetAuthStoreInstance();
  delete process.env.REPOOS_SECRET_STORE_KEY;
  delete process.env.REPOOS_TELEGRAM_PROVISIONING_KEY;
  delete process.env.REPOOS_TELEGRAM_PROVISIONING_URL;
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// Admin gating
// ---------------------------------------------------------------------------

describe("admin gating", () => {
  it("401s an unauthed caller when auth is enabled", async () => {
    const h = harness({ auth: "admin" });
    const { res, fake } = makeRes();
    await telegramStatus(ctx(h.config), makeReq(), res, {});
    expect(fake.status).toBe(401);
    expect((fake.payload as { error: string }).error).toMatch(/Authentication required/);
  });

  it("403s a member session", async () => {
    const h = harness({ auth: "member" });
    const cookie = sessionCookie(MEMBER_EMAIL, "member");
    const { res, fake } = makeRes();
    await telegramStatus(ctx(h.config), makeReq(undefined, cookie), res, {});
    expect(fake.status).toBe(403);
    expect((fake.payload as { error: string }).error).toMatch(/admin/i);
  });

  it("answers an admin session with secret-free status", async () => {
    const h = harness({ auth: "admin" });
    const cookie = sessionCookie(ADMIN_EMAIL, "admin");
    const { res, fake } = makeRes();
    await telegramStatus(ctx(h.config), makeReq(undefined, cookie), res, {});
    expect(fake.status).toBe(200);
    const payload = fake.payload as { enabled: boolean; connected: boolean; bot?: unknown };
    expect(payload.enabled).toBe(true);
    expect(payload.connected).toBe(false);
    expect(payload.bot).toBeUndefined();
    expect(String(fake.raw)).not.toContain(TOKEN);
  });

  it("answers without a session when auth is disabled (trusted operator)", async () => {
    const h = harness({});
    const { res, fake } = makeRes();
    await telegramStatus(ctx(h.config), makeReq(), res, {});
    expect(fake.status).toBe(200);
    expect((fake.payload as { enabled: boolean }).enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BYO connect / disconnect
// ---------------------------------------------------------------------------

describe("BYO connect", () => {
  it("stores the credential encrypted; no response ever carries the token", async () => {
    const h = harness({ auth: "admin", apiHandlers: { getMe: botMe() } });
    const cookie = sessionCookie(ADMIN_EMAIL, "admin");
    const { res, fake } = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }, cookie), res, {});
    expect(fake.status).toBe(200);
    const body = String(fake.raw);
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain("ciphertext");
    const bot = (fake.payload as { bot: { username: string } }).bot;
    expect(bot.username).toBe("repoos_bot");
    const record = readFileSync(telegramConnectionPath(tmpRoot), "utf8");
    expect(record).not.toContain(TOKEN);
    expect(new TelegramCredentialStore(tmpRoot).readToken()).toBe(TOKEN);
  });

  it("400s an empty token without touching Telegram", async () => {
    const h = harness({ auth: "admin" });
    const cookie = sessionCookie(ADMIN_EMAIL, "admin");
    const { res, fake } = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: "   " }, cookie), res, {});
    expect(fake.status).toBe(400);
    expect(h.calls).toHaveLength(0);
  });

  it("maps a Telegram 401 through an honest, redacted body", async () => {
    const h = harness({
      auth: "admin",
      apiHandlers: {
        getMe: () => {
          throw new Error(`Not Found (${API_URL}/bot${TOKEN}/getMe)`);
        },
      },
    });
    const cookie = sessionCookie(ADMIN_EMAIL, "admin");
    const { res, fake } = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }, cookie), res, {});
    expect(fake.status).toBe(502);
    const error = (fake.payload as { error: string }).error;
    expect(error).not.toContain(TOKEN);
    expect(String(fake.raw)).not.toContain(TOKEN);
  });

  it("status shows the connected bot; disconnect clears credential and disk", async () => {
    const h = harness({
      auth: "admin",
      apiHandlers: { getMe: botMe(), deleteWebhook: true },
    });
    const cookie = sessionCookie(ADMIN_EMAIL, "admin");
    const connect = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }, cookie), connect.res, {});
    expect(connect.fake.status).toBe(200);

    const status1 = makeRes();
    await telegramStatus(ctx(h.config), makeReq(undefined, cookie), status1.res, {});
    const s1 = status1.fake.payload as { connected: boolean; bot?: { username: string } };
    expect(s1.connected).toBe(true);
    expect(s1.bot?.username).toBe("repoos_bot");

    const disconnect = makeRes();
    await telegramDisconnect(ctx(h.config), makeReq(undefined, cookie), disconnect.res, {});
    expect(disconnect.fake.status).toBe(200);
    const status2 = makeRes();
    await telegramStatus(ctx(h.config), makeReq(undefined, cookie), status2.res, {});
    expect((status2.fake.payload as { connected: boolean }).connected).toBe(false);
    expect(JSON.stringify(status2.fake.payload)).not.toContain(TOKEN);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
  });

  it("connect and disconnect work without auth on auth-disabled instances", async () => {
    const h = harness({ apiHandlers: { getMe: botMe(), deleteWebhook: true } });
    const connect = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), connect.res, {});
    expect(connect.fake.status).toBe(200);
    const disconnect = makeRes();
    await telegramDisconnect(ctx(h.config), makeReq(), disconnect.res, {});
    expect(disconnect.fake.status).toBe(200);
  });
});

describe("resetTelegramProviders is non-destructive (review round 2)", () => {
  it("stops loops and drops singletons without deleting the stored credential", async () => {
    const h = harness({ apiHandlers: { getMe: botMe(), deleteWebhook: true } });
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), makeRes().res, {});
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    // The teardown helper must never become a data-deletion path.
    resetTelegramProviders();
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    expect(new TelegramCredentialStore(tmpRoot).readToken()).toBe(TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Profile & transport
// ---------------------------------------------------------------------------

describe("profile and transport routes", () => {
  const handlers = (): Record<string, unknown> => ({
    getMe: botMe(),
    setMyCommands: true,
    setMyName: true,
    setMyDescription: true,
    setMyShortDescription: true,
    setWebhook: true,
    deleteWebhook: true,
    getWebhookInfo: { url: "" },
    getUpdates: [],
  });

  it("applies profile changes; responses never include credentials", async () => {
    const h = harness({ apiHandlers: handlers() });
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), makeRes().res, {});
    const { res, fake } = makeRes();
    await telegramProfile(
      ctx(h.config),
      makeReq({ commands: [{ command: "/Help", description: "Help text" }] }),
      res,
      {},
    );
    expect(fake.status).toBe(200);
    const profile = (fake.payload as { profile: { commands: { command: string }[] } }).profile;
    expect(profile.commands[0].command).toBe("help");
    expect(String(fake.raw)).not.toContain(TOKEN);
  });

  it("validates mode and webhook rules; polling applies live", async () => {
    const h = harness({ apiHandlers: handlers() });
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), makeRes().res, {});
    const badMode = makeRes();
    await telegramTransport(ctx(h.config), makeReq({ mode: "carrier-pigeon" }), badMode.res, {});
    expect(badMode.fake.status).toBe(400);

    const badUrl = makeRes();
    await telegramTransport(
      ctx(h.config),
      makeReq({ mode: "webhook", webhookUrl: "https://host:9002/x" }),
      badUrl.res,
      {},
    );
    expect(badUrl.fake.status).toBe(400);
    expect(String(badUrl.fake.raw)).not.toContain(TOKEN);

    const good = makeRes();
    await telegramTransport(ctx(h.config), makeReq({ mode: "polling" }), good.res, {});
    expect(good.fake.status).toBe(200);
    expect((good.fake.payload as { transport: { mode: string } }).transport.mode).toBe("polling");
  });

  it("409s profile/transport calls when nothing is connected", async () => {
    const h = harness({});
    const profileRes = makeRes();
    await telegramProfile(ctx(h.config), makeReq({ description: "d" }), profileRes.res, {});
    expect(profileRes.fake.status).toBe(409);
    const transportRes = makeRes();
    await telegramTransport(ctx(h.config), makeReq({ mode: "polling" }), transportRes.res, {});
    expect(transportRes.fake.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// The [telegram] enabled master switch (review round 2)
// ---------------------------------------------------------------------------

describe("the enabled gate", () => {
  it("refuses connect/transport/profile/provisioning while disabled", async () => {
    const h = disabledHarness();
    const body = JSON.stringify({ token: TOKEN });

    const connect = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), connect.res, {});
    expect(connect.fake.status).toBe(400);
    expect((connect.fake.payload as { error: string }).error).toMatch(/integration is disabled/);
    expect(connect.fake.raw).not.toContain(TOKEN);

    const profile = makeRes();
    await telegramProfile(ctx(h.config), makeReq({ description: "d" }), profile.res, {});
    expect(profile.fake.status).toBe(400);

    const transport = makeRes();
    await telegramTransport(ctx(h.config), makeReq({ mode: "polling" }), transport.res, {});
    expect(transport.fake.status).toBe(400);

    const provision = makeRes();
    await telegramProvisionBegin(ctx(h.config), makeReq({}), provision.res, {});
    expect(provision.fake.status).toBe(400);
    expect(provision.fake.raw).not.toContain(body);

    // Nothing stored, nothing sent: the switch is a real gate.
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it("still answers status while disabled so Settings can render the switch", async () => {
    const h = disabledHarness();
    const { res, fake } = makeRes();
    await telegramStatus(ctx(h.config), makeReq(), res, {});
    expect(fake.status).toBe(200);
    const payload = fake.payload as { enabled: boolean; connected: boolean };
    expect(payload.enabled).toBe(false);
    expect(payload.connected).toBe(false);
  });

  it("disconnect stays available so a credential never outlives intent", async () => {
    const h = disabledHarness({ apiHandlers: { getMe: botMe(), deleteWebhook: true } });
    // Seed a stored connection directly at the provider level.
    await h.provider.connectByBotToken(TOKEN);
    const disconnect = makeRes();
    await telegramDisconnect(ctx(h.config), makeReq(), disconnect.res, {});
    expect(disconnect.fake.status).toBe(200);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reconnect preserves the operator's profile; off stays available (round 3)
// ---------------------------------------------------------------------------

describe("reconnect profile preservation", () => {
  it("connecting twice keeps an operator-configured command list", async () => {
    const h = harness({
      apiHandlers: {
        getMe: botMe(),
        setMyCommands: true,
        setMyName: true,
        setMyDescription: true,
        setMyShortDescription: true,
      },
    });
    // First connect: defaults apply once.
    const first = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), first.res, {});
    expect(first.fake.status).toBe(200);

    // The operator replaces the command list with their own.
    const custom = makeRes();
    await telegramProfile(
      ctx(h.config),
      makeReq({ commands: [{ command: "custom", description: "Operator's own" }] }),
      custom.res,
      {},
    );
    expect(custom.fake.status).toBe(200);

    // Same bot, token re-pasted: the round-2 bug re-applied defaults here.
    const second = makeRes();
    await telegramConnect(ctx(h.config), makeReq({ token: TOKEN }), second.res, {});
    expect(second.fake.status).toBe(200);
    expect((second.fake.payload as { warnings: string[] }).warnings).toEqual([]);

    const statusRes = makeRes();
    await telegramStatus(ctx(h.config), makeReq(), statusRes.res, {});
    const profile = (statusRes.fake.payload as { profile?: { commands: { command: string }[] } })
      .profile;
    expect(profile?.commands).toEqual([{ command: "custom", description: "Operator's own" }]);
  });
});

describe("transport off stays available while disabled (round 3)", () => {
  it("mode off is not refused by the enabled gate", async () => {
    const h = disabledHarness({ apiHandlers: { getMe: botMe(), deleteWebhook: true } });
    await h.provider.connectByBotToken(TOKEN);
    const off = makeRes();
    await telegramTransport(ctx(h.config), makeReq({ mode: "off" }), off.res, {});
    expect(off.fake.status).toBe(200);
    expect((off.fake.payload as { transport: { mode: string } }).transport.mode).toBe("off");
    // Arming a transport stays gated.
    const arm = makeRes();
    await telegramTransport(ctx(h.config), makeReq({ mode: "polling" }), arm.res, {});
    expect(arm.fake.status).toBe(400);
    expect((arm.fake.payload as { error: string }).error).toMatch(/integration is disabled/);
  });
});

// ---------------------------------------------------------------------------
// Managed provisioning routes (#0559 contract boundary)
// ---------------------------------------------------------------------------

describe("managed provisioning routes", () => {
  it("unconfigured reports honestly, pointing at BYO", async () => {
    const h = harness({});
    const { res, fake } = makeRes();
    await telegramProvisionBegin(ctx(h.config), makeReq({}), res, {});
    expect(fake.status).toBe(501);
    const payload = fake.payload as {
      error: string;
      managedProvisioning: { configured: boolean };
      byoAvailable: boolean;
    };
    expect(payload.error).toMatch(/not configured/);
    expect(payload.byoAvailable).toBe(true);
    expect(payload.managedProvisioning.configured).toBe(false);
  });

  it("a configured service failing answers 502 even when the text says 'not configured'", async () => {
    // The 501/502 split rides on the error class, never the message text
    // (review round 2): a service refusal that happens to contain the phrase
    // must keep reporting a *configured* service.
    const h = harness({
      provisioningService: {
        isConfigured: () => true,
        begin: async () => {
          throw new ManagedProvisioningUnavailableError(
            "service could not verify this instance: not configured",
          );
        },
        getStatus: async () => {
          throw new ManagedProvisioningUnavailableError("status failed");
        },
        redeem: async () => {
          throw new ManagedProvisioningUnavailableError("redeem failed");
        },
      } as unknown as ManagedProvisioningClient,
    });
    const begin = makeRes();
    await telegramProvisionBegin(ctx(h.config), makeReq({}), begin.res, {});
    expect(begin.fake.status).toBe(502);
    expect(
      (begin.fake.payload as { managedProvisioning: { configured: boolean } }).managedProvisioning
        .configured,
    ).toBe(true);
  });

  it("a failed post-redeem validation returns 502 with the recovery guidance", async () => {
    // redeem succeeds (single-use credential delivered), but getMe fails —
    // the route must say how to recover instead of losing the credential.
    const service = fakeProvisioningService({ redeem: { token: TOKEN2 } });
    const h = harness({
      apiHandlers: {}, // no getMe fake → validation fails
      provisioningService: createManagedProvisioningClient({
        baseUrl: "https://provision.example.com",
        fetcher: service.fetcher,
      }),
    });
    const redeemRes = makeRes();
    await telegramProvisionRedeem(ctx(h.config), makeReq(), redeemRes.res, { param1: "req-x" });
    expect(redeemRes.fake.status).toBe(502);
    const error = (redeemRes.fake.payload as { error: string }).error;
    expect(error).toMatch(/arrived but could not be validated/);
    expect(error).toMatch(/grace window/);
    expect(String(redeemRes.fake.raw)).not.toContain(TOKEN2);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
  });

  it("status/redeem through an unreachable configured service report 502", async () => {
    const h = harness({
      provisioningService: createManagedProvisioningClient({
        baseUrl: "https://provision.example.com",
        fetcher: (async () => {
          throw new Error("connect ECONNREFUSED");
        }) as unknown as typeof fetch,
      }),
    });
    const statusRes = makeRes();
    await telegramProvisionStatus(ctx(h.config), makeReq(), statusRes.res, { param1: "req-x" });
    expect(statusRes.fake.status).toBe(502);
    const redeemRes = makeRes();
    await telegramProvisionRedeem(ctx(h.config), makeReq(), redeemRes.res, { param1: "req-x" });
    expect(redeemRes.fake.status).toBe(502);
  });

  it("redeeming through the fake configured service returns the same ProvisionedBot", async () => {
    const service = fakeProvisioningService({
      begin: {
        id: "req-7",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      },
      status: {
        id: "req-7",
        state: "ready",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      },
      redeem: { token: TOKEN2 },
    });
    const h = harness({
      apiHandlers: { getMe: botMe() },
      provisioningService: createManagedProvisioningClient({
        baseUrl: "https://provision.example.com",
        authKey: "svc-auth-key",
        fetcher: service.fetcher,
      }),
    });
    const begun = makeRes();
    await telegramProvisionBegin(
      ctx(h.config),
      makeReq({ botNameHint: "RepoOS Bot" }),
      begun.res,
      {},
    );
    expect(begun.fake.status).toBe(200);
    const request = (begun.fake.payload as { request: { id: string; deepLink: string } }).request;
    expect(request.id).toBe("req-7");
    expect(request.deepLink).toContain("t.me/newbot");

    const statusRes = makeRes();
    await telegramProvisionStatus(ctx(h.config), makeReq(), statusRes.res, { param1: "req-7" });
    expect(statusRes.fake.status).toBe(200);
    expect((statusRes.fake.payload as { request: { state: string } }).request.state).toBe("ready");

    const redeemed = makeRes();
    await telegramProvisionRedeem(ctx(h.config), makeReq(), redeemed.res, { param1: "req-7" });
    expect(redeemed.fake.status).toBe(200);
    const body = String(redeemed.fake.raw);
    expect(body).not.toContain(TOKEN2);
    expect((redeemed.fake.payload as { bot: { source: string } }).bot.source).toBe("managed");
  });
});

/**
 * Scripted #0559 provisioning service (hosted side). Shape mirrors the
 * contract documented in docs/telegram-adapter.md.
 */
function fakeProvisioningService(responses: {
  begin?: Record<string, unknown>;
  status?: Record<string, unknown>;
  redeem?: Record<string, unknown>;
}) {
  const fetcher = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET");
    let result: Record<string, unknown> = {};
    if (method === "POST" && url.endsWith("/v1/provisioning/requests")) {
      result = responses.begin ?? {
        id: "req-1",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      };
    } else if (method === "POST" && url.endsWith("/redeem")) {
      result = responses.redeem ?? {};
    } else {
      result = responses.status ?? { id: "req-1", state: "ready" };
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetcher };
}
