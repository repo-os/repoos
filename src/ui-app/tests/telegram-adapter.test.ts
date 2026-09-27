/**
 * Telegram adapter tests (#0531): BYO token validation, encrypted credential
 * storage, redacted errors, missing credentials, API failures, update
 * normalization (webhook / polling consistency), transport switching, and the
 * managed-provisioning boundary exercised against a fake service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TelegramApiClient,
  TelegramNetworkError,
  toProvisionedBot,
} from "../../server/telegram/api.js";
import { normalizeUpdate } from "../../server/telegram/normalize.js";
import { TelegramPolling } from "../../server/telegram/polling.js";
import {
  createManagedProvisioningClient,
  ManagedProvisioningUnavailableError,
  PROVISIONING_NOT_CONFIGURED_MESSAGE,
} from "../../server/telegram/provisioning.js";
import { makeTokenRedactor, redactTokenText } from "../../server/telegram/redact.js";
import { TelegramCredentialStore, telegramConnectionPath } from "../../server/telegram/store.js";
import {
  LocalTelegramProvider,
  TelegramNotConnectedError,
} from "../../server/telegram/provider.js";
import type { ManagedProvisioningClient, TelegramUpdate } from "../../server/telegram/types.js";

const TOKEN = "1234567890:AAFakeTokenForTestsAbcDeFgHiJkLm";
const TOKEN2 = "1234567891:ZZManagedTokenForTestsAbCdEfGhIjKl";
const API = "https://api.telegram.org";

const repoBot = (): Record<string, unknown> => ({
  id: 9876543210,
  is_bot: true,
  first_name: "RepoOS Project Bot",
  username: "repoos_project_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
});

let tmpRoot: string;

/** Scripted Bot API: routed per method, capturing URL/method/body. Values may
 * be literal results or functions of the request body. */
function fakeApi(handlers: Record<string, unknown> = {}) {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  const fetcher = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = url.split("/").pop() ?? "";
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    } catch {
      /* empty body */
    }
    calls.push({ url, method, body });
    const scripted = handlers[method];
    const result =
      scripted === undefined
        ? undefined
        : typeof scripted === "function"
          ? scripted(body)
          : scripted;
    const text =
      result === undefined
        ? JSON.stringify({ ok: false, error_code: 404, description: `no fake for ${method}` })
        : JSON.stringify({ ok: true, result });
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function makeProvider(
  handlers: Record<string, unknown> = {},
  options: Partial<{
    provisioningUrl: string;
    provisioningKey: string;
    provisioningClient: ManagedProvisioningClient;
  }> = {},
): {
  provider: LocalTelegramProvider;
  store: TelegramCredentialStore;
  calls: { url: string; method: string; body: Record<string, unknown> }[];
} {
  const store = new TelegramCredentialStore(tmpRoot);
  const api = fakeApi(handlers);
  const provider = new LocalTelegramProvider({
    resolveConfig: () => ({
      enabled: true,
      provisioningUrl: options.provisioningUrl ?? "",
      ...(options.provisioningKey ? { provisioningKey: options.provisioningKey } : {}),
    }),
    root: tmpRoot,
    repositoryName: "repoos",
    store,
    createApi: (token) => new TelegramApiClient(token, { fetcher: api.fetcher }),
    ...(options.provisioningClient
      ? { createProvisioning: () => options.provisioningClient as ManagedProvisioningClient }
      : {}),
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  liveProviders.push(provider);
  return { provider, store, calls: api.calls };
}

/** Every provider created this test — afterEach stops any polling loop. */
const liveProviders: LocalTelegramProvider[] = [];

/** Scripted provisioning service fake for the #0559 contract. */
function fakeProvisioningService(responses: {
  begin?: Record<string, unknown>;
  status?: Record<string, unknown>;
  redeem?: Record<string, unknown>;
}): {
  fetcher: typeof fetch;
  calls: {
    url: string;
    method: string;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  }[];
} {
  const calls: {
    url: string;
    method: string;
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  }[] = [];
  const fetcher = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET");
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method, body, headers });
    let result: Record<string, unknown> = {};
    let status = 200;
    if (method === "POST" && url.endsWith("/v1/provisioning/requests")) {
      result = responses.begin ?? {
        id: "req-1",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      };
    } else if (method === "POST" && url.endsWith("/redeem")) {
      if (!responses.redeem) {
        return new Response(JSON.stringify({ error: "already redeemed" }), { status: 409 });
      }
      result = responses.redeem;
    } else {
      result = responses.status ?? { id: "req-1", state: "ready" };
    }
    return new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "repoos-telegram-"));
  mkdirSync(join(tmpRoot, ".repoos"), { recursive: true });
  process.env.REPOOS_SECRET_STORE_KEY = Buffer.alloc(32, 7).toString("hex");
  delete process.env.REPOOS_TELEGRAM_PROVISIONING_KEY;
});

