/**
 * Storage providers (#0658) — the seam attachment bytes live behind.
 *
 * `types.ts` defines the minimal {@link StorageProvider} interface; `local.ts`
 * is the reference implementation preserving today's gitignored-directory
 * behavior; `registry.ts` maps provider ids to factories so a later
 * cloud/Neon backend (#0660) can plug in without touching callers.
 */
export * from "./types.js";
export { localStorageProvider } from "./local.js";
export {
  DEFAULT_STORAGE_PROVIDER_ID,
  createStorageProvider,
  getStorageProviderFactory,
  listStorageProviderIds,
  registerStorageProvider,
  unregisterStorageProvider,
  type StorageProviderFactory,
} from "./registry.js";
