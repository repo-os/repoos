/**
 * Telegram disconnect (#0539): ordered teardown, honest partial failure, isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { AuthStore, getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { TELEGRAM_DISCONNECT_AUDIT } from "../../core/telegram-disconnect.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import { instanceIdentity } from "../../core/telegram-identity.js";
import { TelegramApiClient } from "../../server/telegram/api.js";
import { TelegramCredentialStore, telegramConnectionPath } from "../../server/telegram/store.js";
import { LocalTelegramProvider } from "../../server/telegram/provider.js";
import {
  finalizeTelegramDisconnect,
  removeBotWebhook,
  revokeProjectBotToken,
} from "../../server/telegram/disconnect.js";
import { createManagedProvisioningClient } from "../../server/telegram/provisioning.js";
import { resetTelegramProviders, setTelegramProvider } from "../../server/telegram/index.js";
import { performTelegramDisconnectRoute } from "../../server/routes/telegram";
import { TelegramDisconnectError } from "../../server/telegram/types.js";

const TOKEN = "1234567890:AADisconnectFakeTokenValueHereXX";
const botMe = (): Record<string, unknown> => ({
  id: 246810,
  is_bot: true,
  first_name: "RepoOS Bot",
  username: "repoos_bot",
  can_read_all_group_messages: false,
});

function fakeApi(methodHandlers: Record<string, unknown> = {}) {
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

    if (revokedTokens.has(callToken)) {
      return new Response(
        JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const scripted = methodHandlers[method];
    const result =
      scripted === undefined
        ? undefined
        : typeof scripted === "function"
          ? scripted(body, { callToken, revokedTokens })
          : scripted;

    const text =
      result === undefined
        ? JSON.stringify({ ok: false, error_code: 404, description: `no fake for ${method}` })
        : JSON.stringify({ ok: true, result });
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetcher, calls, revokedTokens };
}

function disconnectHandlers(): Record<string, unknown> {
  return {
    getMe: botMe(),
    deleteWebhook: true,
    getWebhookInfo: () => ({ url: "" }),
  };
}

function makeProvider(
  root: string,
  handlers: Record<string, unknown>,
  provisioningClient?: ReturnType<typeof createManagedProvisioningClient>,
) {
  const api = fakeApi(handlers);
  const store = new TelegramCredentialStore(root);
  const provider = new LocalTelegramProvider({
    root,
    repositoryName: "disconnect-test",
    store,
    resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
    createApi: (token) => new TelegramApiClient(token, { fetcher: api.fetcher }),
    ...(provisioningClient ? { createProvisioning: () => provisioningClient } : {}),
  });
  setTelegramProvider(root, provider);
  return { provider, api, store };
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "repoos-tg-disc-"));
  process.env.REPOOS_SECRET_STORE_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

afterEach(() => {
  resetTelegramProviders();
  resetAuthStoreInstance();
  delete process.env.REPOOS_SECRET_STORE_KEY;
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("disconnect steps", () => {
  it("removeBotWebhook rejects unauthorized responses instead of claiming removal", async () => {
    const fetcher = (async (input: unknown) => {
      const method = String(input).split("/").pop() ?? "";
      if (method === "deleteWebhook") {
        return new Response(
          JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as typeof fetch;
    const client = new TelegramApiClient(TOKEN, { fetcher });
    await expect(removeBotWebhook(client)).rejects.toMatchObject({ code: 401 });
  });

  it("removeBotWebhook deletes and confirms an empty webhook URL", async () => {
    const api = fakeApi({
      deleteWebhook: true,
      getWebhookInfo: () => ({ url: "" }),
    });
    const client = new TelegramApiClient(TOKEN, { fetcher: api.fetcher });
    await expect(removeBotWebhook(client)).resolves.toBe(true);
    expect(api.calls.some((c) => c.method === "deleteWebhook")).toBe(true);
    expect(api.calls.some((c) => c.method === "getWebhookInfo")).toBe(true);
  });

  it("revokeProjectBotToken confirms BYO after BotFather invalidates the old token", async () => {
    const api = fakeApi({
      getMe: botMe(),
    });
    api.revokedTokens.add(TOKEN);
    const client = new TelegramApiClient(TOKEN, { fetcher: api.fetcher });
    const managed = createManagedProvisioningClient();
    const result = await revokeProjectBotToken({
      api: client,
      oldToken: TOKEN,
      botId: 246810,
      source: "byo-token",
      managed,
      repository: "disconnect-test",
      instanceId: "inst-a",
      createApi: (token) => new TelegramApiClient(token, { fetcher: api.fetcher }),
    });
    expect(result.confirmed).toBe(true);
    expect(result.method).toBe("botfather-revocation");
  });

  it("revokeProjectBotToken directs admins to revoke a still-valid BYO token in BotFather", async () => {
    const api = fakeApi({
      getMe: botMe(),
    });
    const client = new TelegramApiClient(TOKEN, { fetcher: api.fetcher });
    await expect(
      revokeProjectBotToken({
        api: client,
        oldToken: TOKEN,
        botId: 246810,
        source: "byo-token",
        managed: createManagedProvisioningClient(),
        repository: "disconnect-test",
        instanceId: "inst-a",
        createApi: (token) => new TelegramApiClient(token, { fetcher: api.fetcher }),
      }),
    ).rejects.toMatchObject({
      phase: "revoke",
      retryable: true,
      message: expect.stringMatching(/revoke it in @BotFather/i),
    });
  });

  it("revokeProjectBotToken treats provisioning network errors as retryable", async () => {
    const managed = createManagedProvisioningClient({
      baseUrl: "https://provision.example.com",
      fetcher: (async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      }) as typeof fetch,
    });
    const client = new TelegramApiClient(TOKEN, { fetcher: fakeApi({}).fetcher });
    await expect(
      revokeProjectBotToken({
        api: client,
        oldToken: TOKEN,
        botId: 246810,
        source: "managed",
        managed,
        repository: "disconnect-test",
        instanceId: "inst-a",
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: true });
  });

  it("revokeProjectBotToken treats provisioning HTTP 5xx as retryable", async () => {
    const service = {
      fetcher: (async () =>
        new Response(JSON.stringify({ error: "down" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    };
    const managed = createManagedProvisioningClient({
      baseUrl: "https://provision.example.com",
      fetcher: service.fetcher,
    });
    const client = new TelegramApiClient(TOKEN, { fetcher: fakeApi({}).fetcher });
    await expect(
      revokeProjectBotToken({
        api: client,
        oldToken: TOKEN,
        botId: 246810,
        source: "managed",
        managed,
        repository: "disconnect-test",
        instanceId: "inst-a",
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: true });
  });

  it("revokeProjectBotToken refuses managed bots when provisioning is not configured", async () => {
    const client = new TelegramApiClient(TOKEN, { fetcher: fakeApi({}).fetcher });
    await expect(
      revokeProjectBotToken({
        api: client,
        oldToken: TOKEN,
        botId: 246810,
        source: "managed",
        managed: createManagedProvisioningClient(),
        repository: "disconnect-test",
        instanceId: "inst-a",
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: false });
  });

  it("revokeProjectBotToken uses managed provisioning when configured", async () => {
    const service = {
      fetcher: (async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/revoke")) {
          return new Response(JSON.stringify({ ok: true, confirmed: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      }) as typeof fetch,
    };
    const managed = createManagedProvisioningClient({
      baseUrl: "https://provision.example.com",
      fetcher: service.fetcher,
    });
    const api = fakeApi({ getWebhookInfo: () => ({ url: "" }) });
    const client = new TelegramApiClient(TOKEN, { fetcher: api.fetcher });
    const result = await revokeProjectBotToken({
      api: client,
      oldToken: TOKEN,
      botId: 246810,
      source: "managed",
      managed,
      repository: "disconnect-test",
      instanceId: "inst-a",
    });
    expect(result.confirmed).toBe(true);
    expect(result.method).toBe("managed-provisioning-service");
  });

  it("finalizeTelegramDisconnect fails when the disconnect audit row cannot be written", () => {
    const store = getAuthStore(tmpRoot)!;
    const spy = vi.spyOn(store, "logAuditRequired").mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() =>
      finalizeTelegramDisconnect({
        authStore: store,
        actorEmail: "admin@test.com",
        instanceId: instanceIdentity(tmpRoot),
        revokedAt: new Date().toISOString(),
        record: null,
        revocationConfirmed: true,
        revocationMethod: "botfather-revocation",
        webhookRemoved: true,
        alreadyDisconnected: true,
        clearCredential: () => undefined,
      }),
    ).toThrow(/disk full/);
    spy.mockRestore();
  });

  it("rolls back all binding changes when disconnect audit writing fails", () => {
    const store = getAuthStore(tmpRoot)!;
    store.upsertTelegramLink({
      telegramUserId: 43,
      email: "alice@test.com",
      telegramUsername: null,
      boundAt: new Date().toISOString(),
      boundBy: "admin@test.com",
      lastSeenAt: null,
      revokedAt: null,
    });
    bindTelegramChatDirect(store, {
      telegramChatId: -1002,
      chatType: "group",
      title: "Ops",
      actorEmail: "admin@test.com",
    });
    const spy = vi.spyOn(store, "logAuditRequired").mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() =>
      finalizeTelegramDisconnect({
        authStore: store,
        actorEmail: "admin@test.com",
        instanceId: instanceIdentity(tmpRoot),
        revokedAt: new Date().toISOString(),
        record: null,
        revocationConfirmed: true,
        revocationMethod: "botfather-revocation",
        webhookRemoved: true,
        alreadyDisconnected: false,
        clearCredential: () => expect.unreachable("credential must remain"),
      }),
    ).toThrow(/disk full/);
    expect(store.getTelegramLink(43)?.revokedAt).toBeNull();
    expect(store.getTelegramChatLink(-1002)?.revokedAt).toBeNull();
    spy.mockRestore();
  });

  it("finalizeTelegramDisconnect fails when the credential file cannot be removed", () => {
    const store = getAuthStore(tmpRoot)!;
    try {
      finalizeTelegramDisconnect({
        authStore: store,
        actorEmail: "admin@test.com",
        instanceId: instanceIdentity(tmpRoot),
        revokedAt: new Date().toISOString(),
        record: null,
        revocationConfirmed: true,
        revocationMethod: "botfather-revocation",
        webhookRemoved: true,
        alreadyDisconnected: true,
        clearCredential: () => {
          throw new Error("failed to remove stored Telegram connection: EACCES");
        },
      });
      expect.unreachable("expected disconnect finalization to fail");
    } catch (e) {
      expect(e).toMatchObject({ phase: "local", retryable: true });
    }
  });

  it("TelegramCredentialStore.clear surfaces filesystem errors", async () => {
    const { provider } = makeProvider(tmpRoot, disconnectHandlers());
    await provider.connectByBotToken(TOKEN);
    const credStore = new TelegramCredentialStore(tmpRoot);
    const repoosDir = join(tmpRoot, ".repoos");
    chmodSync(repoosDir, 0o555);
    try {
      expect(() => credStore.clear()).toThrow(/failed to remove stored Telegram connection/);
      expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    } finally {
      chmodSync(repoosDir, 0o700);
    }
  });

  it("finalizeTelegramDisconnect clears bindings and writes audit", async () => {
    const store = getAuthStore(tmpRoot)!;
    store.upsertUser("alice@test.com", "admin", null);
    store.upsertTelegramLink({
      telegramUserId: 42,
      email: "alice@test.com",
      telegramUsername: "alice",
      boundAt: new Date().toISOString(),
      boundBy: "admin@test.com",
      lastSeenAt: null,
      revokedAt: null,
    });
    bindTelegramChatDirect(store, {
      telegramChatId: -1001,
      chatType: "group",
      title: "Ops",
      actorEmail: "admin@test.com",
    });

    const cleared = finalizeTelegramDisconnect({
      authStore: store,
      actorEmail: "admin@test.com",
      instanceId: instanceIdentity(tmpRoot),
      revokedAt: new Date().toISOString(),
      record: null,
      revocationConfirmed: true,
      revocationMethod: "botfather-revocation",
      webhookRemoved: true,
      alreadyDisconnected: false,
      clearCredential: () => undefined,
    });
    expect(cleared.userLinks).toBe(1);
    expect(cleared.chatLinks).toBe(1);
    expect(store.listTelegramLinks()).toHaveLength(0);
    expect(store.listTelegramChatLinks()).toHaveLength(0);
    const audit = store.getAuditLog(10);
    expect(
      audit.some((row) => row.action === TELEGRAM_DISCONNECT_AUDIT.integrationDisconnected),
    ).toBe(true);
  });
});

describe("provider disconnect", () => {
  it("leaves local state intact when Telegram revoke fails", async () => {
    const { provider } = makeProvider(tmpRoot, {
      getMe: botMe(),
      getWebhookInfo: () => ({ url: "" }),
      deleteWebhook: () => {
        throw new Error("network down");
      },
    });
    await provider.connectByBotToken(TOKEN);
    const store = getAuthStore(tmpRoot)!;
    store.upsertUser("alice@test.com", "admin", null);
    store.upsertTelegramLink({
      telegramUserId: 7,
      email: "alice@test.com",
      telegramUsername: null,
      boundAt: new Date().toISOString(),
      boundBy: "admin@test.com",
      lastSeenAt: null,
      revokedAt: null,
    });

    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "webhook" });

    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    expect(store.getTelegramLink(7)?.revokedAt).toBeNull();
    const attempt = store
      .getAuditLog(10)
      .find((row) => row.action === TELEGRAM_DISCONNECT_AUDIT.integrationDisconnected);
    expect(attempt?.actorEmail).toBe("admin@test.com");
    expect(JSON.parse(attempt?.details ?? "{}")).toMatchObject({
      revocationConfirmed: false,
      revocationAttempted: false,
      failedPhase: "webhook",
    });
  });

  it("surfaces credential removal failure after Telegram revocation succeeds", async () => {
    const { provider, api } = makeProvider(tmpRoot, disconnectHandlers());
    await provider.connectByBotToken(TOKEN);
    const store = getAuthStore(tmpRoot)!;
    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "revoke" });
    api.revokedTokens.add(TOKEN);
    const clearSpy = vi.spyOn(TelegramCredentialStore.prototype, "clear").mockImplementation(() => {
      throw new Error("failed to remove stored Telegram connection: EACCES");
    });
    try {
      await expect(
        provider.disconnect({
          actorEmail: "admin@test.com",
          authStore: store,
          instanceId: instanceIdentity(tmpRoot),
        }),
      ).rejects.toMatchObject({ phase: "local", retryable: true });
      expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    } finally {
      clearSpy.mockRestore();
    }
  });

  it("keeps local state until BYO token revocation is confirmed, then tears down", async () => {
    const { provider, api } = makeProvider(tmpRoot, disconnectHandlers());
    await provider.connectByBotToken(TOKEN);
    const store = getAuthStore(tmpRoot)!;
    store.upsertUser("alice@test.com", "admin", null);
    store.upsertTelegramLink({
      telegramUserId: 7,
      email: "alice@test.com",
      telegramUsername: null,
      boundAt: new Date().toISOString(),
      boundBy: "admin@test.com",
      lastSeenAt: null,
      revokedAt: null,
    });
    bindTelegramChatDirect(store, {
      telegramChatId: -55,
      chatType: "group",
      title: "Alerts",
      actorEmail: "admin@test.com",
    });

    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: true });
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    expect(store.listTelegramLinks()).toHaveLength(1);
    const attempt = store
      .getAuditLog(10)
      .find((row) => row.action === TELEGRAM_DISCONNECT_AUDIT.integrationDisconnected);
    expect(JSON.parse(attempt?.details ?? "{}")).toMatchObject({
      revocationConfirmed: false,
      revocationAttempted: true,
      revocationMethod: "botfather-revocation",
      webhookRemoved: true,
      failedPhase: "revoke",
    });
    api.revokedTokens.add(TOKEN);
    const result = await provider.disconnect({
      actorEmail: "admin@test.com",
      authStore: store,
      instanceId: instanceIdentity(tmpRoot),
    });
    expect(result.complete).toBe(true);
    expect(result.revocationConfirmed).toBe(true);
    expect(result.webhookRemoved).toBe(true);
    expect(result.bindingsCleared.userLinks).toBe(1);
    expect(result.bindingsCleared.chatLinks).toBe(1);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
    expect(store.listTelegramLinks()).toHaveLength(0);
    const disconnectAudit = store
      .getAuditLog(10)
      .find(
        (row) =>
          row.action === TELEGRAM_DISCONNECT_AUDIT.integrationDisconnected &&
          JSON.parse(row.details ?? "{}").revocationConfirmed === true,
      );
    expect(disconnectAudit?.actorEmail).toBe("admin@test.com");
    expect(JSON.parse(disconnectAudit?.details ?? "{}")).toMatchObject({
      revocationConfirmed: true,
      webhookRemoved: true,
    });
  });

  it("BYO disconnect completes on retry after the token is revoked at BotFather", async () => {
    const { provider, api } = makeProvider(tmpRoot, disconnectHandlers());
    await provider.connectByBotToken(TOKEN);
    const store = getAuthStore(tmpRoot)!;
    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: true });
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);

    api.revokedTokens.add(TOKEN);
    const callsBeforeRetry = api.calls.length;
    const result = await provider.disconnect({
      actorEmail: "admin@test.com",
      authStore: store,
      instanceId: instanceIdentity(tmpRoot),
    });
    expect(result.complete).toBe(true);
    expect(result.revocationConfirmed).toBe(true);
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(false);
    const retryCalls = api.calls.slice(callsBeforeRetry);
    expect(retryCalls.some((c) => c.method === "deleteWebhook")).toBe(false);
  });

  it("a second disconnect after success is idempotent", async () => {
    const { provider, api } = makeProvider(tmpRoot, disconnectHandlers());
    await provider.connectByBotToken(TOKEN);
    const store = getAuthStore(tmpRoot)!;
    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "revoke" });
    api.revokedTokens.add(TOKEN);
    const first = await provider.disconnect({
      actorEmail: "admin@test.com",
      authStore: store,
      instanceId: instanceIdentity(tmpRoot),
    });
    expect(first.complete).toBe(true);
    const second = await provider.disconnect({
      actorEmail: "admin@test.com",
      authStore: store,
      instanceId: instanceIdentity(tmpRoot),
    });
    expect(second.complete).toBe(true);
    expect(second.alreadyDisconnected).toBe(true);
  });

  it("serializes reconnect behind an in-flight disconnect and preserves the new credential", async () => {
    const nextToken = "9876543210:AAReconnectFakeTokenValueHereYY";
    let releaseRevocation!: () => void;
    let reachedRevocation!: () => void;
    const revocationReached = new Promise<void>((resolve) => {
      reachedRevocation = resolve;
    });
    const revocationGate = new Promise<void>((resolve) => {
      releaseRevocation = resolve;
    });
    const managed = createManagedProvisioningClient({
      baseUrl: "https://provision.example.com",
      fetcher: (async () => {
        reachedRevocation();
        await revocationGate;
        return new Response(JSON.stringify({ ok: true, confirmed: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    const { provider, store } = makeProvider(tmpRoot, disconnectHandlers(), managed);
    await provider.connectByBotToken(TOKEN, "managed");
    const authStore = getAuthStore(tmpRoot)!;

    const disconnect = provider.disconnect({
      actorEmail: "admin@test.com",
      authStore,
      instanceId: instanceIdentity(tmpRoot),
    });
    await revocationReached;
    const reconnect = provider.connectByBotToken(nextToken);
    releaseRevocation();
    await disconnect;
    await reconnect;

    expect(store.readToken()).toBe(nextToken);
  });
});

describe("repository isolation", () => {
  it("preserves another instance's bindings in a shared auth database, including the same chat", async () => {
    const rootA = mkdtempSync(join(tmpdir(), "repoos-tg-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "repoos-tg-b-"));
    try {
      const storeB = new AuthStore(rootB);
      const instanceB = instanceIdentity(rootB);
      storeB.upsertTelegramLink({
        telegramUserId: 99,
        email: "alice@test.com",
        telegramUsername: null,
        boundAt: new Date().toISOString(),
        boundBy: "admin@test.com",
        lastSeenAt: null,
        revokedAt: null,
      });
      bindTelegramChatDirect(storeB, {
        telegramChatId: -10099,
        chatType: "group",
        title: "Shared",
        actorEmail: "admin@test.com",
      });
      storeB.close();

      const dbA = join(rootA, ".repoos", "repoos.db");
      const dbB = join(rootB, ".repoos", "repoos.db");
      mkdirSync(join(rootA, ".repoos"), { recursive: true });
      copyFileSync(dbB, dbA);
      const instanceA = instanceIdentity(rootA);
      expect(instanceA).not.toBe(instanceB);
      const { provider: providerA, api } = makeProvider(rootA, disconnectHandlers());
      await providerA.connectByBotToken(TOKEN);

      const storeA = new AuthStore(rootA);
      expect(storeA.isAvailable() && storeB.isAvailable()).toBe(true);
      storeA.upsertUser("alice@test.com", "admin", null);
      storeA.upsertTelegramLink({
        telegramUserId: 99,
        email: "alice@test.com",
        telegramUsername: null,
        boundAt: new Date().toISOString(),
        boundBy: "admin@test.com",
        lastSeenAt: null,
        revokedAt: null,
      });
      bindTelegramChatDirect(storeA, {
        telegramChatId: -10099,
        chatType: "group",
        title: "Shared",
        actorEmail: "admin@test.com",
      });

      await expect(
        providerA.disconnect({
          actorEmail: "admin@test.com",
          authStore: storeA,
          instanceId: instanceA,
        }),
      ).rejects.toMatchObject({ phase: "revoke" });
      api.revokedTokens.add(TOKEN);
      await providerA.disconnect({
        actorEmail: "admin@test.com",
        authStore: storeA,
        instanceId: instanceA,
      });

      expect(storeA.listTelegramLinks()).toHaveLength(0);
      expect(storeA.listTelegramChatLinks()).toHaveLength(0);
      storeA.close();

      copyFileSync(dbA, dbB);
      const verifyB = new AuthStore(rootB);
      expect(verifyB.listTelegramLinks()).toHaveLength(1);
      expect(verifyB.getTelegramLink(99)?.instanceIdentity).toBe(instanceB);
      expect(verifyB.listTelegramChatLinks()).toHaveLength(1);
      expect(verifyB.getTelegramChatLink(-10099)?.instanceIdentity).toBe(instanceB);
      verifyB.close();
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });
});

describe("disconnect route", () => {
  it("performTelegramDisconnectRoute surfaces Telegram outage as retryable disconnect errors", async () => {
    resetAuthStoreInstance();
    const { provider } = makeProvider(tmpRoot, {
      getMe: botMe(),
      getWebhookInfo: () => ({ url: "" }),
      deleteWebhook: () => {
        throw new Error("fetch failed");
      },
    });
    await provider.connectByBotToken(TOKEN);
    const config = {
      root: tmpRoot,
      auth: { enabled: false },
      telegram: { enabled: true, provisioningUrl: "" },
    } as RepoOSConfig;
    await expect(
      performTelegramDisconnectRoute({ config }, "admin@test.com"),
    ).rejects.toMatchObject({ phase: "webhook", retryable: true });
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
  });
});

describe("corrupt credential recovery", () => {
  it("preserves a malformed connection file and reports incomplete disconnect", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(tmpRoot, ".repoos"), { recursive: true });
    writeFileSync(telegramConnectionPath(tmpRoot), '{"version":1,"bot":', "utf8");
    const { provider, api } = makeProvider(tmpRoot, {});
    const store = new AuthStore(tmpRoot);
    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: true });
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
    expect(api.calls).toHaveLength(0);
  });

  it("disconnect leaves local state intact when the stored credential cannot be decrypted", async () => {
    const { provider } = makeProvider(tmpRoot, disconnectHandlers());
    await provider.connectByBotToken(TOKEN);
    process.env.REPOOS_SECRET_STORE_KEY =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    const store = getAuthStore(tmpRoot)!;
    await expect(
      provider.disconnect({
        actorEmail: "admin@test.com",
        authStore: store,
        instanceId: instanceIdentity(tmpRoot),
      }),
    ).rejects.toMatchObject({ phase: "revoke", retryable: true });
    expect(existsSync(telegramConnectionPath(tmpRoot))).toBe(true);
  });
});
