/**
 * Telegram per-message authorization, rate limits, and audit (#0534).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStore, getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import {
  TELEGRAM_AUDIT,
  createTelegramInvite,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  resolveTelegramSender,
  type TelegramInviteContext,
} from "../../core/telegram-identity.js";
import { actorEmail } from "../../server/telegram/actor.js";
import { createTelegramIntakeHandler } from "../../server/telegram/intake.js";
import {
  resetTelegramRateLimitersForTests,
  tryAcquireTelegramAgentLimits,
  tryAcquireTelegramGeneralLimits,
} from "../../server/telegram/rate-limits.js";
import type { TelegramUpdate } from "../../server/telegram/types.js";

const SECRET = "intake-test-session-secret";
let tmpDir: string;
let store: AuthStore;
let ctx: TelegramInviteContext;

function messageUpdate(
  partial: Partial<TelegramUpdate["message"]> & { senderId: number; chatId: number },
): TelegramUpdate {
  return {
    updateId: 1,
    kind: "message",
    receivedAt: new Date().toISOString(),
    raw: {},
    message: {
      messageId: 1,
      chatType: "private",
      chatTitle: null,
      senderUsername: null,
      senderIsBot: false,
      text: null,
      date: 0,
      command: null,
      commandArgs: [],
      ...partial,
    },
  };
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `repoos-tg-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  resetTelegramRateLimitersForTests();
  store = getAuthStore(tmpDir)!;
  ctx = {
    secret: SECRET,
    repoIdentity: repositoryIdentity(tmpDir),
    instanceIdentity: instanceIdentity(tmpDir),
    now: new Date("2026-01-15T12:00:00.000Z"),
  };
});

afterEach(() => {
  store.close();
  resetAuthStoreInstance();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function allow(email: string, role: "admin" | "member" = "member"): void {
  store.upsertUser(email, role, "admin@test.com");
}

function bindUser(email: string, telegramUserId: number): void {
  allow(email);
  const created = createTelegramInvite(store, ctx, { email, createdBy: "admin@test.com" });
  if ("error" in created) throw new Error("invite");
  redeemTelegramInvite(store, ctx, { nonce: created.nonce, telegramUserId });
  bindTelegramChatDirect(store, {
    telegramChatId: telegramUserId,
    chatType: "private",
    title: null,
    actorEmail: "admin@test.com",
  });
}

function bindChat(chatId: number, chatType: "private" | "supergroup" = "private"): void {
  bindTelegramChatDirect(store, {
    telegramChatId: chatId,
    chatType,
    title: null,
    actorEmail: "admin@test.com",
  });
}

const INVITE_NOW = (): Date => new Date("2026-01-15T12:00:00.000Z");

function intakeOptions(
  extra?: Partial<Parameters<typeof createTelegramIntakeHandler>[0]>,
): Parameters<typeof createTelegramIntakeHandler>[0] {
  return {
    root: tmpDir,
    authSessionSecret: SECRET,
    enabled: () => true,
    now: INVITE_NOW,
    ...extra,
  };
}

describe("createTelegramIntakeHandler", () => {
  it("silently drops unbound senders without calling downstream", async () => {
    const onAuthorized = vi.fn();
    const handler = createTelegramIntakeHandler(intakeOptions({ onAuthorized }));
    await handler(
      messageUpdate({
        senderId: 999,
        chatId: 1,
        text: "hello",
      }),
    );
    expect(onAuthorized).not.toHaveBeenCalled();
  });

  it("resolves live role and passes TelegramActor with a real email", async () => {
    bindUser("alice@test.com", 42);
    bindChat(7);
    const onAuthorized = vi.fn();
    const handler = createTelegramIntakeHandler(intakeOptions({ onAuthorized }));
    await handler(
      messageUpdate({
        senderId: 42,
        chatId: 7,
        text: "/help",
        command: "help",
        commandArgs: [],
      }),
    );
    expect(onAuthorized).toHaveBeenCalledTimes(1);
    const actor = onAuthorized.mock.calls[0][1];
    expect(actorEmail(actor)).toBe("alice@test.com");
    expect(actor.role).toBe("member");
    const audit = store.getAuditLog(5).find((e) => e.action === TELEGRAM_AUDIT.commandInvoked);
    expect(audit?.actorEmail).toBe("alice@test.com");
  });

  it("makes demotion effective on the next message", async () => {
    bindUser("alice@test.com", 55);
    store.upsertUser("alice@test.com", "member", "admin@test.com");
    expect(resolveTelegramSender(store, 55)?.role).toBe("member");
    store.deleteUser("alice@test.com");
    expect(resolveTelegramSender(store, 55)).toBeNull();

    const onAuthorized = vi.fn();
    const handler = createTelegramIntakeHandler(intakeOptions({ onAuthorized }));
    await handler(messageUpdate({ senderId: 55, chatId: 55, text: "hi" }));
    expect(onAuthorized).not.toHaveBeenCalled();
  });

  it("redeems /start invite for an unbound user without downstream", async () => {
    allow("bob@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "bob@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    const onAuthorized = vi.fn();
    const handler = createTelegramIntakeHandler(intakeOptions({ onAuthorized }));
    await handler(
      messageUpdate({
        senderId: 8080,
        chatId: 8080,
        text: `/start ${created.nonce}`,
        command: "start",
        commandArgs: [created.nonce],
      }),
    );
    expect(onAuthorized).not.toHaveBeenCalled();
    expect(resolveTelegramSender(store, 8080)?.email).toBe("bob@test.com");
  });

  it("audits agent-bound plain text and enforces the tighter agent limit", async () => {
    bindUser("carol@test.com", 3);
    bindChat(99);
    const handler = createTelegramIntakeHandler(intakeOptions());
    for (let i = 0; i < 10; i++) {
      await handler(
        messageUpdate({
          senderId: 3,
          chatId: 99,
          text: `question ${i}`,
        }),
      );
    }
    expect(
      store.getAuditLog(20).filter((e) => e.action === TELEGRAM_AUDIT.agentMessage).length,
    ).toBe(10);

    await handler(messageUpdate({ senderId: 3, chatId: 99, text: "one more" }));
    expect(
      store.getAuditLog(25).filter((e) => e.action === TELEGRAM_AUDIT.agentMessage).length,
    ).toBe(10);
  });

  it("does nothing when the integration master switch is off", async () => {
    bindUser("dave@test.com", 4);
    const onAuthorized = vi.fn();
    const handler = createTelegramIntakeHandler(
      intakeOptions({ enabled: () => false, onAuthorized }),
    );
    await handler(messageUpdate({ senderId: 4, chatId: 4, text: "hi" }));
    expect(onAuthorized).not.toHaveBeenCalled();
  });
});

describe("tryAcquireTelegramGeneralLimits", () => {
  it("caps per-user traffic before authorization work", () => {
    const userId = 12345;
    const chatId = 67890;
    for (let i = 0; i < 60; i++) {
      expect(tryAcquireTelegramGeneralLimits(userId, chatId)).toBe(true);
    }
    expect(tryAcquireTelegramGeneralLimits(userId, chatId)).toBe(false);
  });
});

describe("tryAcquireTelegramAgentLimits", () => {
  it("allows fewer agent-bound messages than general intake", () => {
    const userId = 1;
    const chatId = 2;
    for (let i = 0; i < 10; i++) {
      expect(tryAcquireTelegramAgentLimits(userId, chatId)).toBe(true);
    }
    expect(tryAcquireTelegramAgentLimits(userId, chatId)).toBe(false);
  });
});
