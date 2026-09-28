/**
 * In-memory Telegram intake rate limits (#0534).
 *
 * Keys are scoped per Telegram user and per chat. Limits apply before live
 * authorization or invite redeem do SQLite work. Agent-bound traffic uses the
 * tighter pair, checked in the intake BEFORE the agent-chat handler (#0541)
 * can start any run — a refusal reaches that handler as
 * `{ agentLimited: true }` so the authorized user is told plainly instead of
 * the turn being dropped silently.
 *
 * These limiters are per-process only; multiple RepoOS processes do not share
 * counters (same limitation as OTP / Hub rate limits in `src/core/auth.ts`).
 */
import { RateLimiter } from "../../core/auth.js";

/** General intake: commands, callbacks, invite redeem attempts. */
const TELEGRAM_GENERAL_WINDOW_MS = 60_000;
const TELEGRAM_GENERAL_MAX_PER_USER = 60;
const TELEGRAM_GENERAL_MAX_PER_CHAT = 120;

/** Agent-bound plain text (non-command messages). */
const TELEGRAM_AGENT_WINDOW_MS = 60_000;
const TELEGRAM_AGENT_MAX_PER_USER = 10;
const TELEGRAM_AGENT_MAX_PER_CHAT = 20;

let generalByUser = new RateLimiter(TELEGRAM_GENERAL_WINDOW_MS, TELEGRAM_GENERAL_MAX_PER_USER);
let generalByChat = new RateLimiter(TELEGRAM_GENERAL_WINDOW_MS, TELEGRAM_GENERAL_MAX_PER_CHAT);
let agentByUser = new RateLimiter(TELEGRAM_AGENT_WINDOW_MS, TELEGRAM_AGENT_MAX_PER_USER);
let agentByChat = new RateLimiter(TELEGRAM_AGENT_WINDOW_MS, TELEGRAM_AGENT_MAX_PER_CHAT);

export function tryAcquireTelegramGeneralLimits(
  telegramUserId: number,
  chatId: number | null,
): boolean {
  if (!generalByUser.tryAcquire(`tg:user:${telegramUserId}`)) return false;
  if (chatId !== null && !generalByChat.tryAcquire(`tg:chat:${chatId}`)) return false;
  return true;
}

export function tryAcquireTelegramAgentLimits(
  telegramUserId: number,
  chatId: number | null,
): boolean {
  if (!agentByUser.tryAcquire(`tg:agent:user:${telegramUserId}`)) return false;
  if (chatId !== null && !agentByChat.tryAcquire(`tg:agent:chat:${chatId}`)) return false;
  return true;
}

/** Test seam — production counters are intentionally long-lived. */
export function resetTelegramRateLimitersForTests(): void {
  generalByUser = new RateLimiter(TELEGRAM_GENERAL_WINDOW_MS, TELEGRAM_GENERAL_MAX_PER_USER);
  generalByChat = new RateLimiter(TELEGRAM_GENERAL_WINDOW_MS, TELEGRAM_GENERAL_MAX_PER_CHAT);
  agentByUser = new RateLimiter(TELEGRAM_AGENT_WINDOW_MS, TELEGRAM_AGENT_MAX_PER_USER);
  agentByChat = new RateLimiter(TELEGRAM_AGENT_WINDOW_MS, TELEGRAM_AGENT_MAX_PER_CHAT);
}
