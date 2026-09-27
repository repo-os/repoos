import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, rewrapSecret, secretStoreKey } from "./secret-store.js";

const key = Buffer.alloc(32, 7);

describe("encrypted secret store", () => {
  it("round trips with a fresh IV per record", () => {
    const first = encryptSecret("123456:bot-token", key);
    const second = encryptSecret("123456:bot-token", key);
    expect(decryptSecret(first, key)).toBe("123456:bot-token");
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain("123456:bot-token");
  });

  it("fails closed for wrong keys and tampered ciphertext", () => {
    const record = encryptSecret("secret", key);
    expect(() => decryptSecret(record, Buffer.alloc(32, 8))).toThrow(/authentication failed/);
    expect(() => decryptSecret({ ...record, ciphertext: "AAAA" }, key)).toThrow(
      /authentication failed/,
    );
  });

  it("rewraps a record under a new key", () => {
    const nextKey = Buffer.alloc(32, 9);
    const result = rewrapSecret(encryptSecret("secret", key), key, nextKey);
    expect(result.plaintext).toBe("secret");
    expect(decryptSecret(result.record, nextKey)).toBe("secret");
  });

  it("requires a valid environment key and accepts hex or base64", () => {
    expect(() => secretStoreKey({})).toThrow(/required/);
    expect(secretStoreKey({ REPOOS_SECRET_STORE_KEY: key.toString("hex") })).toEqual(key);
    expect(secretStoreKey({ REPOOS_SECRET_STORE_KEY: key.toString("base64") })).toEqual(key);
  });
});
