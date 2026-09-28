/**
 * Group intake trigger rules (#0535 / story #0003).
 *
 * With privacy mode enabled, the bot only receives commands addressed to it,
 * replies to its messages, and @mentions. Private chats are always in scope.
 */
import type { TelegramUpdate } from "./types.js";

function normalizeBotUsername(username: string | null | undefined): string | null {
  if (typeof username !== "string" || !username.trim()) return null;
  return username.replace(/^@/, "").trim().toLowerCase();
}

function rawMessage(update: TelegramUpdate): Record<string, unknown> | null {
  const raw = update.raw;
  if (!raw || typeof raw !== "object") return null;
  for (const key of ["message", "edited_message"]) {
    const msg = (raw as Record<string, unknown>)[key];
    if (msg && typeof msg === "object") return msg as Record<string, unknown>;
  }
  return null;
}

function textMentionsBot(text: string, botUsername: string): boolean {
  const needle = `@${botUsername}`;
  return text.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Whether an update should be processed in a group/supergroup. Private chats
 * always qualify. Channel posts are out of scope for command intake.
 */
export function isTelegramUpdateAddressedToBot(
  update: TelegramUpdate,
  bot: { id: number; username: string | null },
): boolean {
  const msg = update.message;
  if (!msg) {
    return update.kind === "callback_query";
  }

  if (msg.chatType === "private") return true;
  if (msg.chatType === "channel") return false;

  const botUsername = normalizeBotUsername(bot.username);

  if (msg.command !== null) {
    const text = msg.text ?? "";
    const match = text.match(/^\/[A-Za-z0-9_]{1,32}(?:@([A-Za-z0-9_]+))?/);
    const mention = match?.[1]?.toLowerCase() ?? null;
    if (mention && botUsername && mention !== botUsername) return false;
    return true;
  }

  const raw = rawMessage(update);
  const replyTo = raw?.reply_to_message as Record<string, unknown> | undefined;
  const replyFrom = replyTo?.from as Record<string, unknown> | undefined;
  if (replyFrom?.is_bot === true && replyFrom.id === bot.id) {
    return true;
  }

  if (botUsername && typeof msg.text === "string" && textMentionsBot(msg.text, botUsername)) {
    return true;
  }

  return false;
}
