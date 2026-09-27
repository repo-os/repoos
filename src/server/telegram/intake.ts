/**
 * Per-message Telegram authorization, rate limits, and audit (#0534).
 *
 * Sits on `TelegramProvider.onUpdate`: every normalized update passes through
 * here before later tasks (commands, agent chat, notifications). ADR 0007
 * rules enforced here:
 *
 *  - Live role from `auth_users` via `resolveTelegramSender` (never cached).
 *  - Unbound/unauthorized senders: silent no-op — no outbound Telegram traffic.
 *  - `/start <invite>` redeem for not-yet-bound users (rate-limited, silent).
 *  - Privileged intake audited with `TELEGRAM_AUDIT` action names.
 */
import type { RepoOSConfig } from "../../core/types.js";
import { getAuthStore } from "../../core/auth-store.js";
import {
  TELEGRAM_AUDIT,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  resolveTelegramSender,
  telegramInviteSecret,
} from "../../core/telegram-identity.js";
import type { TelegramActor } from "./actor.js";
import { tryAcquireTelegramAgentLimits, tryAcquireTelegramGeneralLimits } from "./rate-limits.js";
import type { TelegramUpdate, TelegramUpdateHandler } from "./types.js";

export type TelegramAuthorizedHandler = (
  update: TelegramUpdate,
  actor: TelegramActor,
) => void | Promise<void>;

export interface TelegramIntakeOptions {
  root: string;
  authSessionSecret?: string;
  /** When false, intake is a no-op (matches the polling master switch). */
  enabled?: () => boolean;
  /** Test seam; production uses the real clock for invite expiry. */
  now?: () => Date;
  /** Later tasks: commands, agent runner, etc. */
  onAuthorized?: TelegramAuthorizedHandler;
}

function telegramUserIdFromUpdate(update: TelegramUpdate): number | null {
  if (update.message?.senderId != null) return update.message.senderId;
  if (update.callbackQuery?.fromUserId != null) return update.callbackQuery.fromUserId;
  return null;
}

function chatIdFromUpdate(update: TelegramUpdate): number | null {
  if (update.message?.chatId != null) return update.message.chatId;
  const rawMsg = update.raw?.callback_query as Record<string, unknown> | undefined;
  const msg = rawMsg?.message as Record<string, unknown> | undefined;
  const chat = msg?.chat as Record<string, unknown> | undefined;
  const chatId = chat?.id;
  return typeof chatId === "number" && Number.isFinite(chatId) ? chatId : null;
}

function isAgentBoundMessage(update: TelegramUpdate): boolean {
  const msg = update.message;
  if (!msg || msg.senderIsBot) return false;
  if (msg.command !== null) return false;
  return typeof msg.text === "string" && msg.text.trim().length > 0;
}

function isStartInviteRedeem(update: TelegramUpdate): string | null {
  const msg = update.message;
  if (!msg || msg.senderIsBot) return null;
  if (msg.command !== "start") return null;
  const nonce = msg.commandArgs[0]?.trim().toLowerCase();
  return nonce ? nonce : null;
}

function auditCommand(
  store: NonNullable<ReturnType<typeof getAuthStore>>,
  actor: TelegramActor,
  update: TelegramUpdate,
): void {
  const command = update.message?.command ?? null;
  if (!command || command === "start") return;
  store.logAudit(
    TELEGRAM_AUDIT.commandInvoked,
    actor.email,
    actor.email,
    JSON.stringify({
      command,
      chatId: update.message?.chatId ?? chatIdFromUpdate(update),
      updateKind: update.kind,
    }),
  );
}

function auditAgentMessage(
  store: NonNullable<ReturnType<typeof getAuthStore>>,
  actor: TelegramActor,
  update: TelegramUpdate,
): void {
  store.logAudit(
    TELEGRAM_AUDIT.agentMessage,
    actor.email,
    actor.email,
    JSON.stringify({
      chatId: update.message?.chatId ?? null,
      chatType: update.message?.chatType ?? null,
    }),
  );
}

async function tryRedeemStartInvite(
  store: NonNullable<ReturnType<typeof getAuthStore>>,
  options: TelegramIntakeOptions,
  telegramUserId: number,
  nonce: string,
  telegramUsername: string | null,
): Promise<void> {
  const secret = telegramInviteSecret(options.authSessionSecret);
  if (!secret) return;
  redeemTelegramInvite(
    store,
    {
      secret,
      repoIdentity: repositoryIdentity(options.root),
      instanceIdentity: instanceIdentity(options.root),
      ...(options.now ? { now: options.now() } : {}),
    },
    {
      nonce,
      telegramUserId,
      telegramUsername,
    },
  );
  // All outcomes are silent toward Telegram (ADR 0007); audit on success is
  // recorded inside redeemTelegramInvite (`telegram_user_bound`).
}

export function createTelegramIntakeHandler(options: TelegramIntakeOptions): TelegramUpdateHandler {
  const enabled = options.enabled ?? (() => true);
  return async (update: TelegramUpdate) => {
    if (!enabled()) return;

    const telegramUserId = telegramUserIdFromUpdate(update);
    if (telegramUserId === null) return;

    const chatId = chatIdFromUpdate(update);
    if (!tryAcquireTelegramGeneralLimits(telegramUserId, chatId)) return;

    const store = getAuthStore(options.root);
    if (!store?.isAvailable()) return;

    const inviteNonce = isStartInviteRedeem(update);
    if (inviteNonce) {
      await tryRedeemStartInvite(
        store,
        options,
        telegramUserId,
        inviteNonce,
        update.message?.senderUsername ?? null,
      );
      return;
    }

    const resolved = resolveTelegramSender(store, telegramUserId);
    if (!resolved) return;

    const actor: TelegramActor = {
      email: resolved.email,
      role: resolved.role,
      telegramUserId,
    };

    if (isAgentBoundMessage(update)) {
      if (!tryAcquireTelegramAgentLimits(telegramUserId, chatId)) return;
      auditAgentMessage(store, actor, update);
    } else if (update.callbackQuery) {
      store.logAudit(
        TELEGRAM_AUDIT.commandInvoked,
        actor.email,
        actor.email,
        JSON.stringify({
          command: "callback_query",
          chatId,
          data: update.callbackQuery.data,
        }),
      );
    } else {
      auditCommand(store, actor, update);
    }

    if (options.onAuthorized) {
      await options.onAuthorized(update, actor);
    }
  };
}

export function telegramIntakeOptionsFromConfig(
  config: Pick<RepoOSConfig, "root" | "auth" | "telegram">,
  extra?: Pick<TelegramIntakeOptions, "onAuthorized">,
): TelegramIntakeOptions {
  return {
    root: config.root,
    authSessionSecret: config.auth?.sessionSecret,
    enabled: () => config.telegram?.enabled === true,
    ...extra,
  };
}
