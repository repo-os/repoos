/**
 * Telegram inbound webhook (#0532): secret validation, body limits, and proof
 * that unauthenticated callers cannot reach repository data through this route.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { SESSION_COOKIE_NAME } from "../../core/auth.js";
import { instanceIdentity } from "../../core/telegram-identity.js";
import { TelegramApiClient } from "../../server/telegram/api.js";
import { TelegramCredentialStore } from "../../server/telegram/store.js";
import { LocalTelegramProvider } from "../../server/telegram/provider.js";
import {
  TELEGRAM_WEBHOOK_MAX_BODY_BYTES,
  TELEGRAM_WEBHOOK_SECRET_HEADER,
  telegramWebhook,
  telegramWebhookPathForRoot,
} from "../../server/routes/telegram-webhook";
import { resetTelegramProviders, setTelegramProvider } from "../../server/telegram/index.js";
import { startServer, type ServerHandle } from "../../server/server";

const TOKEN = "1234567890:AAWebhookRouteFakeTokenValueXX";
const ADMIN_EMAIL = "admin@repoos.org";

let tmpRoot: string;

function fakeApi() {
  const fetcher = (async (input: unknown) => {
    const method = String(input).split("/").pop() ?? "";
    const result =
      method === "getMe"
        ? {
            id: 42,
            is_bot: true,
            first_name: "Bot",
            username: "repoos_bot",
            can_read_all_group_messages: false,
          }
        : method === "setWebhook" || method === "deleteWebhook"
          ? true
          : undefined;
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return fetcher;
}

function makeReq(
  body: string | Buffer,
  opts?: { secret?: string; contentLength?: string },
): IncomingMessage {
  const payload = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const req = {
    headers: {
      "content-type": "application/json",
      ...(opts?.secret ? { [TELEGRAM_WEBHOOK_SECRET_HEADER]: opts.secret } : {}),
      ...(opts?.contentLength !== undefined
        ? { "content-length": opts.contentLength }
        : { "content-length": String(payload.length) }),
    },
    url: telegramWebhookPathForRoot(tmpRoot),
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      yield payload;
    },
  };
  return req as unknown as IncomingMessage;
}

function makeRes(): { res: ServerResponse; fake: { status: number; raw: string } } {
  const fake = { status: 0, raw: "" };
  const res = {
    setHeader() {},
    writeHead(code: number) {
      fake.status = code;
    },
    end(payload?: string) {
      fake.raw = String(payload ?? "");
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function ctx(config: RepoOSConfig): RouteContext {
  return { config } as unknown as RouteContext;
}

async function armWebhook(provider: LocalTelegramProvider): Promise<string> {
  await provider.connectByBotToken(TOKEN);
  const path = telegramWebhookPathForRoot(tmpRoot);
  const publicUrl = `https://repo.example.com:443${path}`;
  await provider.setTransport({ mode: "webhook", webhookUrl: publicUrl });
  const secret = new TelegramCredentialStore(tmpRoot).readWebhookSecret();
  if (!secret) throw new Error("webhook secret missing after setTransport");
  return secret;
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "repoos-telegram-webhook-"));
  process.env.REPOOS_SECRET_STORE_KEY = Buffer.alloc(32, 9).toString("hex");
  mkdirSync(join(tmpRoot, "work"), { recursive: true });
  writeFileSync(
    join(tmpRoot, "repoos.toml"),
    [
      "[telegram]",
      "enabled = true",
      "",
      "[auth]",
      "enabled = true",
      "",
      "[auth.emailProvider]",
      'type = "resend"',
      'apiKey = "re_test"',
      'fromAddress = "noreply@example.com"',
      "",
    ].join("\n"),
    "utf8",
  );
});

afterEach(async () => {
  resetTelegramProviders();
  resetAuthStoreInstance();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("telegramWebhook route", () => {
  it("accepts a valid secret and returns 200 without leaking repo data", async () => {
    const config = { root: tmpRoot, telegram: { enabled: true } } as RepoOSConfig;
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "repoos",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (t) => new TelegramApiClient(t, { fetcher: fakeApi() }),
    });
    setTelegramProvider(tmpRoot, provider);
    const secret = await armWebhook(provider);
    const seen: unknown[] = [];
    provider.onUpdate((u) => {
      seen.push(u);
    });

    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 9, type: "private" },
        text: "hello",
      },
    };
    const { res, fake } = makeRes();
    await telegramWebhook(ctx(config), makeReq(JSON.stringify(update), { secret }), res, {
      param1: instanceIdentity(tmpRoot),
    });
    expect(fake.status).toBe(200);
    expect(fake.raw).toBe("");
    expect(seen.length).toBe(1);
  });

  it("rejects missing, wrong, and truncated secrets with the same generic 403", async () => {
    const config = { root: tmpRoot, telegram: { enabled: true } } as RepoOSConfig;
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "repoos",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (t) => new TelegramApiClient(t, { fetcher: fakeApi() }),
    });
    setTelegramProvider(tmpRoot, provider);
    const secret = await armWebhook(provider);
    const instance = instanceIdentity(tmpRoot);
    const body = JSON.stringify({ update_id: 1 });

    async function hit(secretHeader?: string): Promise<{ status: number; raw: string }> {
      const { res, fake } = makeRes();
      await telegramWebhook(
        ctx(config),
        makeReq(body, secretHeader ? { secret: secretHeader } : undefined),
        res,
        { param1: instance },
      );
      return { status: fake.status, raw: fake.raw };
    }

    const missing = await hit();
    const wrong = await hit(`${secret}x`);
    const truncated = await hit(secret.slice(0, secret.length - 1));

    expect(missing.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(truncated.status).toBe(403);
    expect(missing.raw).toBe(wrong.raw);
    expect(wrong.raw).toBe(truncated.raw);
    expect(missing.raw).toBe("Forbidden");
  });

  it("rejects a wrong instance id in the path with the same 403", async () => {
    const config = { root: tmpRoot, telegram: { enabled: true } } as RepoOSConfig;
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "repoos",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (t) => new TelegramApiClient(t, { fetcher: fakeApi() }),
    });
    setTelegramProvider(tmpRoot, provider);
    const secret = await armWebhook(provider);
    const { res, fake } = makeRes();
    await telegramWebhook(ctx(config), makeReq("{}", { secret }), res, {
      param1: "not-the-instance-id",
    });
    expect(fake.status).toBe(403);
    expect(fake.raw).toBe("Forbidden");
  });

  it("rejects oversized bodies after the secret check", async () => {
    const config = { root: tmpRoot, telegram: { enabled: true } } as RepoOSConfig;
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "repoos",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (t) => new TelegramApiClient(t, { fetcher: fakeApi() }),
    });
    setTelegramProvider(tmpRoot, provider);
    const secret = await armWebhook(provider);
    const huge = Buffer.alloc(TELEGRAM_WEBHOOK_MAX_BODY_BYTES + 1, 0x7b);
    const { res, fake } = makeRes();
    await telegramWebhook(
      ctx(config),
      makeReq(huge, { secret, contentLength: String(huge.length) }),
      res,
      { param1: instanceIdentity(tmpRoot) },
    );
    expect(fake.status).toBe(413);
    expect(fake.raw).toBe("Payload Too Large");
  });
});

describe("telegram webhook on a live server (auth enabled)", () => {
  async function withServer(fn: (s: ServerHandle) => Promise<void>): Promise<void> {
    const server = await startServer({ root: tmpRoot, host: "127.0.0.1", port: 0 });
    try {
      await fn(server);
    } finally {
      await server.close();
    }
  }

  it("cannot reach tasks, agents, or config without a session — including via the webhook URL", async () => {
    resetAuthStoreInstance();
    const store = getAuthStore(tmpRoot)!;
    store.upsertUser(ADMIN_EMAIL, "admin", null);
    const session = store.createSession(ADMIN_EMAIL, "admin", 3600);
    const cookie = `${SESSION_COOKIE_NAME}=${session}`;

    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "repoos",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (t) => new TelegramApiClient(t, { fetcher: fakeApi() }),
    });
    setTelegramProvider(tmpRoot, provider);
    const secret = await armWebhook(provider);
    const webhookPath = telegramWebhookPathForRoot(tmpRoot);

    writeFileSync(
      join(tmpRoot, "work", "0999-sample.md"),
      '---\nid: "0999"\ntitle: Top Secret Task\nstatus: ready\n---\n',
      "utf8",
    );

    await withServer(async (s) => {
      const tasksUnauth = await fetch(`${s.url}/api/tasks`);
      expect(tasksUnauth.status).toBe(401);

      const configUnauth = await fetch(`${s.url}/api/config`);
      expect(configUnauth.status).toBe(401);

      const agentsUnauth = await fetch(`${s.url}/api/agents`);
      expect(agentsUnauth.status).toBe(401);

      const evilBody = JSON.stringify({
        action: "exportAllTasks",
        includeConfig: true,
        path: "/api/tasks",
      });
      const webhookNoSecret = await fetch(`${s.url}${webhookPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: evilBody,
      });
      expect(webhookNoSecret.status).toBe(403);
      const noSecretText = await webhookNoSecret.text();
      expect(noSecretText).toBe("Forbidden");
      expect(noSecretText).not.toMatch(/Top Secret|0999|agents|config/i);

      const webhookBadSecret = await fetch(`${s.url}${webhookPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TELEGRAM_WEBHOOK_SECRET_HEADER]: `${secret.slice(0, 8)}`,
        },
        body: evilBody,
      });
      expect(webhookBadSecret.status).toBe(403);

      const webhookOk = await fetch(`${s.url}${webhookPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TELEGRAM_WEBHOOK_SECRET_HEADER]: secret,
        },
        body: JSON.stringify({
          update_id: 99,
          message: {
            message_id: 1,
            date: 1,
            chat: { id: 1, type: "private" },
            text: "/tasks",
          },
        }),
      });
      expect(webhookOk.status).toBe(200);
      const okText = await webhookOk.text();
      expect(okText).not.toMatch(/Top Secret|0999/);

      const tasksStillLocked = await fetch(`${s.url}/api/tasks`);
      expect(tasksStillLocked.status).toBe(401);

      const tasksAuthed = await fetch(`${s.url}/api/tasks`, { headers: { Cookie: cookie } });
      expect(tasksAuthed.status).toBe(200);
      const tasksPayload = await tasksAuthed.json();
      expect(JSON.stringify(tasksPayload)).toMatch(/Top Secret/);
    });
  });

  it("is reachable without a session cookie when the secret is valid (public prefix)", async () => {
    resetAuthStoreInstance();
    const store = getAuthStore(tmpRoot)!;
    store.upsertUser(ADMIN_EMAIL, "admin", null);

    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root: tmpRoot,
      repositoryName: "repoos",
      store: new TelegramCredentialStore(tmpRoot),
      createApi: (t) => new TelegramApiClient(t, { fetcher: fakeApi() }),
    });
    setTelegramProvider(tmpRoot, provider);
    const secret = await armWebhook(provider);
    const webhookPath = telegramWebhookPathForRoot(tmpRoot);

    await withServer(async (s) => {
      const health = await fetch(`${s.url}/api/health`);
      expect(health.status).toBe(200);

      const res = await fetch(`${s.url}${webhookPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TELEGRAM_WEBHOOK_SECRET_HEADER]: secret,
        },
        body: JSON.stringify({ update_id: 1 }),
      });
      expect(res.status).toBe(200);
    });
  });
});
