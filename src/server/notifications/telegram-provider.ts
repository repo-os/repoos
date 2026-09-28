import {
  listTelegramNotificationChatIds,
  mayDeliverTelegramNotification,
} from "../../core/telegram-chat.js";
import { getTelegramProvider } from "../telegram/index.js";
import type {
  NotificationDispatchContext,
  NotificationPayload,
  NotificationProvider,
} from "./types.js";
import { formatNotification, specFromPayload } from "./format.js";

function telegramEnabled(ctx: NotificationDispatchContext): boolean {
  return ctx.config.telegram?.enabled === true;
}

function formatTelegramBody(payload: NotificationPayload): string {
  const line = formatNotification(specFromPayload(payload), payload.taskTitle);
  const meta = [payload.repositoryName, `#${payload.taskId}`, payload.status].join(" · ");
  const parts = [line, meta, payload.summary.trim()].filter(Boolean);
  if (payload.link.startsWith("http://") || payload.link.startsWith("https://")) {
    parts.push(payload.link);
  } else if (payload.link) {
    parts.push(`Open: ${payload.link}`);
  }
  return parts.join("\n");
}

function inlineKeyboard(payload: NotificationPayload): unknown | undefined {
  const action = payload.actions?.[0];
  const url = action?.url ?? payload.link;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return undefined;
  const label = action?.label ?? "Open task";
  return { inline_keyboard: [[{ text: label, url }]] };
}

export class TelegramNotificationProvider implements NotificationProvider {
  readonly id = "telegram";

  isEnabled(ctx: NotificationDispatchContext): boolean {
    if (!telegramEnabled(ctx)) return false;
    try {
      const status = getTelegramProvider(ctx.config).status();
      return status.connected;
    } catch {
      return false;
    }
  }

  deliver(ctx: NotificationDispatchContext, payload: NotificationPayload): void {
    if (!telegramEnabled(ctx)) return;
    const store = ctx.authStore;
    if (!store?.isAvailable()) return;

    let provider;
    try {
      provider = getTelegramProvider(ctx.config);
    } catch {
      return;
    }
    if (!provider.status().connected) return;

    const text = formatTelegramBody(payload);
    const replyMarkup = inlineKeyboard(payload);
    const chatIds = listTelegramNotificationChatIds(store).filter((id) =>
      mayDeliverTelegramNotification(store, id),
    );
    for (const chatId of chatIds) {
      void provider
        .sendMessage(chatId, text, {
          disableNotification: payload.severity === "background" || payload.severity === "low",
          replyMarkup,
        })
        .catch((err) => {
          console.error(`[telegram] Failed to send notification to chat ${chatId}:`, err);
        });
    }
  }
}
