/**
 * Telegram chat binding (#0535): admin-only bind, routing, group triggers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStore, getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import {
  TELEGRAM_CHAT_AUDIT,
  bindTelegramChatDirect,
  createTelegramChatBindCode,
  isTelegramChatBound,
  mayDeliverTelegramNotification,
  redeemTelegramChatBindCode,
  unbindTelegramChat,
  type TelegramChatBindContext,
} from "../../core/telegram-chat.js";
import {
  createTelegramInvite,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  type TelegramInviteContext,
} from "../../core/telegram-identity.js";
import { createTelegramIntakeHandler } from "../../server/telegram/intake.js";
import { isTelegramUpdateAddressedToBot } from "../../server/telegram/group-addressing.js";
import { resetTelegramRateLimitersForTests } from "../../server/telegram/rate-limits.js";
import type { TelegramUpdate } from "../../server/telegram/types.js";

const SECRET = "chat-bind-test-secret";
let tmpDir: string;
let store: AuthStore;
let chatCtx: TelegramChatBindContext;
let userCtx: TelegramInviteContext;

function messageUpdate(
  partial: Partial<TelegramUpdate["message"]> & { senderId: number; chatId: number },
  rawExtra?: Record<string, unknown>,
): TelegramUpdate {
  return {
    updateId: 1,
    kind: "message",
    receivedAt: new Date().toISOString(),
    raw: { message: rawExtra ?? {} },
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
  tmpDir = join(tmpdir(), `repoos-tg-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  resetTelegramRateLimitersForTests();
  store = getAuthStore(tmpDir)!;
  chatCtx = {
    secret: SECRET,
    repoIdentity: repositoryIdentity(tmpDir),
    instanceIdentity: instanceIdentity(tmpDir),
    now: new Date("2026-01-15T12:00:00.000Z"),
  };
  userCtx = {
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

function linkTelegramUser(
  email: string,
  telegramUserId: number,
  role: "admin" | "member" = "member",
): void {
  allow(email, role);
  const created = createTelegramInvite(store, userCtx, { email, createdBy: "admin@test.com" });
  if ("error" in created) throw new Error("invite");
  redeemTelegramInvite(store, userCtx, { nonce: created.nonce, telegramUserId });
}

function linkAdminOnTelegram(telegramUserId: number, email = "admin@test.com"): void {
  linkTelegramUser(email, telegramUserId, "admin");
}

function intake(extra?: Partial<Parameters<typeof createTelegramIntakeHandler>[0]>) {
  return createTelegramIntakeHandler({
    root: tmpDir,
    authSessionSecret: SECRET,
    enabled: () => true,
    now: () => new Date("2026-01-15T12:00:00.000Z"),
    resolveBot: () => ({ id: 9001, username: "RepoBot" }),
    ...extra,
  });
}

describe("createTelegramChatBindCode", () => {
  it("requires an admin-created code before a chat can bind", () => {
    linkAdminOnTelegram(1);
    const created = createTelegramChatBindCode(store, chatCtx, {
      createdBy: "admin@test.com",
    });
    expect("error" in created).toBe(false);
    if ("error" in created) return;

    const groupId = -100555;
    expect(isTelegramChatBound(store, groupId)).toBe(false);
    const redeemed = redeemTelegramChatBindCode(store, chatCtx, {
      code: created.code,
      redeemerTelegramUserId: 1,
      telegramChatId: groupId,
      chatType: "supergroup",
      chatTitle: "Ops",
    });
    expect(redeemed).toEqual({ ok: true, telegramChatId: groupId });
    expect(isTelegramChatBound(store, groupId)).toBe(true);
    const boundAudit = store
      .getAuditLog(10)
      .find((e) => e.action === TELEGRAM_CHAT_AUDIT.chatBound);
    expect(boundAudit?.actorEmail).toBe("admin@test.com");
  });

  it("refuses bind-code redemption by a non-admin even with the code", () => {
    linkTelegramUser("member@test.com", 50);
    const created = createTelegramChatBindCode(store, chatCtx, {
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("code");
    const stolenPrivate = 50;
    const result = redeemTelegramChatBindCode(store, chatCtx, {
      code: created.code,
      redeemerTelegramUserId: 50,
      telegramChatId: stolenPrivate,
      chatType: "private",
      chatTitle: null,
    });
    expect(result).toEqual({ ok: false, reason: "not_admin" });
    expect(isTelegramChatBound(store, stolenPrivate)).toBe(false);
  });
});

describe("mayDeliverTelegramNotification", () => {
  it("never delivers to a chat the bot was merely added to", async () => {
    const attackerChat = -100999;
    const handler = intake();
    await handler({
      updateId: 2,
      kind: "my_chat_member",
      receivedAt: new Date().toISOString(),
      raw: {
        my_chat_member: {
          chat: { id: attackerChat, type: "supergroup" },
          new_chat_member: { user: { id: 9001, is_bot: true } },
        },
      },
    });
    expect(isTelegramChatBound(store, attackerChat)).toBe(false);
    expect(mayDeliverTelegramNotification(store, attackerChat)).toBe(false);
  });
});

describe("createTelegramIntakeHandler chat routing", () => {
  it("authorizes only allowlisted senders in a bound group", async () => {
    allow("alice@test.com");
    allow("bob@test.com");
    const groupId = -100200;
    bindTelegramChatDirect(store, {
      telegramChatId: groupId,
      chatType: "supergroup",
      title: "Team",
      actorEmail: "admin@test.com",
    });
    const createdAlice = createTelegramInvite(store, userCtx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    const createdBob = createTelegramInvite(store, userCtx, {
      email: "bob@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in createdAlice || "error" in createdBob) throw new Error("invite");
    redeemTelegramInvite(store, userCtx, { nonce: createdAlice.nonce, telegramUserId: 10 });
    redeemTelegramInvite(store, userCtx, { nonce: createdBob.nonce, telegramUserId: 20 });
    allow("charlie@test.com");
    const createdCharlie = createTelegramInvite(store, userCtx, {
      email: "charlie@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in createdCharlie) throw new Error("invite");
    redeemTelegramInvite(store, userCtx, {
      nonce: createdCharlie.nonce,
      telegramUserId: 30,
    });
    store.deleteUser("charlie@test.com");

    const onAuthorized = vi.fn();
    const handler = intake({ onAuthorized });

    await handler(
      messageUpdate({
        senderId: 30,
        chatId: groupId,
        chatType: "supergroup",
        text: "/status@RepoBot",
        command: "status",
        commandArgs: [],
      }),
    );
    expect(onAuthorized).not.toHaveBeenCalled();

    await handler(
      messageUpdate({
        senderId: 10,
        chatId: groupId,
        chatType: "supergroup",
        text: "/status@RepoBot",
        command: "status",
        commandArgs: [],
      }),
    );
    expect(onAuthorized).toHaveBeenCalledTimes(1);
  });

  it("authorizes the same user in a private chat and a bound group", async () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, userCtx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, userCtx, { nonce: created.nonce, telegramUserId: 42 });
    bindTelegramChatDirect(store, {
      telegramChatId: 42,
      chatType: "private",
      title: null,
      actorEmail: "admin@test.com",
    });
    bindTelegramChatDirect(store, {
      telegramChatId: -10042,
      chatType: "supergroup",
      title: "Guild",
      actorEmail: "admin@test.com",
    });

    const onAuthorized = vi.fn();
    const handler = intake({ onAuthorized });

    await handler(
      messageUpdate({
        senderId: 42,
        chatId: 42,
        chatType: "private",
        text: "hi",
      }),
    );
    await handler(
      messageUpdate({
        senderId: 42,
        chatId: -10042,
        chatType: "supergroup",
        text: "/help@RepoBot",
        command: "help",
        commandArgs: [],
      }),
    );
    expect(onAuthorized).toHaveBeenCalledTimes(2);
  });

  it("binds a private chat when the user completes /start linking", async () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, userCtx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    const handler = intake();
    await handler(
      messageUpdate({
        senderId: 77,
        chatId: 77,
        chatType: "private",
        text: `/start ${created.nonce}`,
        command: "start",
        commandArgs: [created.nonce],
      }),
    );
    expect(isTelegramChatBound(store, 77)).toBe(true);
  });
});

describe("isTelegramUpdateAddressedToBot", () => {
  const bot = { id: 9001, username: "RepoBot" };

  it("ignores bare group commands not addressed to this bot", () => {
    const update = messageUpdate({
      senderId: 1,
      chatId: -1,
      chatType: "supergroup",
      text: "/status",
      command: "status",
      commandArgs: [],
    });
    expect(isTelegramUpdateAddressedToBot(update, bot)).toBe(true);
    const otherBot = messageUpdate({
      senderId: 1,
      chatId: -1,
      chatType: "supergroup",
      text: "/status@OtherBot",
      command: "status",
      commandArgs: [],
    });
    expect(isTelegramUpdateAddressedToBot(otherBot, bot)).toBe(false);
  });

  it("accepts replies to the bot and @mentions", () => {
    const reply = messageUpdate(
      {
        senderId: 1,
        chatId: -1,
        chatType: "supergroup",
        text: "thanks",
      },
      {
        reply_to_message: { from: { id: 9001, is_bot: true } },
      },
    );
    expect(isTelegramUpdateAddressedToBot(reply, bot)).toBe(true);

    const mention = messageUpdate({
      senderId: 1,
      chatId: -1,
      chatType: "supergroup",
      text: "hey @RepoBot what is up",
    });
    expect(isTelegramUpdateAddressedToBot(mention, bot)).toBe(true);
  });
});

describe("unbindTelegramChat", () => {
  it("stops notification routing after unbind", () => {
    bindTelegramChatDirect(store, {
      telegramChatId: 5,
      chatType: "private",
      title: null,
      actorEmail: "admin@test.com",
    });
    expect(mayDeliverTelegramNotification(store, 5)).toBe(true);
    unbindTelegramChat(store, 5, "admin@test.com");
    expect(mayDeliverTelegramNotification(store, 5)).toBe(false);
  });
});
