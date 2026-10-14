/**
 * Neon Object Storage credentials (#0660), slice 3 of "Cloud attachment
 * storage".
 *
 * ## Where credentials live (the model #0659 committed to)
 *
 * #0659 built the provider *selection* — a `[storage] provider` key in
 * `repoos.toml` — and deliberately added no credential fields, because the
 * story's rule is: "Credentials come from environment/secrets, not from the
 * committed config." `repoos.toml` is committed; an access key in it would be
 * a secret in git. So the Neon credential is read from the process environment
 * (populated from the gitignored `.env` by `loadDotEnv`, exactly like the auth
 * and model-provider keys), never from `repoos.toml`.
 *
 * This mirrors `user-docs/environment-and-secrets.md`: the repoos.toml key
 * chooses *whether* cloud storage is used, the environment supplies *how* to
 * reach it. Nothing secret is ever returned to the browser — this module lives
 * in `src/core` and is only read by the server-side provider.
 *
 * ## The fields (verified against Neon's docs, 2026-10)
 *
 * Neon Object Storage is S3-compatible and path-style only. `GET
 * /projects/{project}/branches/{branch}/storage` (or the Neon Console) gives
 * the branch's S3 endpoint and region; creating a storage-scoped credential
 * (`neon credentials create --scope storage:read --scope storage:write`, or
 * the equivalent API call) returns the S3 access key id (the credential's
 * `token_id`) and secret. Verified against:
 *   - https://neon.com/docs/storage/get-started
 *   - https://neon.com/docs/storage/s3-compatibility
 *   - https://neon.com/docs/reference/api/storage
 *
 * The env-var names are RepoOS-owned (`REPOOS_NEON_STORAGE_*`) rather than the
 * generic `AWS_*` names, so a Neon credential configured for RepoOS can never
 * be silently picked up by an unrelated AWS tool in the same environment, and
 * RepoOS never reads a generic AWS profile. `AWS_ACCESS_KEY_ID` etc. are what
 * Neon's own SDK adapters read; we deliberately do not.
 */

/** Env var that carries the S3 access key id (Neon credential `token_id`). */
export const NEON_ACCESS_KEY_ID_ENV = "REPOOS_NEON_STORAGE_ACCESS_KEY_ID";
/** Env var that carries the S3 secret access key. */
export const NEON_SECRET_ACCESS_KEY_ENV = "REPOOS_NEON_STORAGE_SECRET_ACCESS_KEY";
/** Env var that carries the branch S3 endpoint URL. */
export const NEON_ENDPOINT_ENV = "REPOOS_NEON_STORAGE_ENDPOINT";
/** Env var that carries the S3 region (e.g. `us-east-2`). */
export const NEON_REGION_ENV = "REPOOS_NEON_STORAGE_REGION";
/** Env var that carries the bucket name objects are stored in. */
export const NEON_BUCKET_ENV = "REPOOS_NEON_STORAGE_BUCKET";
/**
 * Env var that carries an optional key prefix, applied under the bucket to
 * isolate this RepoOS *instance*'s objects (repo isolation is a namespace
 * under this prefix; see the story's "instance and repository isolation").
 */
export const NEON_PREFIX_ENV = "REPOOS_NEON_STORAGE_PREFIX";

/** Every env var the Neon credential model reads, in documentation order. */
export const NEON_CREDENTIAL_ENV_VARS = [
  NEON_ENDPOINT_ENV,
  NEON_REGION_ENV,
  NEON_BUCKET_ENV,
  NEON_ACCESS_KEY_ID_ENV,
  NEON_SECRET_ACCESS_KEY_ENV,
  NEON_PREFIX_ENV,
] as const;

/** A fully-resolved Neon credential, ready to build a signed provider. */
export interface NeonStorageCredentials {
  /** Branch S3 endpoint, no trailing slash, e.g. `https://br-….neon.tech`. */
  endpoint: string;
  /** S3 region, e.g. `us-east-2`. */
  region: string;
  /** Bucket name objects are stored in. */
  bucket: string;
  /** S3 access key id (the Neon credential's `token_id`). */
  accessKeyId: string;
  /** S3 secret access key. */
  secretAccessKey: string;
  /** Optional key prefix separating this instance's objects. No slashes at ends. */
  prefix: string;
}

/**
 * Why a Neon credential is not usable, or `null` when it is complete. Each
 * message is written for a non-alarming Settings explanation, names the exact
 * env var to set, and reveals no secret value.
 */
export type NeonCredentialProblem = string;

/** Trim a value and drop a trailing slash, so URL joining is predictable. */
function cleanEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Trim slashes from both ends of a prefix; an empty prefix stays empty. */
function cleanPrefix(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Read and validate the Neon credential from an environment bag. Returns the
 * credential when every required field is present and well-formed, else a
 * `{ problem }` naming what is missing — never a partial credential, so a
 * half-configured provider can never be mistaken for a working one.
 *
 * `env` defaults to `process.env`; tests pass a plain object. No value is ever
 * logged or included in a problem message.
 */
export function readNeonCredentials(
  env: NodeJS.ProcessEnv = process.env,
): NeonStorageCredentials | { problem: NeonCredentialProblem } {
  const endpoint = cleanEndpoint(env[NEON_ENDPOINT_ENV] ?? "");
  const region = (env[NEON_REGION_ENV] ?? "").trim();
  const bucket = (env[NEON_BUCKET_ENV] ?? "").trim();
  const accessKeyId = (env[NEON_ACCESS_KEY_ID_ENV] ?? "").trim();
  const secretAccessKey = (env[NEON_SECRET_ACCESS_KEY_ENV] ?? "").trim();
  const prefix = cleanPrefix(env[NEON_PREFIX_ENV] ?? "");

  const missing: string[] = [];
  if (!endpoint) missing.push(NEON_ENDPOINT_ENV);
  if (!region) missing.push(NEON_REGION_ENV);
  if (!bucket) missing.push(NEON_BUCKET_ENV);
  if (!accessKeyId) missing.push(NEON_ACCESS_KEY_ID_ENV);
  if (!secretAccessKey) missing.push(NEON_SECRET_ACCESS_KEY_ENV);
  if (missing.length) {
    return {
      problem:
        `Neon Object Storage isn't configured yet. Set ${missing.join(", ")} ` +
        `to enable it; until then attachments continue to use local storage.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return {
      problem: `${NEON_ENDPOINT_ENV} must be the branch's full https S3 endpoint URL.`,
    };
  }
  if (parsed.protocol !== "https:") {
    return { problem: `${NEON_ENDPOINT_ENV} must be an https URL.` };
  }

  return { endpoint, region, bucket, accessKeyId, secretAccessKey, prefix };
}

/** True when {@link readNeonCredentials} produced a usable credential. */
export function isNeonCredential(
  value: NeonStorageCredentials | { problem: NeonCredentialProblem },
): value is NeonStorageCredentials {
  return !("problem" in value);
}
