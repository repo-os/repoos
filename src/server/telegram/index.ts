/**
 * Per-repository Telegram provider singleton (#0531).
 *
 * Routes obtain the provider here so config-source and credentials follow the
 * same lifecycle as the rest of the server: one provider per repo root, built
 * lazily on first use, reading the live config through the repoos object the
 * caller already holds (Settings saves mutate it in place).
 *
 * Tests reset the map with `resetTelegramProviders` or inject collaborators
 * through `setTelegramProvider`.
 */
import type { RepoOSConfig } from "../../core/types.js";
import { projectDisplayName } from "../../core/config.js";
import { LocalTelegramProvider } from "./provider.js";
import { TelegramCredentialStore } from "./store.js";

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

export function resetTelegramProviders(): void {
  for (const provider of providers.values()) {
    // Fire-and-forget cleanup; tests only need state to be disposable.
    void provider.disconnect();
  }
  providers.clear();
}
