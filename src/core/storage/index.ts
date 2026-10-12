/**
 * Storage providers (#0658) — the seam attachment bytes live behind.
 *
 * `types.ts` defines the minimal {@link StorageProvider} interface; `local.ts`
 * is the reference implementation preserving today's gitignored-directory
 * behavior; `neon.ts` is the Neon Object Storage provider (#0660), signed with
 * the dependency-free SigV4 implementation in `sigv4.ts`; `registry.ts` maps
 * provider ids to factories so a cloud backend can plug in without touching
 * callers.
 */
export * from "./types.js";
export { localStorageProvider } from "./local.js";
export {
  NEON_MAX_OBJECT_BYTES,
  baseDiscriminator,
  neonObjectKey,
  neonStorageProvider,
  parseListKeys,
  type NeonProviderOptions,
} from "./neon.js";
export {
  NEON_ACCESS_KEY_ID_ENV,
  NEON_BUCKET_ENV,
  NEON_CREDENTIAL_ENV_VARS,
  NEON_ENDPOINT_ENV,
  NEON_PREFIX_ENV,
  NEON_REGION_ENV,
  NEON_SECRET_ACCESS_KEY_ENV,
  isNeonCredential,
  readNeonCredentials,
  type NeonCredentialProblem,
  type NeonStorageCredentials,
} from "./neon-credentials.js";
export {
  amzDate,
  amzDateStamp,
  canonicalQuery,
  canonicalRequest,
  canonicalUri,
  deriveSigningKey,
  encodePathSegment,
  sha256Hex,
  signRequest,
  type SigV4Credentials,
  type SigV4Request,
  type SigV4SignedRequest,
} from "./sigv4.js";
export {
  syncHttpRequest,
  type SyncHttpRequest,
  type SyncHttpResponse,
  type SyncHttpTransport,
} from "./sync-http.js";
export {
  DEFAULT_STORAGE_PROVIDER_ID,
  createStorageProvider,
  describeStorage,
  getStorageProviderFactory,
  listStorageProviderIds,
  registerStorageProvider,
  resolveStorageProvider,
  unregisterStorageProvider,
  type StorageDescription,
  type StorageProviderFactory,
} from "./registry.js";
