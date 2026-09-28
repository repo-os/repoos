/**
 * The manager bot's own outbound Telegram Bot API client. This is the ONLY
 * place the manager credential (`TELEGRAM_MANAGER_BOT_TOKEN`) is used —
 * everything else in this service works with repository/instance/admin
 * identity and the (separately encrypted, short-lived) project bot token a
 * `managed_bot` event and `getManagedBotToken` hand over.
 *
 * `getManagedBotToken` and the `managed_bot` update shape are Telegram's
 * "Managed Bots" feature (core.telegram.org/bots/features#managed-bots,
 * read 2026-09-28): a manager bot with Bot Management Mode enabled in
 * BotFather can create and administer other bots on behalf of users. The
 * exact JSON field names below (`managed_bot`, `bot`, `by_user`,
 * `managed_bot_id`) are this implementation's best-documented reading of
 * that feature; **verify them against Telegram's live Bot API reference
 * before the first production deploy** (the task explicitly permits
 * deferring this to implementation/deploy time rather than guessing further
 * in a sandbox with no live bot to test against). `normalizeManagedBotEvent`
 * is the single seam to update if the live shape differs — nothing else in
 * this service depends on the raw update shape.
 */
import { makeTokenRedactor } from "./crypto.js";
import type { BotFields } from "./store.js";

export type Fetcher = typeof fetch;

export interface ManagedBotEvent {
  botId: number;
  botUsername: string;
  botDisplayName: string;
  canReadAllGroupMessages: boolean | null;
  creatorTelegramUserId: number;
}

export interface TelegramManagerClient {
  /** Retrieves the project bot's token. Assumed callable once per bot per
   * the "Managed Bots" feature; the service treats it as idempotent (a
   * second call for the same already-consumed bot is only ever attempted
   * within this service's own grace-window replay, never re-issued to
   * Telegram after a successful first fetch — see service.ts). */
  getManagedBotToken(botId: number): Promise<string>;
  sendMessage(chatId: number, text: string): Promise<void>;
  setWebhook(url: string, secretToken: string): Promise<void>;
  /** Extracts a `managed_bot` event from a raw webhook update, or null for
   * any other update kind. */
  normalizeManagedBotEvent(raw: Record<string, unknown>): ManagedBotEvent | null;
  /** Extracts a private-chat `/link <code>` command, or null. */
  normalizeLinkCommand(raw: Record<string, unknown>): {
    code: string;
    telegramUserId: number;
    telegramUsername: string | null;
    chatId: number;
  } | null;
}

class HttpTelegramManagerClient implements TelegramManagerClient {
  private readonly redact: (text: string) => string;

  constructor(
    private readonly token: string,
    private readonly apiBase: string,
    private readonly fetcher: Fetcher,
  ) {
    this.redact = makeTokenRedactor(token);
  }

  private async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.apiBase}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      throw new Error(`Telegram API unreachable calling ${method}: ${this.redact(raw)}`);
    }
    const payload = (await response.json().catch(() => null)) as {
      ok: boolean;
      result?: unknown;
      description?: string;
    } | null;
    if (!payload || payload.ok !== true) {
      const detail = payload?.description ?? `HTTP ${response.status}`;
      throw new Error(`Telegram API ${method} failed: ${this.redact(detail)}`);
    }
    return payload.result;
  }

  async getManagedBotToken(botId: number): Promise<string> {
    const result = (await this.call("getManagedBotToken", { managed_bot_id: botId })) as {
      token?: unknown;
    } | null;
    const token = typeof result?.token === "string" ? result.token : null;
    if (!token) throw new Error("Telegram API getManagedBotToken returned no token");
    return token;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text });
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "managed_bot"],
    });
  }

  normalizeManagedBotEvent(raw: Record<string, unknown>): ManagedBotEvent | null {
    const managed = raw.managed_bot as Record<string, unknown> | undefined;
    if (!managed || typeof managed !== "object") return null;
    const bot = managed.bot as Record<string, unknown> | undefined;
    const by = (managed.by_user ?? managed.creator ?? managed.user) as
      | Record<string, unknown>
      | undefined;
    const botId = typeof bot?.id === "number" ? bot.id : null;
    const creatorId = typeof by?.id === "number" ? by.id : null;
    if (botId === null || creatorId === null) return null;
    const username = typeof bot?.username === "string" ? bot.username.replace(/^@/, "") : "";
    const firstName = typeof bot?.first_name === "string" ? bot.first_name : "";
    const lastName = typeof bot?.last_name === "string" ? ` ${bot.last_name}` : "";
    return {
      botId,
      botUsername: username,
      botDisplayName: (firstName + lastName).trim() || username || String(botId),
      canReadAllGroupMessages:
        typeof bot?.can_read_all_group_messages === "boolean"
          ? bot.can_read_all_group_messages
          : null,
      creatorTelegramUserId: creatorId,
    };
  }

  normalizeLinkCommand(raw: Record<string, unknown>): {
    code: string;
    telegramUserId: number;
    telegramUsername: string | null;
    chatId: number;
  } | null {
    const message = raw.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object") return null;
    const chat = message.chat as Record<string, unknown> | undefined;
    if (chat?.type !== "private") return null;
    const from = message.from as Record<string, unknown> | undefined;
    const text = typeof message.text === "string" ? message.text.trim() : "";
    const match = /^\/link(?:@\w+)?\s+([A-Za-z0-9]+)$/.exec(text);
    if (!match) return null;
    const telegramUserId = typeof from?.id === "number" ? from.id : null;
    const chatId = typeof chat?.id === "number" ? chat.id : null;
    if (telegramUserId === null || chatId === null) return null;
    return {
      code: match[1]!.toUpperCase(),
      telegramUserId,
      telegramUsername: typeof from?.username === "string" ? from.username : null,
      chatId,
    };
  }
}

export function createTelegramManagerClient(
  token: string,
  apiBase: string,
  fetcher: Fetcher = fetch,
): TelegramManagerClient {
  return new HttpTelegramManagerClient(token, apiBase, fetcher);
}

/** For assembling the encrypted bot-summary fields stored on a request. */
export function botFieldsFromEvent(event: ManagedBotEvent): BotFields {
  return {
    id: event.botId,
    username: event.botUsername,
    displayName: event.botDisplayName,
    canReadAllGroupMessages: event.canReadAllGroupMessages,
  };
}
