/**
 * Telegram chat binding: approved destinations for bot traffic (ADR 0007).
 *
 * Chat binding records *where* the bot may communicate; it does not authorize
 * senders. Only an authenticated RepoOS admin can create bind codes or bind
 * a chat directly from Settings.
 */

import { createHmac as hmac } from "node:crypto";
import type { AuthStore, TelegramChatLink } from "./auth-store.js";
import { hashOtp, randomHex, timingSafeEqualStr } from "./auth.js";
import {
  instanceIdentity,
  repositoryIdentity,
  resolveTelegramSender,
  telegramInviteSecret,
} from "./telegram-identity.js";

export const TELEGRAM_CHAT_AUDIT = {
  bindCodeCreated: "telegram_chat_bind_code_created",
  chatBound: "telegram_chat_bound",
  chatUnbound: "telegram_chat_unbound",
} as const;

export const TELEGRAM_CHAT_BIND_NONCE_BYTES = 16;
export const TELEGRAM_CHAT_BIND_TTL_MS = 30 * 60 * 1000;

export type TelegramChatBindFailReason =
  | "expired"
  | "replay"
  | "invalid"
  | "identity_mismatch"
  | "not_admin";

export type RedeemTelegramChatBindResult =
  | { ok: true; telegramChatId: number }
  | { ok: false; reason: TelegramChatBindFailReason };

export interface TelegramChatBindContext {
  secret: string;
  repoIdentity: string;
  instanceIdentity: string;
  now?: Date;
}

export interface CreatedTelegramChatBindCode {
  code: string;
  expiresAt: string;
}

const NONCE_RE = /^[0-9a-f]+$/i;

function canonicalChatBindPayload(parts: {
  code: string;
  repoIdentity: string;
  instanceIdentity: string;
  expiresAt: string;
}): string {
  return ["chat-v1", parts.code, parts.repoIdentity, parts.instanceIdentity, parts.expiresAt].join(
    "\n",
  );
}

export function signTelegramChatBind(
  secret: string,
  parts: Parameters<typeof canonicalChatBindPayload>[0],
): string {
  return hmac("sha256", secret).update(canonicalChatBindPayload(parts)).digest("hex");
}

function isSafeChatId(id: number): boolean {
  return Number.isSafeInteger(id) && id !== 0;
}

/** Telegram chat ids are positive for private 1:1, negative for groups/channels. */
export function chatTypeMatchesTelegramChatId(chatId: number, chatType: string): boolean {
  const t = chatType.trim().toLowerCase();
  if (chatId > 0) return t === "private";
  if (chatId < 0) return t === "group" || t === "supergroup" || t === "channel";
  return false;
}

export function isTelegramChatBound(store: AuthStore, telegramChatId: number): boolean {
  if (!isSafeChatId(telegramChatId)) return false;
  const link = store.getTelegramChatLink(telegramChatId);
  return link !== null && !link.revokedAt;
}

/** Notification routing (#0537): only bound, non-revoked chats receive traffic. */
export function listTelegramNotificationChatIds(store: AuthStore): number[] {
  return store.listTelegramChatLinks().map((row) => row.telegramChatId);
}

export function mayDeliverTelegramNotification(store: AuthStore, telegramChatId: number): boolean {
  return isTelegramChatBound(store, telegramChatId);
}

export function createTelegramChatBindCode(
  store: AuthStore,
  ctx: TelegramChatBindContext,
  input: { createdBy: string; ttlMs?: number },
): CreatedTelegramChatBindCode | { error: "store" } {
  if (!store.isAvailable()) return { error: "store" };
  const now = ctx.now ?? new Date();
  const ttl = input.ttlMs ?? TELEGRAM_CHAT_BIND_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();
  const code = randomHex(TELEGRAM_CHAT_BIND_NONCE_BYTES);
  const mac = signTelegramChatBind(ctx.secret, {
    code,
    repoIdentity: ctx.repoIdentity,
    instanceIdentity: ctx.instanceIdentity,
    expiresAt,
  });
  const inserted = store.insertTelegramChatBindInvite({
    nonceHash: hashOtp(code),
    repoIdentity: ctx.repoIdentity,
    instanceIdentity: ctx.instanceIdentity,
    mac,
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    expiresAt,
    redeemedAt: null,
    redeemedChatId: null,
  });
  if (!inserted) return { error: "store" };
  store.logAudit(
    TELEGRAM_CHAT_AUDIT.bindCodeCreated,
    null,
    input.createdBy,
    JSON.stringify({ expiresAt, repoIdentity: ctx.repoIdentity }),
  );
  return { code, expiresAt };
}

export function bindTelegramChatDirect(
  store: AuthStore,
  input: {
    telegramChatId: number;
    chatType: string;
    title: string | null;
    actorEmail: string;
  },
): TelegramChatLink | null {
  if (!store.isAvailable() || !isSafeChatId(input.telegramChatId)) return null;
  if (!chatTypeMatchesTelegramChatId(input.telegramChatId, input.chatType)) return null;
  const existing = store.getTelegramChatLink(input.telegramChatId);
  if (existing && !existing.revokedAt && existing.chatType !== input.chatType) return null;
  const boundAt = new Date().toISOString();
  const link: TelegramChatLink = {
    telegramChatId: input.telegramChatId,
    chatType: input.chatType,
    title: input.title,
    boundAt,
    boundBy: input.actorEmail,
    revokedAt: null,
  };
  if (!store.upsertTelegramChatLink(link)) return null;
  store.logAudit(
    TELEGRAM_CHAT_AUDIT.chatBound,
    null,
    input.actorEmail,
    JSON.stringify({
      telegramChatId: input.telegramChatId,
      chatType: input.chatType,
      via: "settings",
    }),
  );
  return link;
}

