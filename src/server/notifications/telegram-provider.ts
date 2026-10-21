import {
  listTelegramNotificationChatIds,
  mayDeliverTelegramNotification,
} from "../../core/telegram-chat.js";
import { telegramInviteSecret } from "../../core/telegram-identity.js";
import { getTelegramProvider } from "../telegram/index.js";
import { telegramTaskActionMarkup } from "../telegram/task-actions.js";
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
  const summary = payload.summary.trim();
  const subtitle = payload.subtitle?.trim() ?? "";
  const parts = [line, meta];
  if (summary && summary !== subtitle && !line.includes(summary)) {
    parts.push(summary);
  }
  if (payload.link.startsWith("http://") || payload.link.startsWith("https://")) {
    parts.push(payload.link);
  } else if (payload.link) {
    parts.push(`Open: ${payload.link}`);
  }
  return parts.join("\n");
}

interface InlineRow {
  text: string;
  url?: string;
  callback_data?: string;
}

function inlineKeyboard(
  payload: NotificationPayload,
  config: NotificationDispatchContext["config"],
): unknown | undefined {
  const rows: InlineRow[][] = [];
  const action = payload.actions?.[0];
  const url = action?.url ?? payload.link;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const label = action?.label ?? "Open task";
    rows.push([{ text: label, url }]);
  }
  // #0543: an opportunity to act carries the admin buttons that apply. A
  // member may see them; pressing one is refused with a role explanation.
  const actions = telegramTaskActionMarkup(telegramInviteSecret(config.auth?.sessionSecret), {
    taskId: payload.taskId,
    status: payload.status,
    kind: payload.kind,
  });
  if (actions) rows.push(...actions.inline_keyboard);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
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
    const replyMarkup = inlineKeyboard(payload, ctx.config);
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
