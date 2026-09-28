/**
 * Telegram user binding: numeric Telegram IDs map to allowlisted emails.
 *
 * Authorization never reads a Telegram username. Role is always looked up
 * live from auth_users (ADR 0007). The webhook /start handler (#0532) calls
 * redeemTelegramInvite; this module does not talk to Telegram itself.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac as hmac } from "node:crypto";
import type { AuthRole } from "./auth.js";
import { hashOtp, isValidEmail, randomHex, timingSafeEqualStr } from "./auth.js";
import type { AuthStore, TelegramUserLink } from "./auth-store.js";
import { projectDisplayName } from "./config.js";

/** Reuse these strings from every Telegram audit call site (#0534 included). */
export const TELEGRAM_AUDIT = {
  inviteCreated: "telegram_invite_created",
  userBound: "telegram_user_bound",
  userUnbound: "telegram_user_unbound",
  userReassigned: "telegram_user_reassigned",
  /** Authorized slash command after live role check (not /start invite redeem). */
  commandInvoked: "telegram_command_invoked",
  /** An agent turn actually STARTED on the agent path (#0541). */
  agentMessage: "telegram_agent_message",
  /** An agent turn was refused before any run (reason in details; #0541). */
  agentTurnRefused: "telegram_agent_turn_refused",
  /** A Telegram follow-up was accepted and sent to a task's agent (#0542). */
  agentFollowUp: "telegram_agent_follow_up",
  /** A Telegram follow-up was refused by role or never reached an agent (#0542). */
  agentFollowUpRefused: "telegram_agent_follow_up_refused",
} as const;

/** Telegram Bot API start-parameter limit. Hex nonce is 32 chars. */
export const TELEGRAM_START_PAYLOAD_MAX = 64;
export const TELEGRAM_INVITE_NONCE_BYTES = 16;
export const TELEGRAM_INVITE_TTL_MS = 30 * 60 * 1000;

export type TelegramInviteFailReason =
  | "not_allowlisted"
  | "expired"
  | "replay"
  | "invalid"
  | "already_bound"
  | "identity_mismatch";

export type RedeemTelegramInviteResult =
  | { ok: true; email: string; role: AuthRole }
  | { ok: false; reason: TelegramInviteFailReason };

export interface TelegramInviteContext {
  secret: string;
  repoIdentity: string;
  instanceIdentity: string;
  now?: Date;
}

export interface CreatedTelegramInvite {
  nonce: string;
  email: string;
  expiresAt: string;
  deepLink: string | null;
}

export interface ResolvedTelegramSender {
  email: string;
  role: AuthRole;
}

const NONCE_RE = /^[0-9a-f]+$/i;

function canonicalInvitePayload(parts: {
  nonce: string;
  email: string;
  repoIdentity: string;
  instanceIdentity: string;
  expiresAt: string;
}): string {
  return [
    "v1",
    parts.nonce,
    parts.email,
    parts.repoIdentity,
    parts.instanceIdentity,
    parts.expiresAt,
  ].join("\n");
}

export function signTelegramInvite(
  secret: string,
  parts: Parameters<typeof canonicalInvitePayload>[0],
): string {
  return hmac("sha256", secret).update(canonicalInvitePayload(parts)).digest("hex");
}

export function telegramInviteSecret(sessionSecret: string | undefined): string | null {
  const secret = sessionSecret?.trim() ?? "";
  return secret.length > 0 ? secret : null;
}

export function repositoryIdentity(repoRoot: string): string {
  return projectDisplayName(repoRoot);
}

/** Stable per-checkout id, persisted under `.repoos/instance-id`. */
export function instanceIdentity(repoRoot: string): string {
  const cacheDir = join(repoRoot, ".repoos");
  const path = join(cacheDir, "instance-id");
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* create below */
  }
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const id = randomHex(16);
  try {
    writeFileSync(path, `${id}\n`, { encoding: "utf8", flag: "wx" });
    return id;
  } catch {
    const raced = readFileSync(path, "utf8").trim();
    return raced || id;
  }
}

export function telegramDeepLink(
  botUsername: string | null | undefined,
  nonce: string,
): string | null {
  const bot = botUsername?.replace(/^@/, "").trim() ?? "";
  if (!bot) return null;
  return `https://t.me/${bot}?start=${nonce}`;
}