/** Bind the 1:1 chat when an allowlisted user completes account linking. */
export function bindPrivateChatForLinkedUser(
  store: AuthStore,
  input: {
    telegramUserId: number;
    telegramChatId: number;
    chatType: string;
    boundBy: string;
  },
): void {
  if (input.chatType !== "private") return;
  if (input.telegramChatId !== input.telegramUserId) return;
  bindTelegramChatDirect(store, {
    telegramChatId: input.telegramChatId,
    chatType: "private",
    title: null,
    actorEmail: input.boundBy,
  });
}

export function redeemTelegramChatBindCode(
  store: AuthStore,
  ctx: TelegramChatBindContext,
  input: {
    code: string;
    redeemerTelegramUserId: number;
    telegramChatId: number;
    chatType: string;
    chatTitle: string | null;
  },
): RedeemTelegramChatBindResult {
  const code = input.code.trim().toLowerCase();
  if (
    !code ||
    code.length !== TELEGRAM_CHAT_BIND_NONCE_BYTES * 2 ||
    !NONCE_RE.test(code) ||
    !isSafeChatId(input.telegramChatId) ||
    !chatTypeMatchesTelegramChatId(input.telegramChatId, input.chatType)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const redeemer = resolveTelegramSender(store, input.redeemerTelegramUserId);
  if (!redeemer || redeemer.role !== "admin") {
    return { ok: false, reason: "not_admin" };
  }

  const now = ctx.now ?? new Date();
  try {
    return store.withImmediateTransaction(() => {
      const invite = store.getTelegramChatBindInviteByNonceHash(hashOtp(code));
      if (!invite) return { ok: false, reason: "invalid" } as const;

      const expectedMac = signTelegramChatBind(ctx.secret, {
        code,
        repoIdentity: invite.repoIdentity,
        instanceIdentity: invite.instanceIdentity,
        expiresAt: invite.expiresAt,
      });
      if (!timingSafeEqualStr(expectedMac, invite.mac)) {
        return { ok: false, reason: "invalid" } as const;
      }
      if (
        invite.repoIdentity !== ctx.repoIdentity ||
        invite.instanceIdentity !== ctx.instanceIdentity
      ) {
        return { ok: false, reason: "identity_mismatch" } as const;
      }
      if (invite.redeemedAt) return { ok: false, reason: "replay" } as const;
      if (invite.expiresAt <= now.toISOString()) return { ok: false, reason: "expired" } as const;

      const boundAt = now.toISOString();
      if (
        !store.markTelegramChatBindInviteRedeemed(invite.nonceHash, boundAt, input.telegramChatId)
      ) {
        return { ok: false, reason: "replay" } as const;
      }

      const existing = store.getTelegramChatLink(input.telegramChatId);
      if (existing && !existing.revokedAt && existing.chatType !== input.chatType) {
        throw new Error("telegram chat type mismatch");
      }

      if (
        !store.upsertTelegramChatLink({
          telegramChatId: input.telegramChatId,
          chatType: input.chatType,
          title: input.chatTitle,
          boundAt,
          boundBy: redeemer.email,
          revokedAt: null,
        })
      ) {
        throw new Error("telegram chat link write failed");
      }

      store.logAudit(
        TELEGRAM_CHAT_AUDIT.chatBound,
        null,
        redeemer.email,
        JSON.stringify({
          telegramChatId: input.telegramChatId,
          chatType: input.chatType,
          via: "bind_code",
          codeCreatedBy: invite.createdBy,
        }),
      );
      return { ok: true, telegramChatId: input.telegramChatId } as const;
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function unbindTelegramChat(
  store: AuthStore,
  telegramChatId: number,
  actorEmail: string,
): TelegramChatLink | null {
  const existing = store.getTelegramChatLink(telegramChatId);
  if (!existing || existing.revokedAt) return null;
  const revokedAt = new Date().toISOString();
  if (!store.revokeTelegramChatLink(telegramChatId, revokedAt)) return null;
  store.logAudit(
    TELEGRAM_CHAT_AUDIT.chatUnbound,
    null,
    actorEmail,
    JSON.stringify({ telegramChatId }),
  );
  return { ...existing, revokedAt };
}

export function listTelegramChatsForSettings(store: AuthStore): TelegramChatLink[] {
  return store.listTelegramChatLinks();
}

export function chatBindContextFromConfig(
  root: string,
  sessionSecret: string | undefined,
): TelegramChatBindContext | null {
  const secret = telegramInviteSecret(sessionSecret);
  if (!secret) return null;
  return {
    secret,
    repoIdentity: repositoryIdentity(root),
    instanceIdentity: instanceIdentity(root),
  };
}
