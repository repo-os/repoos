/**
 * Storage-provider registry (#0658).
 *
 * Providers are registered as factories keyed by a stable id, because the two
 * attachment bases (`work/.attachments/` and `inputs/.attachments/`) each need
 * their own provider instance rooted at a different directory. A later slice
 * (#0660, Neon) registers a `"neon"` factory here and #0659 picks it by config;
 * today the local provider is the only entry and always the fallback, so
 * behavior is unchanged.
 */
import { localStorageProvider } from "./local.js";
import type { StorageProvider } from "./types.js";

/** Builds a provider instance rooted at one base directory (absolute path). */
export type StorageProviderFactory = (baseDir: string) => StorageProvider;

const factories = new Map<string, StorageProviderFactory>();

/** The provider every repo uses until another is configured (#0660/#0659). */
export const DEFAULT_STORAGE_PROVIDER_ID = "local";

/** Register or replace a provider factory under a stable id. */
export function registerStorageProvider(id: string, factory: StorageProviderFactory): void {
  factories.set(id, factory);
}

/**
 * Remove a provider factory. The default local provider cannot be removed —
 * it is the reference implementation and the always-available fallback.
 * Returns true when a factory was actually removed.
 */
export function unregisterStorageProvider(id: string): boolean {
  if (id === DEFAULT_STORAGE_PROVIDER_ID) return false;
  return factories.delete(id);
}

/** The factory registered for `id`, or null when nothing is registered. */
export function getStorageProviderFactory(id: string): StorageProviderFactory | null {
  return factories.get(id) ?? null;
}

/** Ids of every registered provider, default first then the rest alphabetically. */
export function listStorageProviderIds(): string[] {
  return [...factories.keys()].sort((a, b) =>
    a === DEFAULT_STORAGE_PROVIDER_ID
      ? -1
      : b === DEFAULT_STORAGE_PROVIDER_ID
        ? 1
        : a.localeCompare(b),
  );
}

/**
 * Instantiate the provider `id` rooted at `baseDir`. An unknown id falls back
 * to the local provider — the reference implementation is always available, so
 * a misconfigured/absent cloud provider degrades to today's behavior rather
 * than failing (surfaced as "unavailable-but-explained" by #0659's UI).
 */
export function createStorageProvider(
  baseDir: string,
  id: string = DEFAULT_STORAGE_PROVIDER_ID,
): StorageProvider {
  return (factories.get(id) ?? factories.get(DEFAULT_STORAGE_PROVIDER_ID)!)!(baseDir);
}

// The local provider is the reference implementation and is always registered.
registerStorageProvider(DEFAULT_STORAGE_PROVIDER_ID, localStorageProvider);
