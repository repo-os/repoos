/**
 * Repository-scoped Telegram teardown helpers (#0539).
 *
 * Auth rows live in this repository's `.repoos/repoos.db` only — clearing
 * bindings here never reaches another checkout's database.
 */

import type { AuthStore } from "./auth-store.js";
import { TELEGRAM_AUDIT } from "./telegram-identity.js";
import { TELEGRAM_CHAT_AUDIT } from "./telegram-chat.js";

export const TELEGRAM_DISCONNECT_AUDIT = {
  integrationDisconnected: "telegram_integration_disconnected",
} as const;

export interface ClearedTelegramBindings {
  userLinks: number;
  chatLinks: number;
  userInvites: number;
  chatBindInvites: number;
}

/** Revoke every active user and chat binding for this repository instance. */
export function clearTelegramBindingsForRepository(
  store: AuthStore,
  actorEmail: string,
  revokedAt: string,
  instanceIdentity: string,
): ClearedTelegramBindings {
  if (!store.isAvailable()) {
    throw new Error("auth store is not available");
  }
  const userLinks = store.revokeAllActiveTelegramUserLinks(revokedAt);
  const chatLinks = store.revokeAllActiveTelegramChatLinks(revokedAt);
  const userInvites = store.deleteTelegramUserInvitesForInstance(instanceIdentity);
  const chatBindInvites = store.deleteTelegramChatBindInvitesForInstance(instanceIdentity);

  if (userLinks > 0) {
    store.logAudit(
      TELEGRAM_AUDIT.userUnbound,
      null,
      actorEmail,
      JSON.stringify({ bulk: true, count: userLinks, reason: "telegram_disconnect" }),
    );
  }
  if (chatLinks > 0) {
    store.logAudit(
      TELEGRAM_CHAT_AUDIT.chatUnbound,
      null,
      actorEmail,
      JSON.stringify({ bulk: true, count: chatLinks, reason: "telegram_disconnect" }),
    );
  }

  return { userLinks, chatLinks, userInvites, chatBindInvites };
}

export function logTelegramDisconnectAudit(
  store: AuthStore,
  actorEmail: string,
  details: Record<string, unknown>,
): void {
  store.logAuditRequired(
    TELEGRAM_DISCONNECT_AUDIT.integrationDisconnected,
    null,
    actorEmail,
    JSON.stringify(details),
  );
}
