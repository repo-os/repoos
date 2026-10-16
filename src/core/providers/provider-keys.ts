/**
 * Read model-provider API keys from env, config snapshot, or harness auth (#0676).
 * Keys are never logged from call sites.
 */
import type { RepoOSConfig } from "../types.js";
import type { ModelProviderRow } from "./spend.js";
import {
  readProviderKeyFromHarness,
  type HarnessAuthStore,
} from "./harness-auth.js";

/**
 * The stored key for a live row, read through process.env FIRST so a save
 * (which updates process.env in place, see `setDotEnvSecret`) is visible
 * immediately, then the boot-time config snapshot, then the coding agents' own
 * auth stores — a key that only lives in pi/opencode's login store is still a
 * key this install can spend against. Empty string when unset.
 */
export function readProviderKey(
  config: RepoOSConfig,
  row: ModelProviderRow,
  harnessStores?: HarnessAuthStore[],
): string {
  const fromEnv = row.envVar ? process.env[row.envVar] : undefined;
  if (fromEnv) return fromEnv;
  if (row.configKey) {
    const fromConfig = config.modelProviders?.[row.configKey];
    if (fromConfig) return fromConfig;
  }
  return readProviderKeyFromHarness(row.id, harnessStores);
}