function normalizeUsername(username: string | null | undefined): string | null {
  if (typeof username !== "string") return null;
  const trimmed = username.replace(/^@/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSafeTelegramUserId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

export function createTelegramInvite(
  store: AuthStore,
  ctx: TelegramInviteContext,
  input: { email: string; createdBy: string; botUsername?: string | null; ttlMs?: number },
): CreatedTelegramInvite | { error: "not_allowlisted" | "invalid_email" | "store" } {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "invalid_email" };
  if (!store.isAvailable()) return { error: "store" };
  if (!store.getUser(email)) return { error: "not_allowlisted" };

  const now = ctx.now ?? new Date();
  const ttl = input.ttlMs ?? TELEGRAM_INVITE_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();
  const nonce = randomHex(TELEGRAM_INVITE_NONCE_BYTES);
  const mac = signTelegramInvite(ctx.secret, {
    nonce,
    email,
    repoIdentity: ctx.repoIdentity,
    instanceIdentity: ctx.instanceIdentity,
    expiresAt,
  });
  const inserted = store.insertTelegramInvite({
    nonceHash: hashOtp(nonce),
    email,
    repoIdentity: ctx.repoIdentity,
    instanceIdentity: ctx.instanceIdentity,
    mac,
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    expiresAt,
    redeemedAt: null,
  });
  if (!inserted) return { error: "store" };

  store.logAudit(
    TELEGRAM_AUDIT.inviteCreated,
    email,
    input.createdBy,
    JSON.stringify({ expiresAt, repoIdentity: ctx.repoIdentity }),
  );

  return {
    nonce,
    email,
    expiresAt,
    deepLink: telegramDeepLink(input.botUsername ?? null, nonce),
  };
}

export function redeemTelegramInvite(
  store: AuthStore,
  ctx: TelegramInviteContext,
  input: { nonce: string; telegramUserId: number; telegramUsername?: string | null },
): RedeemTelegramInviteResult {
  const nonce = input.nonce.trim().toLowerCase();
  if (
    !nonce ||
    nonce.length > TELEGRAM_START_PAYLOAD_MAX ||
    nonce.length !== TELEGRAM_INVITE_NONCE_BYTES * 2 ||
    !NONCE_RE.test(nonce)
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (!isSafeTelegramUserId(input.telegramUserId)) {
    return { ok: false, reason: "invalid" };
  }

  const now = ctx.now ?? new Date();
  // Must not run inside another SQLite transaction (withImmediateTransaction
  // cannot nest). Call this from the /start handler, not from a wrapping txn.
  try {
    return store.withImmediateTransaction(() => {
      const invite = store.getTelegramInviteByNonceHash(hashOtp(nonce));
      if (!invite) return { ok: false, reason: "invalid" } as const;

      const expectedMac = signTelegramInvite(ctx.secret, {
        nonce,
        email: invite.email,
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

      const user = store.getUser(invite.email);
      if (!user) return { ok: false, reason: "not_allowlisted" } as const;

      const existing = store.getTelegramLink(input.telegramUserId);
      if (existing && !existing.revokedAt && existing.email !== invite.email) {
        return { ok: false, reason: "already_bound" } as const;
      }

      const boundAt = now.toISOString();
      if (!store.markTelegramInviteRedeemed(invite.nonceHash, boundAt)) {
        return { ok: false, reason: "replay" } as const;
      }

      if (
        !store.upsertTelegramLink({
          telegramUserId: input.telegramUserId,
          email: invite.email,
          telegramUsername: normalizeUsername(input.telegramUsername),
          boundAt,
          boundBy: invite.createdBy,
          lastSeenAt: boundAt,
          revokedAt: null,
        })
      ) {
        // Roll the invite redemption back with the transaction.
        throw new Error("telegram link write failed");
      }
      store.logAudit(
        TELEGRAM_AUDIT.userBound,
        invite.email,
        invite.createdBy,
        JSON.stringify({ telegramUserId: input.telegramUserId }),
      );
      return { ok: true, email: user.email, role: user.role } as const;
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * Live authorization lookup: telegram_user_id → link → auth_users.role now.
 * Username is not an input. A missing allowlist row makes the link inert.
 */
export function resolveTelegramSender(
  store: AuthStore,
  telegramUserId: number,
): ResolvedTelegramSender | null {
  if (!isSafeTelegramUserId(telegramUserId)) return null;
  const link = store.getTelegramLink(telegramUserId);
  if (!link || link.revokedAt) return null;
  const user = store.getUser(link.email);
  if (!user) return null;
  store.touchTelegramLinkSeen(telegramUserId, new Date().toISOString());
  return { email: user.email, role: user.role };
}

export function unbindTelegramUser(
  store: AuthStore,
  telegramUserId: number,
  actorEmail: string,
): TelegramUserLink | null {
  const existing = store.getTelegramLink(telegramUserId);
  if (!existing || existing.revokedAt) return null;
  const revokedAt = new Date().toISOString();
  if (!store.revokeTelegramLink(telegramUserId, revokedAt)) return null;
  store.logAudit(
    TELEGRAM_AUDIT.userUnbound,
    existing.email,
    actorEmail,
    JSON.stringify({ telegramUserId }),
  );
  return { ...existing, revokedAt };
}

export function reassignTelegramUser(
  store: AuthStore,
  input: { telegramUserId: number; email: string; actorEmail: string },
):
  | { ok: true; email: string }
  | { error: "not_found" | "not_allowlisted" | "invalid_email" | "store" } {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "invalid_email" };
  if (!store.isAvailable()) return { error: "store" };
  if (!store.getUser(email)) return { error: "not_allowlisted" };
  const existing = store.getTelegramLink(input.telegramUserId);
  if (!existing || existing.revokedAt) return { error: "not_found" };

  const now = new Date().toISOString();
  if (
    !store.upsertTelegramLink({
      ...existing,
      email,
      boundAt: now,
      boundBy: input.actorEmail,
      lastSeenAt: now,
      revokedAt: null,
    })
  ) {
    return { error: "store" };
  }
  store.logAudit(
    TELEGRAM_AUDIT.userReassigned,
    email,
    input.actorEmail,
    JSON.stringify({ telegramUserId: input.telegramUserId, fromEmail: existing.email }),
  );
  return { ok: true, email };
}

export function listTelegramLinksForSettings(
  store: AuthStore,
): Array<TelegramUserLink & { role: AuthRole | null; allowlisted: boolean }> {
  return store.listTelegramLinks().map((link) => {
    const user = store.getUser(link.email);
    return {
      ...link,
      role: user?.role ?? null,
      allowlisted: user !== null,
    };
  });
}
