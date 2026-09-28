/**
 * Telegram disconnect orchestration (#0539) — complete or loudly incomplete.
 */
import type { AuthStore } from "../../core/auth-store.js";
import {
  clearTelegramBindingsForRepository,
  logTelegramDisconnectAudit,
} from "../../core/telegram-disconnect.js";
import { TelegramApiClient, TelegramApiError, TelegramNetworkError } from "./api.js";
import { ManagedProvisioningUnavailableError } from "./provisioning.js";
import type { TelegramConnectionRecord } from "./store.js";
import type { BotSource, ManagedProvisioningClient } from "./types.js";
import { TelegramDisconnectError } from "./types.js";

export async function revokeProjectBotToken(input: {
  api: TelegramApiClient;
  oldToken: string;
  botId: number;
  source: BotSource;
  managed: ManagedProvisioningClient;
  repository: string;
  instanceId: string;
  createApi?: (token: string) => TelegramApiClient;
}): Promise<{ confirmed: boolean; method: string }> {
  const buildApi = input.createApi ?? ((token: string) => new TelegramApiClient(token));

  if (input.source === "managed" && input.managed.isConfigured()) {
    try {
      await input.managed.revokeBot({
        botId: input.botId,
        instanceId: input.instanceId,
        repository: input.repository,
      });
      return { confirmed: true, method: "managed-provisioning-service" };
    } catch (e) {
      if (e instanceof ManagedProvisioningUnavailableError) {
        throw new TelegramDisconnectError("revoke", e.message, !/HTTP 5\d\d/.test(e.message));
      }
      throw e;
    }
  }

  try {
    const replacement = await input.api.replaceManagedBotToken(input.botId);
    void replacement;
    const probe = buildApi(input.oldToken);
    try {
      await probe.getMe();
      return { confirmed: false, method: "replaceManagedBotToken" };
    } catch (e) {
      if (e instanceof TelegramApiError && e.code === 401) {
        return { confirmed: true, method: "replaceManagedBotToken" };
      }
      throw new TelegramDisconnectError("revoke", e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    if (!(e instanceof TelegramApiError) && !(e instanceof TelegramNetworkError)) {
      if (e instanceof TelegramDisconnectError) throw e;
    }
    if (input.source !== "byo-token") {
      const message =
        e instanceof Error ? e.message : "managed bot token could not be revoked at Telegram";
      throw new TelegramDisconnectError("revoke", message);
    }
  }

  try {
    await input.api.logOut();
    await input.api.close().catch(() => false);
    const info = await input.api.getWebhookInfo();
    if (info.url) {
      throw new TelegramDisconnectError(
        "revoke",
        "Telegram still has a webhook registered for this bot — retry disconnect",
      );
    }
    return { confirmed: true, method: "logOut+close" };
  } catch (e) {
    if (e instanceof TelegramDisconnectError) throw e;
    if (e instanceof TelegramNetworkError) {
      throw new TelegramDisconnectError("revoke", e.message);
    }
    throw new TelegramDisconnectError(
      "revoke",
      e instanceof Error ? e.message : "could not revoke BYO bot at Telegram",
    );
  }
}

export async function removeBotWebhook(api: TelegramApiClient): Promise<boolean> {
  await api.deleteWebhook(false);
  const info = await api.getWebhookInfo();
  return !info.url;
}

export function finalizeTelegramDisconnect(input: {
  authStore: AuthStore | null;
  actorEmail: string;
  instanceId: string;
  revokedAt: string;
  record: TelegramConnectionRecord | null;
  revocationConfirmed: boolean;
  revocationMethod: string | null;
  webhookRemoved: boolean;
  alreadyDisconnected: boolean;
  clearCredential: () => void;
}): { userLinks: number; chatLinks: number } {
  input.clearCredential();
  let userLinks = 0;
  let chatLinks = 0;
  if (input.authStore?.isAvailable()) {
    const cleared = clearTelegramBindingsForRepository(
      input.authStore,
      input.actorEmail,
      input.revokedAt,
      input.instanceId,
    );
    userLinks = cleared.userLinks;
    chatLinks = cleared.chatLinks;
    logTelegramDisconnectAudit(input.authStore, input.actorEmail, {
      alreadyDisconnected: input.alreadyDisconnected,
      revocationConfirmed: input.revocationConfirmed,
      revocationMethod: input.revocationMethod,
      webhookRemoved: input.webhookRemoved,
      botId: input.record?.bot.id ?? null,
      botSource: input.record?.bot.source ?? null,
      bindings: cleared,
    });
  }
  return { userLinks, chatLinks };
}
