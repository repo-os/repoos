/**
 * Neon Object Storage provider (#0660), slice 3 of "Cloud attachment storage".
 *
 * Implements the #0658 {@link StorageProvider} interface against Neon's
 * S3-compatible object storage, following the contract exactly: opaque bytes
 * addressed by `namespace` + `name`; path-traversal-safe mapping to object
 * keys; `get`/`localPath` return `null` on a miss and `remove` returns `false`
 * rather than throwing.
 *
 * ## What was verified against Neon's official docs (2026-10)
 *
 * - **S3-compatible, path-style only, SigV4 only.**
 *   https://neon.com/docs/storage/s3-compatibility — "Configure your S3 client
 *   with `forcePathStyle: true` … Neon Object Storage uses path-style
 *   addressing only." Requests are signed with SigV4 (see `sigv4.ts`).
 * - **Per-branch endpoint + region.** `GET
 *   /projects/{project}/branches/{branch}/storage` returns `s3_endpoint`
 *   (`https://br-….neon.tech`), `region` (e.g. `us-east-2`) and
 *   `force_path_style: true`. https://neon.com/docs/reference/api/storage
 * - **Regions** (public beta): AWS US East (Ohio, `aws-us-east-2`), US East
 *   (N. Virginia), Europe (Frankfurt), Asia Pacific (Singapore).
 *   https://neon.com/docs/storage/overview
 * - **Object size limit: 5 GiB** today, single-request *or* multipart; larger
 *   limits are planned on paid plans (up to 5 TB, 5 GB single-request).
 *   https://neon.com/docs/storage/objects — this provider enforces the 5 GiB
 *   ceiling before sending, and RepoOS's own screenshot ceiling (10 MB) is far
 *   below it, so multipart upload ordering does not arise for attachments.
 * - **Operations**: GetObject (Range supported), HeadObject, PutObject,
 *   DeleteObject (soft-delete on the branch), DeleteObjects (batch up to 1,000
 *   keys), ListObjectsV2. ACL/policy writes are **not** supported over the S3
 *   wire — bucket access level is set in the Neon Console/API, which is why
 *   this provider never attempts `PutBucketAcl` and expects a private bucket.
 *   https://neon.com/docs/storage/s3-compatibility
 *
 * ## Why the operations are what they are
 *
 * Every storage call is a signed HTTP request made through the injectable
 * {@link SyncHttpTransport}, so the provider is fully testable with a fake
 * transport and the SigV4 signing is the only security-sensitive custom code
 * (verified against the AWS test vectors in `sigv4.test.ts`). No AWS or Neon
 * SDK is used or required — the story's zero-runtime-dependency rule holds.
 *
 * `removeNamespace` uses ListObjectsV2 + DeleteObjects (batched 1,000 at a
 * time) because the S3 wire has no delete-by-prefix; Neon's own delete-by-prefix
 * is a session API, not an S3 operation, and RepoOS holds S3 credentials only.
 */
import { createHash } from "node:crypto";
import type { StorageProvider, StorageProviderStatus, StoredObject } from "./types.js";
import {
  isNeonCredential,
  readNeonCredentials,
  type NeonStorageCredentials,
} from "./neon-credentials.js";
import { signRequest } from "./sigv4.js";
import { syncHttpRequest, type SyncHttpTransport } from "./sync-http.js";

/**
 * Today's Neon Object Storage object-size ceiling (5 GiB). Verified against
 * https://neon.com/docs/storage/objects ("The maximum object size is currently
 * 5 GiB"). Guarded before a request is sent so an oversized upload fails fast
 * with a clear error rather than a truncated object.
 */
export const NEON_MAX_OBJECT_BYTES = 5 * 1024 ** 3;

/** S3 batch delete accepts at most 1,000 keys per request (Neon inherits this). */
const DELETE_BATCH = 1000;

/** Reject a name/namespace that could escape its prefix, matching `local.ts`. */
function isSafeSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

/**
 * A short, stable discriminator for the attachment base a provider is rooted
 * at (`<root>/work` vs `<root>/inputs`), so the two bases never collide in one
 * bucket and a moved checkout keeps addressing the same objects. The root
 * itself is deliberately *not* in the key beyond this hash: the story's
 * "instance and repository isolation" is a prefix concern (slice 5), and an
 * absolute path in an object key would break on a repo move.
 */
