/**
 * Per-repository Telegram provider singleton (#0531).
 *
 * Routes obtain the provider here so config-source and credentials follow the
 * same lifecycle as the rest of the server: one provider per repo root, built
 * lazily on first use, reading the live config through the repoos object the
 * caller already holds (Settings saves mutate it in place).
 *
 * Tests reset the map with `resetTelegramProviders` or inject collaborators
 * through `setTelegramProvider`. Resetting only stops running transports —
 * it deliberately never deletes a stored connection, so a test-only helper
 * cannot become destructive if reused in production cleanup.
 */
import type { RepoOSConfig } from "../../core/types.js";
import { projectDisplayName } from "../../core/config.js";
import type { TelegramAuthorizedHandler } from "./intake.js";
import { LocalTelegramProvider } from "./provider.js";
import { TelegramCredentialStore } from "./store.js";
import { createTelegramIntakeHandler, telegramIntakeOptionsFromConfig } from "./intake.js";

/** The adapter's live config view — everything it needs from RepoOSConfig. */
export interface TelegramRuntimeConfig {
  enabled: boolean;
  provisioningUrl: string;
  provisioningKey?: string;
}

export function telegramRuntimeConfig(
  config: Pick<RepoOSConfig, "root"> & { telegram?: RepoOSConfig["telegram"] },
): TelegramRuntimeConfig {
  return {
    enabled: config.telegram?.enabled === true,
    provisioningUrl: config.telegram?.provisioningUrl ?? "",
    provisioningKey: process.env.REPOOS_TELEGRAM_PROVISIONING_KEY || undefined,
  };
}

const providers = new Map<string, LocalTelegramProvider>();

function providerKey(root: string): string {
  // One provider per canonical checkout; symlinks/relative paths in tests
  // normalize through this exact string, so different roots stay separate.
  return root;
}

export function getTelegramProvider(
  config: Pick<RepoOSConfig, "root"> & { telegram?: RepoOSConfig["telegram"] },
): LocalTelegramProvider {
  const key = providerKey(config.root);
  const existing = providers.get(key);
  if (existing) return existing;
  const provider = new LocalTelegramProvider({
    resolveConfig: () => telegramRuntimeConfig(config),
    root: config.root,
    repositoryName: projectDisplayName(config.root),
    store: new TelegramCredentialStore(config.root),
  });
  providers.set(key, provider);
  return provider;
}

export function setTelegramProvider(root: string, provider: LocalTelegramProvider): void {
  providers.set(providerKey(root), provider);
}

/**
 * Stop every provider's polling loop and drop the singletons, keeping stored
 * connection state on disk. The server teardown/dispose path and tests both
 * use this; deleting credentials was `disconnect()`'s job and stays there.
 */
export function resetTelegramProviders(): void {
  for (const provider of providers.values()) {
    // Fire-and-forget cleanup; tests only need state to be disposable. The
    // polling loop aborts its in-flight getUpdates promptly (see polling.ts).
    void provider.stopPolling();
  }
  providers.clear();
}

/**
 * Boot-time transport resume (#0531, review round 1): a restart used to leave
 * the stored `transport.mode = "polling"` with no loop behind it — a silently
 * dead transport. After the server binds, this reads the connection record
 * and (re)starts the long-poll loop when the stored transport is polling and
 * the credential is readable. The loop itself gates on the live
 * `telegram.enabled` switch, so an integration that is currently disabled
 * stays paused with no Telegram traffic and resumes live when it is enabled.
 *
 * Never throws; every outcome is reported for the server log and mirrored
 * into `status().lastError` where it is an error.
 */
export async function resumeTelegramTransports(
  config: Pick<RepoOSConfig, "root"> & { telegram?: RepoOSConfig["telegram"] },
): Promise<{ resumed: boolean; detail?: string }> {
  const provider = getTelegramProvider(config);
  try {
    return await provider.resumeTransport();
  } catch (e) {
    const detail =
      e instanceof Error ? e.message : `telegram transport resume failed: ${String(e)}`;
    return { resumed: false, detail };
  }
}

/**
 * Register the authorization intake handler and resume polling when configured
 * (#0534). Call after `resetTelegramProviders()` on reload so the new provider
 * singleton receives the handler.
 */
export async function bootstrapTelegramAtBoot(
  config: Pick<RepoOSConfig, "root" | "auth" | "telegram">,
  // #0541: the authorized-update sink lives server-side (it needs the
  // AgentRunner and live index), so the server builds it and hands it here.
  options: { onAuthorized?: TelegramAuthorizedHandler } = {},
): Promise<{ resumed: boolean; detail?: string }> {
  const provider = getTelegramProvider(config);
  provider.onUpdate(
    createTelegramIntakeHandler(
      telegramIntakeOptionsFromConfig(config, {
        resolveBot: () => {
          const status = provider.status();
          if (!status.connected || !status.bot) return null;
          return { id: status.bot.id, username: status.bot.username };
        },
        ...(options.onAuthorized ? { onAuthorized: options.onAuthorized } : {}),
      }),
    ),
  );
  return resumeTelegramTransports(config);
}
