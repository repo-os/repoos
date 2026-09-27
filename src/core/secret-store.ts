import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface EncryptedSecret {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

/** Resolve the encryption key from the process environment. Keys are 32 bytes,
 * represented as 64 hex characters or base64. Missing/invalid keys fail closed. */
export function secretStoreKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const value = env.REPOOS_SECRET_STORE_KEY;
  if (!value) {
    throw new Error("REPOOS_SECRET_STORE_KEY is required to store or read encrypted secrets");
  }
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(value)) key = Buffer.from(value, "hex");
  else {
    key = Buffer.from(value, "base64");
    if (key.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
      throw new Error(
        "REPOOS_SECRET_STORE_KEY must be 32 bytes encoded as 64 hex or base64 characters",
      );
    }
  }
  if (key.length !== 32) {
    throw new Error("REPOOS_SECRET_STORE_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return key;
}

/** Encrypt a secret for persistence. Each call uses a fresh random 96-bit IV. */
export function encryptSecret(plaintext: string, key = secretStoreKey()): EncryptedSecret {
  if (key.length !== 32) throw new Error("Secret store key must be exactly 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/** Decrypt an envelope, throwing on malformed data, wrong keys, or any tampering. */
export function decryptSecret(record: EncryptedSecret, key = secretStoreKey()): string {
  if (
    !record ||
    record.version !== VERSION ||
    record.algorithm !== ALGORITHM ||
    typeof record.iv !== "string" ||
    typeof record.tag !== "string" ||
    typeof record.ciphertext !== "string"
  )
    throw new Error("Unsupported or malformed encrypted secret record");
  if (key.length !== 32) throw new Error("Secret store key must be exactly 32 bytes");
  const iv = Buffer.from(record.iv, "base64");
  const tag = Buffer.from(record.tag, "base64");
  if (iv.length !== IV_BYTES || tag.length !== 16)
    throw new Error("Malformed encrypted secret record");
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted secret authentication failed (wrong key or tampered record)");
  }
}

/** Read and re-encrypt a record with the current key. Persist the returned
 * envelope to complete key rotation without asking the user to provision again. */
export function rewrapSecret(
  record: EncryptedSecret,
  oldKey: Buffer,
  newKey = secretStoreKey(),
): { plaintext: string; record: EncryptedSecret } {
  const plaintext = decryptSecret(record, oldKey);
  return { plaintext, record: encryptSecret(plaintext, newKey) };
}
