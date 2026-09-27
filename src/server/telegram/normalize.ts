/**
 * Update normalization shared by both update transports (#0531).
 *
 * The webhook receiver (#0532) and the long-polling loop feed the *same*
 * `normalizeUpdate` function, so a change of transport cannot change what the
 * intake/authorization pipeline sees. Normalization is total: it never throws
 * on a payload it does not understand — unsupported or malformed updates come
 * back as `null` and the caller drops them.
 *
 * Normalization mines transport facts only (ids, chat, sender, text, parsed
 * command). It performs no authorization: ADR 0007 resolves the sender's
 * identity downstream, and while no intake handler is registered an update is
 * dropped without any observable effect.
 */
import type {
  TelegramCallbackQuery,
  TelegramChatType,
  TelegramMessage,
  TelegramUpdate,
  TelegramUpdateKind,
} from "./types.js";
/** Telegram date fields are unix seconds; guard against absence. */
function unixSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asId(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parse a `/command` — optional `@bot` suffix, then space-separated args.
 * Non-command text yields {command: null, args: []}.
 */
export function parseCommandText(text: string | null): { command: string | null; args: string[] } {
  if (!text || !text.startsWith("/")) return { command: null, args: [] };
  const match = text.match(/^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!match) return { command: null, args: [] };
  const args = (match[3] ?? "").trim().length ? match[3].trim().split(/\s+/) : [];
  return { command: match[1].toLowerCase(), args };
}

/** Normalize a Bot API `Message`; null for anything without the required ids. */
export function normalizeMessage(raw: unknown): TelegramMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const messageId = asId(m.message_id);
  const chat = (m.chat ?? null) as Record<string, unknown> | null;
  const chatId = asId(chat?.id);
  if (messageId === null || chatId === null) return null;
  const chatType = (chat?.type ?? "private") as TelegramChatType;
  const sender = (m.from ?? null) as Record<string, unknown> | null;
  const senderId = asId(sender?.id);
  const senderUsername =
    typeof sender?.username === "string" && sender.username ? sender.username : null;
  const text =
    typeof m.text === "string" && m.text
      ? m.text
      : typeof m.caption === "string"
        ? m.caption
        : null;
  const { command, args } = parseCommandText(text);
  return {
    messageId,
    chatId,
    chatType,
    chatTitle: typeof chat?.title === "string" && chat.title ? chat.title : null,
    senderId,
    senderUsername,
    senderIsBot: sender?.is_bot === true,
    text,
    date: unixSeconds(m.date),
    command,
    commandArgs: args,
  };
}

function normalizeCallbackQuery(raw: unknown): TelegramCallbackQuery | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const id = typeof q.id === "string" ? q.id : null;
  const from = (q.from ?? null) as Record<string, unknown> | null;
  const fromUserId = asId(from?.id);
  if (!id || fromUserId === null) return null;
  return {
    id,
    fromUserId,
    fromUsername: typeof from?.username === "string" && from.username ? from.username : null,
    data: typeof q.data === "string" ? q.data : null,
  };
}

const MESSAGE_KINDS: readonly { key: string; kind: TelegramUpdateKind }[] = [
  { key: "message", kind: "message" },
  { key: "edited_message", kind: "edited_message" },
  { key: "channel_post", kind: "channel_post" },
  { key: "edited_channel_post", kind: "edited_channel_post" },
];

/**
 * Normalize one serialized Telegram update. Returns null for a payload that
 * is not a recognizable update (callers must treat null as "drop"): a missing
 * update_id cannot be acknowledged, and Telegram semantics require re-delivery
 * until an offset past it is confirmed.
 */
export function normalizeUpdate(
  raw: unknown,
  receivedAt: string = new Date().toISOString(),
): TelegramUpdate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.update_id !== "number" || !Number.isFinite(u.update_id)) return null;

  let kind: TelegramUpdateKind = "other";
  let message: TelegramMessage | undefined;
  let callbackQuery: TelegramCallbackQuery | undefined;

  for (const { key, kind: messageKind } of MESSAGE_KINDS) {
    if (u[key] !== undefined) {
      kind = messageKind;
      const normalized = normalizeMessage(u[key]);
      if (normalized) message = normalized;
      break;
    }
  }
  if (!message && u.callback_query !== undefined) {
    kind = "callback_query";
    callbackQuery = normalizeCallbackQuery(u.callback_query) ?? undefined;
  } else if (!message && u.my_chat_member !== undefined) {
    kind = "my_chat_member";
  } else if (!message && !callbackQuery && Object.keys(u).length > 1) {
    // A single optional field is guaranteed by the Bot API ("at most one of
    // the optional fields"); anything unmapped is future surface — keep the
    // updateId and raw payload, classify as "other", and never act on it.
    kind = "other";
  }

  const update: TelegramUpdate = {
    updateId: u.update_id as number,
    kind,
    raw: u,
    receivedAt,
  };
  if (message) update.message = message;
  if (callbackQuery) update.callbackQuery = callbackQuery;
  return update;
}
