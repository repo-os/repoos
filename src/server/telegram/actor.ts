/**
 * Telegram actor identity for downstream mutations (#0534).
 *
 * Web routes often record `getCurrentUser(...)?.email ?? "human"`, which is
 * wrong for Telegram: every bound sender has a real allowlisted email whether
 * or not session auth is enabled. Pass `TelegramActor` through Telegram
 * handlers and use `actorEmail()` for audit rows and task transitions.
 */
import type { AuthRole } from "../../core/auth.js";

export interface TelegramActor {
  email: string;
  role: AuthRole;
  telegramUserId: number;
}

/** Non-null actor email for audit and task metadata — never the `"human"` fallback. */
export function actorEmail(actor: TelegramActor): string {
  return actor.email;
}