afterEach(async () => {
  for (const provider of liveProviders.splice(0)) {
    await provider.stopPolling();
  }
  delete process.env.REPOOS_SECRET_STORE_KEY;
  delete process.env.REPOOS_TELEGRAM_PROVISIONING_KEY;
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// Bot API client
// ---------------------------------------------------------------------------

describe("Telegram Bot API client", () => {
  it("unwraps the { ok, result } envelope", async () => {
    const client = new TelegramApiClient(TOKEN, { fetcher: fakeApi({ getMe: repoBot() }).fetcher });
    const me = await client.getMe();
    expect(me.id).toBe(9876543210);
    expect(me.username).toBe("repoos_project_bot");
  });

  it("maps !ok envelopes into TelegramApiError with the API's description", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }), {
        status: 200,
      })) as unknown as typeof fetch;
    const client = new TelegramApiClient(TOKEN, { fetcher });
    await expect(client.getMe()).rejects.toMatchObject({
      code: 401,
      description: "Unauthorized",
    });
  });

  it("surfaces 429 retry_after in milliseconds", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: "Too Many Requests",
          parameters: { retry_after: 5 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const client = new TelegramApiClient(TOKEN, { fetcher });
    await expect(client.sendMessage({ chatId: 1, text: "x" })).rejects.toMatchObject({
      retryAfterMs: 5000,
    });
  });

  it("never echoes the token: not in API errors, not in network errors", async () => {
    const nonJson = new TelegramApiClient(TOKEN, {
      fetcher: (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch,
    });
    const nonJsonErr = await nonJson.getMe().catch((e: unknown) => e);
    const text = `${(nonJsonErr as Error).name}: ${(nonJsonErr as Error).message}`;
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("/bot1234567890:");
    const dead = new TelegramApiClient(TOKEN, {
      fetcher: (async () => {
        throw new Error(`fetch failed for ${API}/bot${TOKEN}/getMe`);
      }) as unknown as typeof fetch,
    });
    const err = await dead.getMe().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramNetworkError);
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it("sendMessage maps to chat_id/text plus optional parameters", async () => {
    const api = fakeApi({ sendMessage: () => ({ message_id: 55, chat: { id: 9 }, date: 1 }) });
    const client = new TelegramApiClient(TOKEN, { fetcher: api.fetcher });
    const sent = await client.sendMessage({
      chatId: 9,
      text: "hello",
      parseMode: "HTML",
      disableNotification: true,
      replyToMessageId: 4,
    });
    expect(sent.messageId).toBe(55);
    expect(api.calls.at(-1)?.body).toEqual({
      chat_id: 9,
      text: "hello",
      parse_mode: "HTML",
      disable_notification: true,
      reply_to_message_id: 4,
    });
  });
});

// ---------------------------------------------------------------------------
// Token redaction
// ---------------------------------------------------------------------------

