/**
 * Minimal AWS Signature Version 4 request signer (#0660).
 *
 * Neon Object Storage speaks the S3 API with SigV4 authentication and
 * path-style addressing only (verified against
 * https://neon.com/docs/storage/s3-compatibility — "Path-style addressing and
 * SigV4 only"). Rather than add the AWS SDK as a runtime dependency — which
 * the "Cloud attachment storage" story forbids unless a task explicitly
 * authorizes it — the provider signs requests itself with `node:crypto`'s
 * HMAC-SHA256, which is already how the rest of RepoOS does crypto.
 *
 * This is deliberately a small, focused signer: header-based authentication
 * over a single payload, no query-string auth, no chunked/signing stream. It
 * is exercised against the worked examples published in the AWS SigV4 test
 * suite (see `sigv4.test.ts`), so the algorithm is verified against the spec,
 * not against Neon's own implementation.
 *
 * Reference: AWS "Signature Version 4 signing process" —
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv4-signing-process.html
 */
import { createHash, createHmac } from "node:crypto";

/** Credentials for one signer. `service` is `"s3"` for Neon Object Storage. */
export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Session token for temporary credentials; sent as `x-amz-security-token`. */
  sessionToken?: string;
}

/** A request to sign, in the pieces SigV4 needs (no framework objects). */
export interface SigV4Request {
  method: string;
  /**
   * Absolute request URL. The path is used verbatim as the canonical URI and
   * the query string as the canonical query string.
   */
  url: string;
  /** Headers the caller will actually send. `host` is derived from `url`. */
  headers: Record<string, string>;
  /** Request body. A string is hashed as UTF-8; a Buffer as its bytes. */
  body?: string | Buffer;
  /** Signing service, e.g. `"s3"`. */
  service: string;
  /** Signing region, e.g. `"us-east-2"`. */
  region: string;
  /**
   * Add `x-amz-content-sha256` (the payload hash) to the signed headers when
   * the caller has not supplied it. Defaults to `true` — S3 requires it. Set
   * `false` to reproduce the generic AWS SigV4 test vectors, which sign only
   * `host;x-amz-date`.
   */
  addContentShaHeader?: boolean;
}

/** The result of signing: the headers to send, including `Authorization`. */
export interface SigV4SignedRequest {
  /** Headers to add to the outgoing request (Authorization, x-amz-date, ...). */
  headers: Record<string, string>;
}

const ALGORITHM = "AWS4-HMAC-SHA256";

/** HMAC-SHA256(key, data) as a Buffer. */
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** Lowercase hex SHA-256 of the given bytes (UTF-8 for strings). */
export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * URI-encode one path segment the way SigV4 requires: every byte except the
 * RFC 3986 unreserved set (`A-Z a-z 0-9 - _ . ~`) is percent-encoded with
 * uppercase hex. `/` is encoded too, so callers join encoded segments with
 * literal slashes to keep them as path separators (S3 does not normalize the
 * path).
 */
export function encodePathSegment(segment: string): string {
  let out = "";
  for (const byte of Buffer.from(segment, "utf8")) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/**
 * Canonical URI for a path: each segment encoded, separators preserved, and a
 * leading `/`. S3 requires the raw object path to be signed exactly as it will
 * be requested — no dot-segment normalization — so this only encodes.
 */
export function canonicalUri(path: string): string {
  const withLead = path.startsWith("/") ? path : `/${path}`;
  return withLead.split("/").map(encodePathSegment).join("/");
}

/**
 * Canonical query string: parameters sorted by encoded key then encoded value,
 * `key=value` joined by `&`. Values are encoded with the same rule as path
 * segments except a space becomes `%20` (not `+`).
 */
export function canonicalQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of params) {
    pairs.push([encodeQueryComponent(key), encodeQueryComponent(value)]);
  }
  pairs.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/** Encode one query key/value the SigV4 way (unreserved set, space as `%20`). */
