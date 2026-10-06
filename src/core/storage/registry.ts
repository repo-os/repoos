/**
 * Storage-provider registry (#0658).
 *
 * Providers are registered as factories keyed by a stable id, because the two
 * attachment bases (`work/.attachments/` and `inputs/.attachments/`) each need
 * their own provider instance rooted at a different directory. A later slice
 * (#0660, Neon) registers a `"neon"` factory here and #0659 picks it by config;
 * the local provider is the only entry today and always the fallback, so
 * behavior is unchanged for anyone who never configures a provider.
 */
import { localStorageProvider } from "./local.js";
import type { StorageProvider, StorageProviderStatus } from "./types.js";

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
 * Instantiate the provider `id` rooted at `baseDir`. An unknown id — or a
 * registered id whose provider reports itself unavailable (#0659, e.g. a cloud
 * backend with no credentials yet) — falls back to the local provider. The
 * reference implementation is always available, so a misconfigured/absent cloud
 * provider degrades to today's behavior rather than failing or silently writing
 * bytes somewhere the user did not choose.
 */
export function createStorageProvider(
  baseDir: string,
  id: string = DEFAULT_STORAGE_PROVIDER_ID,
): StorageProvider {
  return resolveStorageProvider(baseDir, id).provider;
}

/**
 * Resolve the provider actually in effect for `id` rooted at `baseDir`, with
 * the honest status the UI needs (#0659). Returns the configured id, the
 * effective provider instance and its id, and a human-readable `reason` when
 * they differ (the configured provider is unknown or reports itself
 * unavailable). `local` is always available; another id is available only when
 * its factory is registered and — if it exposes a `status()` — reports
 * configured.
 */
export function resolveStorageProvider(
  baseDir: string,
  id: string = DEFAULT_STORAGE_PROVIDER_ID,
): {
  configured: string;
  effective: string;
  available: boolean;
  reason: string;
  provider: StorageProvider;
} {
  const localFactory = factories.get(DEFAULT_STORAGE_PROVIDER_ID)!;
  if (id === DEFAULT_STORAGE_PROVIDER_ID) {
    return {
      configured: id,
      effective: DEFAULT_STORAGE_PROVIDER_ID,
      available: true,
      reason: "",
      provider: localFactory(baseDir),
    };
  }

  const factory = factories.get(id);
  if (!factory) {
    return {
      configured: id,
      effective: DEFAULT_STORAGE_PROVIDER_ID,
      available: false,
      reason: `No storage provider named "${id}" is available.`,
      provider: localFactory(baseDir),
    };
  }

  let provider: StorageProvider;
  let status: StorageProviderStatus | undefined;
  try {
    provider = factory(baseDir);
    status = provider.status?.();
  } catch (err) {
    return {
      configured: id,
      effective: DEFAULT_STORAGE_PROVIDER_ID,
      available: false,
      reason: `Could not initialize the "${id}" storage provider: ${
        err instanceof Error ? err.message : String(err)
      }`,
      provider: localFactory(baseDir),
    };
  }

  if (status && !status.available) {
    return {
      configured: id,
      effective: DEFAULT_STORAGE_PROVIDER_ID,
      available: false,
      reason: status.reason?.trim() || `The "${id}" storage provider is not configured yet.`,
      provider: localFactory(baseDir),
    };
  }

  return {
    configured: id,
    effective: id,
    available: true,
    reason: "",
    provider,
  };
}

/** What the Settings UI needs to explain attachment storage honestly (#0659). */
export interface StorageDescription {
  /** The provider id configured in `repoos.toml` (defaults to `local`). */
  configured: string;
  /** The provider id actually in effect — `local` when the choice is unavailable. */
  effective: string;
  /** Whether the configured provider is available right now. */
  available: boolean;
  /**
   * Non-alarming, human-readable explanation of why local is in effect when
   * the configured provider is unavailable, or `""` when they agree.
   */
  reason: string;
}

/**
 * Describe attachment storage for a config, without exposing a provider
 * instance to callers that only need the status (#0659). `local` is always
 * available; any other id is available only when its factory is registered and
 * reports itself configured. `baseDir` is where a provider instance is rooted
 * for a status probe; the status never depends on it, so a placeholder is
 * acceptable when the caller has no repo root.
 */
export function describeStorage(
  configuredId: string | undefined,
  baseDir: string = process.cwd(),
): StorageDescription {
  const { configured, effective, available, reason } = resolveStorageProvider(
    baseDir,
    configuredId?.trim() || DEFAULT_STORAGE_PROVIDER_ID,
  );
  return { configured, effective, available, reason };
}

// The local provider is the reference implementation and is always registered.
registerStorageProvider(DEFAULT_STORAGE_PROVIDER_ID, localStorageProvider);