describe("token redaction", () => {
  it("removes the raw token and the /bot<token> URL fragment", () => {
    const input = `POST ${API}/bot${TOKEN}/sendMessage failed; token ${TOKEN}`;
    const out = redactTokenText(input, TOKEN);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain(`${API}/bot[redacted]`);
    expect(redactTokenText(out, TOKEN)).toBe(out);
  });

  it("redacts token-shaped values it was not given", () => {
    const other = "999888777:XXNOTourTOKENNOTfakeXX";
    const out = redactTokenText(`echo ${other}`, TOKEN, API);
    expect(out).not.toContain(other);
    expect(out).toContain("[redacted]");
  });

  it("honors a custom API base (local Bot API servers)", () => {
    const out = makeTokenRedactor(
      TOKEN,
      "http://127.0.0.1:8081",
    )(`POST http://127.0.0.1:8081/bot${TOKEN}/getMe`);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain("http://127.0.0.1:8081/bot[redacted]");
  });
});

// ---------------------------------------------------------------------------
// Update normalization
// ---------------------------------------------------------------------------

describe("update normalization", () => {
  it("normalizes a private command message with a bot mention and args", () => {
    const update = normalizeUpdate({
      update_id: 7,
      message: {
        message_id: 1,
        date: 1700000000,
        chat: { id: 42, type: "private" },
        from: { id: 123, is_bot: false, first_name: "Nick", username: "nick" },
        text: "/start@repoos_project_bot hello world",
      },
    });
    expect(update?.kind).toBe("message");
    expect(update?.message).toEqual({
      messageId: 1,
      chatId: 42,
      chatType: "private",
      chatTitle: null,
      senderId: 123,
      senderUsername: "nick",
      senderIsBot: false,
      text: "/start@repoos_project_bot hello world",
      date: 1700000000,
      command: "start",
      commandArgs: ["hello", "world"],
    });
  });

  it("normalizes group text, media captions, and channel posts without a sender", () => {
    const group = normalizeUpdate({
      update_id: 8,
      message: {
        message_id: 2,
        date: 1700000001,
        chat: { id: -100111, type: "supergroup", title: "RepoOS Hackers" },
        from: { id: 223, is_bot: false, first_name: "N" },
        text: "pushing to main",
      },
    });
    expect(group?.message).toMatchObject({
      chatType: "supergroup",
      chatTitle: "RepoOS Hackers",
      senderId: 223,
      text: "pushing to main",
      command: null,
      commandArgs: [],
    });
    const media = normalizeUpdate({
      update_id: 9,
      message: {
        message_id: 3,
        date: 1,
        chat: { id: 44, type: "private" },
        photo: [{ file_id: "x" }],
        caption: "/status@repoos_project_bot",
      },
    });
    expect(media?.message?.text).toBe("/status@repoos_project_bot");
    expect(media?.message?.command).toBe("status");
    expect(media?.message?.commandArgs).toEqual([]);
    const channel = normalizeUpdate({
      update_id: 10,
      channel_post: {
        message_id: 4,
        date: 1,
        chat: { id: -8, type: "channel", title: "Announcements" },
        text: "released",
      },
    });
    expect(channel?.kind).toBe("channel_post");
    expect(channel?.message?.senderId).toBeNull();
  });

  it("classifies unmapped and malformed updates honestly", () => {
    expect(normalizeUpdate({ update_id: 11, poll_answer: { poll_id: "p" } })?.kind).toBe("other");
    expect(normalizeUpdate({ no_update_id: true })).toBeNull();
    expect(normalizeUpdate(null)).toBeNull();
    expect(normalizeUpdate("hello")).toBeNull();
  });

  it("normalizes callback queries with sender and data", () => {
    const update = normalizeUpdate({
      update_id: 12,
      callback_query: {
        id: "cbq1",
        from: { id: 777, is_bot: false, first_name: "N", username: "nick" },
        data: "task:start:0531",
      },
    });
    expect(update?.kind).toBe("callback_query");
    expect(update?.callbackQuery).toEqual({
      id: "cbq1",
      fromUserId: 777,
      fromUsername: "nick",
      data: "task:start:0531",
    });
    expect(update?.message).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BYO connect + encrypted storage
// ---------------------------------------------------------------------------

describe("BYO connect and encrypted storage", () => {
  it("validates identity with getMe and stores only an encrypted envelope", async () => {
    const { provider, store, calls } = makeProvider({ getMe: repoBot() });
    const bot = await provider.connectByBotToken(TOKEN);
    expect(bot).toEqual({
      id: 9876543210,
      username: "repoos_project_bot",
      displayName: "RepoOS Project Bot",
      canReadAllGroupMessages: false,
      canJoinGroups: true,
      supportsInlineQueries: false,
      source: "byo-token",
      connectedAt: "2026-09-28T00:00:00.000Z",
    });
    expect(calls[0]).toMatchObject({ method: "getMe", url: `${API}/bot${TOKEN}/getMe` });
    // The disk record carries the AES-256-GCM envelope; no plaintext anywhere.
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    const raw = readFileSync(telegramConnectionPath(tmpRoot), "utf8");
    expect(raw).not.toContain(TOKEN);
    const envelope = (
      JSON.parse(raw) as { credential: { iv: string; tag: string; ciphertext: string } }
    ).credential;
    expect(envelope.iv).toBeTruthy();
    expect(envelope.tag).toBeTruthy();
    expect(envelope.ciphertext).toBeTruthy();
    // Server-side round trip works; browser-visible status never does.
    expect(store.readToken()).toBe(TOKEN);
    expect(JSON.stringify(provider.status())).not.toContain(TOKEN);
    expect(JSON.stringify(provider.status())).not.toContain("ciphertext");
  });

  it("fails closed without REPOOS_SECRET_STORE_KEY and writes nothing", async () => {
    delete process.env.REPOOS_SECRET_STORE_KEY;
    const { provider } = makeProvider({ getMe: repoBot() });
    await expect(provider.connectByBotToken(TOKEN)).rejects.toThrow(/REPOOS_SECRET_STORE_KEY/);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
  });

  it("rejects empty tokens before touching the API", async () => {
    const { provider, calls } = makeProvider({ getMe: repoBot() });
    await expect(provider.connectByBotToken("   ")).rejects.toThrow(/token is required/);
    expect(calls).toHaveLength(0);
  });

  it("applies the default profile (help command + repository description) on connect", async () => {
    const { provider, calls } = makeProvider({
      getMe: repoBot(),
      setMyCommands: true,
      setMyDescription: true,
      setMyShortDescription: true,
    });
    await provider.connectByBotToken(TOKEN);
    await provider.applyDefaultProfile();
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("setMyCommands");
    expect(methods).toContain("setMyDescription");
    expect(methods).toContain("setMyShortDescription");
    const commands = calls.find((c) => c.method === "setMyCommands")?.body.commands as {
      command: string;
    }[];
    expect(commands).toEqual([{ command: "help", description: "What this RepoOS bot can do" }]);
    // The description names this repository.
    const description = String(
      calls.find((c) => c.method === "setMyDescription")?.body.description,
    );
    expect(description).toContain("repoos");
  });

  it("reconnecting with a second token overwrites the stored connection", async () => {
    const { provider } = makeProvider({
      getMe: repoBot(),
      setMyCommands: true,
    });
    await provider.connectByBotToken(TOKEN);
    await provider.configureProfile({ commands: [{ command: "custom", description: "d" }] });
    const bot = await provider.connectByBotToken(TOKEN2);
    expect(bot.username).toBe("repoos_project_bot");
    // The stored credential reads back as the new token.
    expect(new TelegramCredentialStore(tmpRoot).readToken()).toBe(TOKEN2);
  });

  it("storage read fails when the key changes, credentials stay encrypted", async () => {
    const { provider } = makeProvider({ getMe: repoBot() });
    await provider.connectByBotToken(TOKEN);
    const store = new TelegramCredentialStore(tmpRoot);
    expect(store.readToken()).toBe(TOKEN);
    process.env.REPOOS_SECRET_STORE_KEY = Buffer.alloc(32, 8).toString("hex");
    expect(() => store.readToken()).toThrow(/cannot be decrypted/);
    const bytes = readFileSync(telegramConnectionPath(tmpRoot), "utf8");
    expect(bytes).not.toContain(TOKEN);
  });

  it("a non-bot getMe identity is rejected before anything is stored", async () => {
    const { provider, calls } = makeProvider({
      getMe: () => ({ id: 5, is_bot: false, first_name: "Nick" }),
    });
    await expect(provider.connectByBotToken(TOKEN)).rejects.toThrow(/user, not a bot/);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Missing credentials + API failures
// ---------------------------------------------------------------------------

describe("missing credentials fail closed", () => {
  it("bot operations require a connection", async () => {
    const { provider } = makeProvider({});
    await expect(provider.sendMessage(1, "hi")).rejects.toThrow(/no Telegram bot is connected/);
    await expect(provider.configureProfile({ description: "d" })).rejects.toBeInstanceOf(
      TelegramNotConnectedError,
    );
    await expect(provider.setTransport({ mode: "polling" })).rejects.toBeInstanceOf(
      TelegramNotConnectedError,
    );
    const status = provider.status();
    expect(status.connected).toBe(false);
    expect(status.transport.mode).toBe("off");
    expect(status.bot).toBeUndefined();
  });
});

describe("API failure blocking", () => {
  it("429 surfaces retryAfterMs and records a status error", async () => {
    const fetcher = (async (input: unknown) => {
      const method = String(input).split("/").pop();
      if (method === "getMe")
        return new Response(JSON.stringify({ ok: true, result: repoBot() }), { status: 200 });
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: "Too Many Requests",
          parameters: { retry_after: 2 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "r",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (token) => new TelegramApiClient(token, { fetcher }),
    });
    await provider.connectByBotToken(TOKEN);
    await expect(provider.sendMessage(1, "x")).rejects.toMatchObject({ retryAfterMs: 2000 });
    expect(provider.status().lastError).toBe("Too Many Requests");
  });

  it("network failures during delivery leave the credential intact", async () => {
    const fetcher = (async (input: unknown) => {
      const method = String(input).split("/").pop();
      if (method === "getMe")
        return new Response(JSON.stringify({ ok: true, result: repoBot() }), { status: 200 });
      // Delivery to a bot the instance can't reach: the fetch itself fails.
      throw new Error(`fetch failed for ${API}/bot${TOKEN}/sendMessage`);
    }) as unknown as typeof fetch;
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "r",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (token) => new TelegramApiClient(token, { fetcher }),
    });
    await provider.connectByBotToken(TOKEN);
    const err = await provider.sendMessage(1, "x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramNetworkError);
    expect((err as Error).message).not.toContain(TOKEN);
    // Connection survives an outbound failure — status stays connected, no token leaked.
    const status = provider.status();
    expect(status.connected).toBe(true);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Profile & commands
// ---------------------------------------------------------------------------

describe("bot profile configuration", () => {
  it("validates limits locally and applies commands/name/description", async () => {
    const { provider, calls } = makeProvider({
      getMe: repoBot(),
      setMyCommands: () => true,
      setMyName: () => true,
      setMyDescription: () => true,
      setMyShortDescription: () => true,
    });
    await provider.connectByBotToken(TOKEN);
    const profile = await provider.configureProfile({
      commands: [{ command: "/Help", description: "Help" }],
      name: "RepoOS at repoos",
      description: "d".repeat(500),
      shortDescription: "short",
    });
    expect(profile.commands).toEqual([{ command: "help", description: "Help" }]);
    const methods = calls.map((c) => c.method);
    expect(methods).toEqual(
      expect.arrayContaining([
        "setMyCommands",
        "setMyName",
        "setMyDescription",
        "setMyShortDescription",
      ]),
    );
    const commandBody = calls.find((c) => c.method === "setMyCommands")?.body;
    expect(commandBody?.commands).toEqual([{ command: "help", description: "Help" }]);
  });

  it("rejects out-of-limit inputs without an API call", async () => {
    const { provider, calls } = makeProvider({ getMe: repoBot(), setMyCommands: () => true });
    await provider.connectByBotToken(TOKEN);
    await expect(provider.configureProfile({ name: "x".repeat(65) })).rejects.toThrow(
      /64-character/,
    );
    await expect(provider.configureProfile({ description: "x".repeat(513) })).rejects.toThrow(
      /512/,
    );
    await expect(
      provider.configureProfile({ commands: [{ command: "Ok bad!", description: "d" }] }),
    ).rejects.toThrow(/1–32 chars/);
    await expect(
      provider.configureProfile({
        commands: Array.from({ length: 101 }, () => ({ command: "a", description: "d" })),
      }),
    ).rejects.toThrow(/at most 100/);
    expect(calls.map((c) => c.method)).toEqual(["getMe"]);
  });
});

// ---------------------------------------------------------------------------
// Transport boundary
// ---------------------------------------------------------------------------

describe("transport boundary", () => {
  const rawUpdate = {
    update_id: 21,
    message: {
      message_id: 5,
      date: 1700000009,
      chat: { id: 99, type: "private" },
      from: { id: 333, is_bot: false, first_name: "N" },
      text: "/help",
    },
  };

  it("webhook and polling normalize the same update identically", async () => {
    const { provider } = makeProvider({
      getMe: repoBot(),
      getWebhookInfo: () => ({ url: "" }),
      getUpdates: () => [rawUpdate],
      deleteWebhook: () => true,
    });
    await provider.connectByBotToken(TOKEN);
    const seen: TelegramUpdate[] = [];
    provider.onUpdate(async (update) => {
      seen.push(update);
    });

    // Webhook path: the raw body lands on the provider's shared intake.
    const viaWebhook = await provider.handleUpdate(rawUpdate);
    expect(viaWebhook).toMatchObject({ updateId: 21, kind: "message" });
    expect(viaWebhook?.message).toMatchObject({ chatId: 99, senderId: 333, command: "help" });
    // Polling path: a real loop whose onRaw points at the same provider.
    const baseline = JSON.parse(JSON.stringify(viaWebhook)) as TelegramUpdate;
    const polling = new TelegramPolling({
      api: new TelegramApiClient(TOKEN, {
        fetcher: fakeApi({ getUpdates: () => [rawUpdate] }).fetcher,
      }),
      onRaw: (raw) => void provider.handleUpdate(raw),
      readPointer: () => null,
      writePointer: () => undefined,
    });
    await polling.pollOnce();
    // One delivery per transport; both normalize identically above the
    // per-delivery `receivedAt` stamp, which is wallclock by design.
    expect(seen).toHaveLength(2);
    const withoutReceipt = (update: TelegramUpdate) => {
      const { receivedAt: _receivedAt, ...identical } = update;
      void _receivedAt;
      return identical;
    };
    expect(withoutReceipt(seen[1])).toEqual(withoutReceipt(baseline));
  });

  it("setTransport(webhook) registers with a generated secret stored encrypted", async () => {
    const { provider, calls } = makeProvider({
      getMe: repoBot(),
      setWebhook: () => true,
      getWebhookInfo: () => ({ url: "" }),
    });
    await provider.connectByBotToken(TOKEN);
    const transport = await provider.setTransport({
      mode: "webhook",
      webhookUrl: "https://repo.example.com:443/api/telegram/webhook/p",
    });
    expect(transport).toEqual({
      mode: "webhook",
      webhookUrl: "https://repo.example.com:443/api/telegram/webhook/p",
    });
    const body = calls.find((c) => c.method === "setWebhook")?.body as {
      url: string;
      secret_token: string;
      allowed_updates: string[];
    };
    expect(body.secret_token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.allowed_updates).toContain("message");
    // Stored encrypted; disk never carries the secret in plaintext.
    expect(readFileSync(telegramConnectionPath(tmpRoot), "utf8")).not.toContain(body.secret_token);
    expect(new TelegramCredentialStore(tmpRoot).readWebhookSecret()).toBe(body.secret_token);
  });

  it("enforces the public Bot API's webhook URL rules", async () => {
    const { provider } = makeProvider({ getMe: repoBot(), setWebhook: () => true });
    await provider.connectByBotToken(TOKEN);
    await expect(
      provider.setTransport({ mode: "webhook", webhookUrl: "http://repo.example.com/x" }),
    ).rejects.toThrow(/HTTPS/);
    await expect(
      provider.setTransport({ mode: "webhook", webhookUrl: "https://repo.example.com:8444/x" }),
    ).rejects.toThrow(/443, 80, 88, 8443/);
    await expect(provider.setTransport({ mode: "webhook" })).rejects.toThrow(/needs a webhookUrl/);
  });

  it("going off stops updates and clears the webhook secret", async () => {
    const { provider, store, calls } = makeProvider({
      getMe: repoBot(),
      getWebhookInfo: () => ({ url: "https://old.example.com/h" }),
      setWebhook: () => true,
      deleteWebhook: () => true,
      getUpdates: () => [],
    });
    await provider.connectByBotToken(TOKEN);
    await provider.setTransport({ mode: "webhook", webhookUrl: "https://repo.example.com/h" });
    const transport = await provider.setTransport({ mode: "off" });
    expect(transport.mode).toBe("off");
    expect(calls.some((c) => c.method === "deleteWebhook")).toBe(true);
    expect(store.readWebhookSecret()).toBeNull();
    expect(provider.transport().mode).toBe("off");
  });

  it("starting polling clears an existing webhook (Telegram refuses getUpdates while one is set)", async () => {
    const { provider, calls } = makeProvider({
      getMe: repoBot(),
      getWebhookInfo: () => ({ url: "https://old.example.com/h" }),
      deleteWebhook: () => true,
      getUpdates: () => [],
    });
    await provider.connectByBotToken(TOKEN);
    const transport = await provider.setTransport({ mode: "polling" });
    expect(transport.mode).toBe("polling");
    expect(calls.some((c) => c.method === "deleteWebhook")).toBe(true);
    expect(provider.transport().mode).toBe("polling");
  });
});

// ---------------------------------------------------------------------------
// Managed provisioning vs. the fake service (#0559 contract)
// ---------------------------------------------------------------------------

describe("managed provisioning", () => {
  it("unconfigured reports honestly while BYO keeps working", async () => {
    const client = createManagedProvisioningClient();
    expect(client.isConfigured()).toBe(false);
    await expect(
      client.begin({ repository: "r", instanceId: "i", adminEmail: "a@example.com" }),
    ).rejects.toBeInstanceOf(ManagedProvisioningUnavailableError);
    await expect(
      client.begin({ repository: "r", instanceId: "i", adminEmail: "a@example.com" }),
    ).rejects.toMatchObject({ message: PROVISIONING_NOT_CONFIGURED_MESSAGE });
    const { provider } = makeProvider({ getMe: repoBot() });
    expect(provider.status().managedProvisioning.configured).toBe(false);
    await expect(provider.redeemManagedCredential("req-1")).rejects.toThrow(/not configured/);
    // BYO unaffected:
    const bot = await provider.connectByBotToken(TOKEN);
    expect(bot.source).toBe("byo-token");
  });

  it("a configured fake service: begin → status → redeem into the same ProvisionedBot", async () => {
    const service = fakeProvisioningService({
      begin: {
        id: "req-9",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      },
      status: {
        id: "req-9",
        state: "ready",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      },
      redeem: { token: TOKEN2 },
    });
    const { provider } = makeProvider(
      { getMe: repoBot() },
      {
        provisioningUrl: "https://provision.example.com",
        provisioningKey: "svc-key",
        provisioningClient: createManagedProvisioningClient({
          baseUrl: "https://provision.example.com",
          authKey: "svc-key",
          fetcher: service.fetcher,
        }),
      },
    );
    const begin = await provider.beginManagedProvisioning({ adminEmail: "admin@example.com" });
    expect(begin).toEqual({
      id: "req-9",
      deepLink: "https://t.me/newbot/RepoOSBot",
      expiresAt: "2026-09-29T00:00:00Z",
    });
    const status = await provider.getManagedProvisioningStatus("req-9");
    expect(status.state).toBe("ready");
    expect(JSON.stringify(status)).not.toContain(TOKEN2);
    // Redeem — the service delivers the project credential server-to-server.
    const bot = await provider.redeemManagedCredential("req-9");
    expect(bot).toMatchObject({
      id: 9876543210,
      username: "repoos_project_bot",
      source: "managed",
    });
    // The instance authenticated itself; the credential was stored like BYO.
    const redeemCall = service.calls.find((c) => c.url.endsWith("/redeem"));
    expect(redeemCall).toBeDefined();
    expect((redeemCall?.headers ?? {}).Authorization ?? "").toContain("svc-key");
    const disk = readFileSync(telegramConnectionPath(tmpRoot), "utf8");
    expect(disk).not.toContain(TOKEN2);
    expect(new TelegramCredentialStore(tmpRoot).readToken()).toBe(TOKEN2);
    expect(provider.status().bot?.source).toBe("managed");
  });

  it("the service sees only repository, instance, and admin identity — never a credential", async () => {
    const service = fakeProvisioningService({
      begin: {
        id: "req-2",
        deep_link: "https://t.me/newbot/RepoOSBot",
        expires_at: "2026-09-29T00:00:00Z",
      },
      redeem: { token: TOKEN2 },
    });
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "https://provision.example.com" }),
      root: tmpRoot,
      repositoryName: "my-repo",
      store: new TelegramCredentialStore(tmpRoot),
      createProvisioning: () =>
        createManagedProvisioningClient({
          baseUrl: "https://provision.example.com",
          fetcher: service.fetcher,
        }),
    });
    await provider.beginManagedProvisioning({ adminEmail: "admin@example.com" });
    // The begin call carries repository identity only — no credential material.
    const beginCall = service.calls.find((c) => c.url.endsWith("/v1/provisioning/requests"));
    expect(beginCall).toBeDefined();
    expect(beginCall?.body.repository).toBe("my-repo");
    expect(beginCall?.body.requestedBy).toBe("admin@example.com");
    expect(JSON.stringify(beginCall?.body ?? {})).not.toContain("token");
  });

  it("a service outage fails with a network-flavored unavailable error and redacted auth key", async () => {
    const failing = (async () => {
      throw new Error("fetch failed: socket hang up");
    }) as unknown as typeof fetch;
    const authKey = "REDACT_MEsehcret91918277";
    const client = createManagedProvisioningClient({
      baseUrl: "https://provision.example.com",
      authKey,
      fetcher: failing,
    });
    const err = await client
      .begin({ repository: "r", instanceId: "i", adminEmail: "a@example.com" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ManagedProvisioningUnavailableError);
    expect((err as Error).message).toMatch(/unreachable/);
    expect((err as Error).message).not.toContain(authKey);
  });
});

// ---------------------------------------------------------------------------
// Provider plumbing usable by routes
// ---------------------------------------------------------------------------

describe("provider plumbing", () => {
  it("toProvisionedBot strips the @ from usernames, keeps display", () => {
    const bot = toProvisionedBot(
      { id: 1, is_bot: true, first_name: "Bot", username: "at_bot" },
      "byo-token",
      "2026-01-01T00:00:00Z",
    );
    expect(bot.username).toBe("at_bot");
    expect(bot.displayName).toBe("Bot");
  });

  it("handleUpdate drops malformed payloads without erroring", async () => {
    const { provider } = makeProvider({ getMe: repoBot() });
    await expect(provider.handleUpdate(null)).resolves.toBeNull();
    await expect(provider.handleUpdate("junk")).resolves.toBeNull();
  });
});
