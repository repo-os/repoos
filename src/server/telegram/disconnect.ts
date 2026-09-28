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

const BYO_REVOKE_BOTFATHER_HINT =
  "the bot token is still valid at Telegram — revoke it in @BotFather, then retry disconnect";

async function probeOldTokenRevoked(
  buildApi: (token: string) => TelegramApiClient,
  oldToken: string,
  method: string,
): Promise<{ confirmed: boolean; method: string }> {
  const probe = buildApi(oldToken);
  try {
    await probe.getMe();
    return { confirmed: false, method };
  } catch (e) {
    if (e instanceof TelegramApiError && e.code === 401) {
      return { confirmed: true, method };
    }
    throw new TelegramDisconnectError("revoke", e instanceof Error ? e.message : String(e));
  }
}

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

  if (input.source === "managed") {
    if (!input.managed.isConfigured()) {
      throw new TelegramDisconnectError(
        "revoke",
        "managed bot disconnect requires the provisioning service (set [telegram] provisioningUrl) " +
          "to revoke the bot at Telegram",
        false,
      );
    }
    try {
      await input.managed.revokeBot({
        botId: input.botId,
        instanceId: input.instanceId,
        repository: input.repository,
      });
      return { confirmed: true, method: "managed-provisioning-service" };
    } catch (e) {
      if (e instanceof ManagedProvisioningUnavailableError) {
        const retryable = /HTTP 5\d\d/.test(e.message);
        throw new TelegramDisconnectError("revoke", e.message, retryable);
      }
      throw e;
    }
  }

  // BYO: logOut stops cloud delivery; only a 401 on the old token counts as revoked.
  try {
    await input.api.logOut();
    await input.api.close().catch(() => false);
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

  const probe = await probeOldTokenRevoked(buildApi, input.oldToken, "logOut+close");
  if (!probe.confirmed) {
    throw new TelegramDisconnectError("revoke", BYO_REVOKE_BOTFATHER_HINT, true);
  }
  return probe;
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
  let userLinks = 0;
  let chatLinks = 0;
  if (input.authStore?.isAvailable()) {
    try {
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
    } catch (e) {
      throw new TelegramDisconnectError(
        "local",
        e instanceof Error ? e.message : "failed to clear Telegram bindings",
        true,
      );
    }
  }
  input.clearCredential();
  return { userLinks, chatLinks };
}