function encodeQueryComponent(value: string): string {
  let out = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** `YYYYMMDDTHHMMSSZ` timestamp SigV4 wants, from a Date (defaults to now). */
export function amzDate(date: Date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** `YYYYMMDD` datestamp (the first scope component), derived from an amz date. */
export function amzDateStamp(amz: string): string {
  return amz.slice(0, 8);
}

/**
 * A restricted set of headers to sign. S3 requires `host` and every
 * `x-amz-*` header RepoOS sends (`x-amz-date`, `x-amz-content-sha256`,
 * `x-amz-security-token`) to be signed. Signing exactly this set keeps the
 * canonicalization deterministic and avoids depending on a caller's header
 * casing; the caller must send these same headers.
 */
export function signedHeaderNames(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
}

/** Canonical headers block: `name:value\n`, lowercase names, trimmed values. */
function canonicalHeaders(headers: Record<string, string>): string {
  return signedHeaderNames(headers)
    .map((name) => {
      const value = Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1] ?? "";
      // Collapse internal whitespace runs the way SigV4 requires.
      return `${name}:${value.trim().replace(/\s+/g, " ")}`;
    })
    .join("\n")
    .concat("\n");
}

/**
 * Sign a request in place-of-call style: returns the headers to attach. The
 * caller supplies `host` (or it is derived from `url`), `x-amz-date` is set,
 * `x-amz-content-sha256` is added when absent, and the `Authorization` header
 * is computed. No mutation of the input.
 */
export function signRequest(
  request: SigV4Request,
  credentials: SigV4Credentials,
  date: Date = new Date(),
): SigV4SignedRequest {
  const url = new URL(request.url);
  const amz = amzDate(date);
  const stamp = amzDateStamp(amz);
  const bodyBytes =
    request.body === undefined
      ? Buffer.alloc(0)
      : Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(request.body, "utf8");
  const payloadHash = sha256Hex(bodyBytes);

  // Build the header set we sign: caller headers plus the required x-amz ones.
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) headers[key] = value;
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "host")) {
    headers["host"] = url.host;
  }
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "x-amz-date")) {
    headers["x-amz-date"] = amz;
  }
  if (
    request.addContentShaHeader !== false &&
    !Object.keys(headers).some((h) => h.toLowerCase() === "x-amz-content-sha256")
  ) {
    headers["x-amz-content-sha256"] = payloadHash;
  }
  if (
    credentials.sessionToken &&
    !Object.keys(headers).some((h) => h.toLowerCase() === "x-amz-security-token")
  ) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalUri(url.pathname),
    canonicalQuery(url.search),
    canonicalHeaders(headers),
    signedHeaderNames(headers).join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${stamp}/${request.region}/${request.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amz, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = deriveSigningKey(
    credentials.secretAccessKey,
    stamp,
    request.region,
    request.service,
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorization =
    `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaderNames(headers).join(";")}, Signature=${signature}`;

  return { headers: { ...headers, authorization } };
}

/**
 * The SigV4 signing key: HMAC chain over the date, region, service and
 * `aws4_request`, seeded with `AWS4` + the secret. Exported so tests can check
 * the key derivation against the AWS example vectors directly.
 */
export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** The canonical request string for a request, exposed for tests. */
export function canonicalRequest(request: SigV4Request, date: Date = new Date()): string {
  const url = new URL(request.url);
  const amz = amzDate(date);
  const bodyBytes =
    request.body === undefined
      ? Buffer.alloc(0)
      : Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(request.body, "utf8");
  const payloadHash = sha256Hex(bodyBytes);
  const headers: Record<string, string> = { ...request.headers };
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "host")) headers["host"] = url.host;
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "x-amz-date"))
    headers["x-amz-date"] = amz;
  if (
    request.addContentShaHeader !== false &&
    !Object.keys(headers).some((h) => h.toLowerCase() === "x-amz-content-sha256")
  ) {
    headers["x-amz-content-sha256"] = payloadHash;
  }
  return [
    request.method.toUpperCase(),
    canonicalUri(url.pathname),
    canonicalQuery(url.search),
    canonicalHeaders(headers),
    signedHeaderNames(headers).join(";"),
    payloadHash,
  ].join("\n");
}