export function baseDiscriminator(baseDir: string): string {
  return createHash("sha256")
    .update(baseDir.replace(/\\/g, "/").replace(/\/+$/, ""))
    .digest("hex")
    .slice(0, 16);
}

/** The object key for `namespace/name` under this credential's prefix. */
export function neonObjectKey(
  cred: Pick<NeonStorageCredentials, "prefix">,
  baseDir: string,
  namespace: string,
  name: string,
): string | null {
  if (!isSafeSegment(namespace) || !isSafeSegment(name)) return null;
  const parts = [cred.prefix, baseDiscriminator(baseDir), namespace, name].filter(Boolean);
  return parts.join("/");
}

/** The prefix every object of one namespace lives under (no trailing name). */
function namespacePrefix(
  cred: NeonStorageCredentials,
  baseDir: string,
  namespace: string,
): string | null {
  if (!isSafeSegment(namespace)) return null;
  const parts = [cred.prefix, baseDiscriminator(baseDir), namespace].filter(Boolean);
  return `/${parts.join("/")}/`;
}

/** Percent-encode an object key for a URL path, preserving `/` separators. */
function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** Collect `<Key>…</Key>` values from a ListObjectsV2 response body. */
export function parseListKeys(xml: string): string[] {
  const keys: string[] = [];
  const re = /<Key>([\s\S]*?)<\/Key>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) keys.push(decodeXml(match[1]));
  return keys;
}

/** Decode the handful of XML entities S3 emits in keys. */
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Escape a string for inclusion in the DeleteObjects XML body. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Options for {@link neonStorageProvider}, all defaulted for production. */
export interface NeonProviderOptions {
  /** Credential override; defaults to reading the environment. */
  credentials?: NeonStorageCredentials | { problem: string };
  /** Transport override for tests; defaults to the real synchronous client. */
  transport?: SyncHttpTransport;
  /** Clock override for tests (SigV4 timestamps). */
  now?: () => Date;
}

/**
 * Build the Neon Object Storage provider for one attachment base.
 *
 * When credentials are absent or incomplete the provider still constructs — the
 * registry needs an instance to call `status()` on — but reports itself
 * unavailable with a reason, so `resolveStorageProvider` falls back to local
 * and the Settings page can explain why. This is the #0659 contract.
 */
