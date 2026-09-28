/**
 * Authenticated encryption for the short-lived redemption grace window
 * (docs/telegram-manager-service.md#redemption-and-the-grace-window). The
 * project bot token this service hands over is never stored at rest in
 * plaintext: `redeem` encrypts it before the write and the ciphertext is
 * purged as soon as the grace window elapses or a client fetches it once
 * outside the window. Same envelope shape as #0530's secret store
 * (AES-256-GCM, random 12-byte IV, 16-byte auth tag) — duplicated
 * deliberately, since this service must not depend on `@repo-os/repoos`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
}

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "TELEGRAM_MANAGER_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars or base64)",
    );
  }
  return buf;
}

export function encryptToken(plaintext: string, keyRaw: string): EncryptedEnvelope {
  const key = parseKey(keyRaw);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptToken(envelope: EncryptedEnvelope, keyRaw: string): string {
  const key = parseKey(keyRaw);
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** A cryptographically random, URL-safe request id — the bearer secret a
 * caller must know to observe or redeem a request (docs, "Why the request id
 * is itself a bearer secret"). 32 bytes (256 bits) of entropy. */
export function randomRequestId(): string {
  return randomBytes(32).toString("base64url");
}

/** Telegram usernames allow [A-Za-z0-9_]; request ids are base64url and may
 * contain `-`. Take the first six allowed characters for deep-link correlation. */
export function telegramUsernameSuffixFromRequestId(requestId: string): string {
  const suffix = requestId.replace(/[^A-Za-z0-9_]/g, "").slice(0, 6);
  if (suffix.length >= 4) return suffix;
  const expanded = requestId.replace(/[^A-Za-z0-9_]/g, "");
  return (expanded + "0000").slice(0, 6);
}

/** A short, human-typeable one-time code the admin sends to the manager bot
 * (`/link <code>`) to bind their Telegram identity to a pending request
 * before tapping the create-bot deep link. 8 unambiguous base32 characters
 * (~40 bits) — long enough to resist online guessing under rate limiting,
 * short enough to type by hand. */
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function randomLinkCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length];
  return out;
}

const REDACTED = "[redacted]";

/** A stable, non-reversible identifier for an instance auth key, bound to a
 * request at `begin` time and re-checked on every later call for that
 * request (docs/telegram-manager-service.md#per-request-authorization). Not
 * a secret itself — it never needs to be — only unforgeable without the
 * underlying key. */
export function hashAuthKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Value-based redaction bound to the manager bot token, mirroring
 * `src/server/telegram/redact.ts` in the main package (duplicated for the
 * same isolation reason as `types.ts`). */
export function makeTokenRedactor(token: string): (text: string) => string {
  const safe = typeof token === "string" ? token : "";
  const shape = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
  return (text: string): string => {
    let out = String(text ?? "");
    if (safe) out = out.split(safe).join(REDACTED);
    out = out.replace(shape, REDACTED);
    return out;
  };
}
