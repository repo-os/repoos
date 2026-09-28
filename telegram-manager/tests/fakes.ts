/**
 * Fake `TelegramManagerClient` — scripted responses, no network. Mirrors the
 * `fakeProvisioningService` fixture in `src/ui-app/tests/telegram-routes.test.ts`
 * on the other side of the boundary.
 */
import type { ManagedBotEvent, TelegramManagerClient } from "../src/telegram-client.js";

export class FakeTelegramManagerClient implements TelegramManagerClient {
  tokensByBotId = new Map<number, string>();
  tokenFailures = new Set<number>();
  sentMessages: { chatId: number; text: string }[] = [];
  getTokenCallCount = 0;

  async getManagedBotToken(botId: number): Promise<string> {
    this.getTokenCallCount++;
    if (this.tokenFailures.has(botId))
      throw new Error("Telegram API getManagedBotToken failed: down");
    const token = this.tokensByBotId.get(botId);
    if (!token) throw new Error("Telegram API getManagedBotToken returned no token");
    return token;
  }

  async replaceManagedBotToken(botId: number): Promise<string> {
    const token = this.tokensByBotId.get(botId);
    if (!token) throw new Error("Telegram API replaceManagedBotToken returned no token");
    const rotated = `${token}-rotated`;
    this.tokensByBotId.set(botId, rotated);
    return rotated;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    this.sentMessages.push({ chatId, text });
  }

  async setWebhook(): Promise<void> {}

  normalizeManagedBotEvent(raw: Record<string, unknown>): ManagedBotEvent | null {
    const managed = raw.managed_bot as
      | { bot?: { id?: number; username?: string; first_name?: string }; by_user?: { id?: number } }
      | undefined;
    if (!managed?.bot?.id || !managed.by_user?.id) return null;
    return {
      botId: managed.bot.id,
      botUsername: managed.bot.username ?? "",
      botDisplayName: managed.bot.first_name ?? managed.bot.username ?? String(managed.bot.id),
      canReadAllGroupMessages: null,
      creatorTelegramUserId: managed.by_user.id,
    };
  }

  normalizeLinkCommand(raw: Record<string, unknown>): {
    code: string;
    telegramUserId: number;
    telegramUsername: string | null;
    chatId: number;
  } | null {
    const message = raw.message as
      | {
          chat?: { type?: string; id?: number };
          from?: { id?: number; username?: string };
          text?: string;
        }
      | undefined;
    if (!message || message.chat?.type !== "private") return null;
    const match = /^\/link\s+([A-Za-z0-9]+)$/.exec(message.text ?? "");
    if (!match || !message.from?.id || !message.chat.id) return null;
    return {
      code: match[1]!.toUpperCase(),
      telegramUserId: message.from.id,
      telegramUsername: message.from.username ?? null,
      chatId: message.chat.id,
    };
  }
}

export function linkMessage(chatId: number, userId: number, code: string): Record<string, unknown> {
  return {
    update_id: 1000 + chatId,
    message: {
      chat: { id: chatId, type: "private" },
      from: { id: userId, username: "admin" },
      text: `/link ${code}`,
    },
  };
}

export function managedBotUpdate(
  updateId: number,
  creatorUserId: number,
  bot: { id: number; username: string; firstName: string },
): Record<string, unknown> {
  return {
    update_id: updateId,
    managed_bot: {
      bot: { id: bot.id, username: bot.username, first_name: bot.firstName },
      by_user: { id: creatorUserId },
    },
  };
}