export function neonStorageProvider(
  baseDir: string,
  options: NeonProviderOptions = {},
): StorageProvider {
  const credential = options.credentials ?? readNeonCredentials();
  const transport = options.transport ?? syncHttpRequest;
  const now = options.now ?? (() => new Date());

  /** Signed S3 request against the branch endpoint. Throws only on transport. */
  const send = (
    cred: NeonStorageCredentials,
    method: string,
    keyPath: string,
    query: Record<string, string> = {},
    body?: Buffer,
    extraHeaders: Record<string, string> = {},
  ) => {
    const url = new URL(`/${encodeKeyPath(cred.bucket)}${keyPath}`, `${cred.endpoint}/`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { ...extraHeaders };
    // SigV4 needs a payload hash; a Buffer body is hashed as bytes, omitted as
    // empty. `host` is filled by the signer from the URL.
    const signed = signRequest(
      { method, url: url.toString(), headers, body, service: "s3", region: cred.region },
      { accessKeyId: cred.accessKeyId, secretAccessKey: cred.secretAccessKey },
      now(),
    );
    return transport({ method, url: url.toString(), headers: signed.headers, body });
  };

  return {
    id: "neon",
    status(): StorageProviderStatus {
      if (!isNeonCredential(credential)) return { available: false, reason: credential.problem };
      return { available: true };
    },
    put(namespace, name, data): StoredObject | { error: string } {
      if (!isNeonCredential(credential)) return { error: credential.problem };
      if (!Buffer.isBuffer(data)) return { error: "data must be a Buffer" };
      if (!isSafeSegment(namespace) || !isSafeSegment(name))
        return { error: "unsafe storage name" };
      if (data.length > NEON_MAX_OBJECT_BYTES) {
        return { error: `object exceeds the Neon Object Storage limit of 5 GiB` };
      }
      const key = neonObjectKey(credential, baseDir, namespace, name);
      if (!key) return { error: "unsafe storage name" };
      try {
        const res = send(credential, "PUT", `/${key}`, {}, data, {
          "content-type": "application/octet-stream",
        });
        if (res.status >= 200 && res.status < 300) return {};
        return { error: `Neon Object Storage upload failed (HTTP ${res.status})` };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    get(namespace, name) {
      if (!isNeonCredential(credential)) return null;
      const key = neonObjectKey(credential, baseDir, namespace, name);
      if (!key) return null;
      try {
        const res = send(credential, "GET", `/${key}`);
        if (res.status === 200) return res.body;
        return null;
      } catch {
        return null;
      }
    },
    list(namespace) {
      if (!isNeonCredential(credential)) return [];
      const prefix = namespacePrefix(credential, baseDir, namespace);
      if (!prefix) return [];
      try {
        const keys = listAllKeys(credential, prefix);
        const head = prefix.replace(/^\//, "");
        return keys.map((k) => k.slice(head.length)).filter((rel) => rel && !rel.includes("/"));
      } catch {
        return [];
      }
    },
    remove(namespace, name) {
      if (!isNeonCredential(credential)) return false;
      const key = neonObjectKey(credential, baseDir, namespace, name);
      if (!key) return false;
      try {
        const res = send(credential, "DELETE", `/${key}`);
        // S3 DELETE is idempotent (204 even for a missing object), so a
        // 204/200 is "removed"; a 404 also means nothing is there.
        return res.status >= 200 && res.status < 300;
      } catch {
        return false;
      }
    },
    removeNamespace(namespace) {
      if (!isNeonCredential(credential)) return;
      const prefix = namespacePrefix(credential, baseDir, namespace);
      if (!prefix) return;
      try {
        const keys = listAllKeys(credential, prefix);
        for (let i = 0; i < keys.length; i += DELETE_BATCH) {
          deleteBatch(credential, keys.slice(i, i + DELETE_BATCH));
        }
      } catch {
        // Idempotent by contract; a failed sweep leaves objects for a later run.
      }
    },
    // A remote provider has no local path and no cheap size without a HEAD, so
    // it omits `localPath` and provides `size` via a signed HeadObject.
    size(namespace, name) {
      if (!isNeonCredential(credential)) return null;
      const key = neonObjectKey(credential, baseDir, namespace, name);
      if (!key) return null;
      try {
        const res = send(credential, "HEAD", `/${key}`);
        if (res.status !== 200) return null;
        const len = Number(res.headers["content-length"]);
        return Number.isFinite(len) ? len : null;
      } catch {
        return null;
      }
    },
  };

  /** Page through ListObjectsV2 and return every key under `prefix`. */
  function listAllKeys(cred: NeonStorageCredentials, prefix: string): string[] {
    const keys: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10_000; page++) {
      const query: Record<string, string> = {
        "list-type": "2",
        prefix: prefix.replace(/^\//, ""),
        "max-keys": "1000",
      };
      if (token) query["continuation-token"] = token;
      const res = send(cred, "GET", "", query);
      if (res.status !== 200) break;
      const xml = res.body.toString("utf8");
      keys.push(...parseListKeys(xml));
      const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
      const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
      if (!truncated || !next) break;
      token = decodeXml(next[1]);
    }
    return keys;
  }

  /** Delete up to 1,000 keys in one signed DeleteObjects call. */
  function deleteBatch(cred: NeonStorageCredentials, keys: string[]): void {
    if (!keys.length) return;
    const body = Buffer.from(
      `<Delete><Quiet>true</Quiet>${keys
        .map((k) => `<Object><Key>${escapeXml(k)}</Key></Object>`)
        .join("")}</Delete>`,
      "utf8",
    );
    const md5 = createHash("md5").update(body).digest("base64");
    send(cred, "POST", "", { delete: "" }, body, {
      "content-type": "application/xml",
      "content-md5": md5,
    });
  }
}
