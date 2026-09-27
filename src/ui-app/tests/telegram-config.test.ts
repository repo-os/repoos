/**
 * Telegram configuration (#0531): `[telegram]` parsing, the Settings schema
 * entry, and the credential-free browser contract (no token ever lands in
 * repoos.toml or in `safeConfigForBrowser`'s output).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { safeConfigForBrowser } from "../../server/routes/config.js";

let tmpRoot: string;

function writeToml(body: string): void {
  writeFileSync(join(tmpRoot, "repoos.toml"), body, "utf8");
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "repoos-telegram-config-"));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("[telegram] config parsing", () => {
  it("defaults to disabled with no provisioning URL", () => {
    const config = loadConfig(tmpRoot);
    expect(config.telegram?.enabled ?? false).toBe(false);
    expect(config.telegram?.provisioningUrl ?? "").toBe("");
  });

  it("parses telegram.enabled from a [telegram] section", () => {
    writeToml("[telegram]\nenabled = true\n");
    const config = loadConfig(tmpRoot);
    expect(config.telegram?.enabled).toBe(true);
  });

  it("parses the flat root spelling patchTomlConfig writes", () => {
    writeToml("telegram.enabled = true\n");
    const config = loadConfig(tmpRoot);
    expect(config.telegram?.enabled).toBe(true);
  });

  it("parses provisioningUrl and ignores invalid values", () => {
    writeToml('[telegram]\nenabled = true\nprovisioningUrl = "https://provision.example.com"\n');
    const config = loadConfig(tmpRoot);
    expect(config.telegram?.provisioningUrl).toBe("https://provision.example.com");

    writeToml('[telegram]\nenabled = "not-a-bool"\n');
    expect(loadConfig(tmpRoot).telegram?.enabled ?? false).toBe(false);
  });
});

describe("the telegram.enabled schema entry", () => {
  it("exists as a live boolean with a Settings-control contract", () => {
    const schema = getConfigSchema();
    const field = schema.find((f) => f.key === "telegram.enabled");
    expect(field).toMatchObject({ type: "boolean", tier: "live", restartRequired: false });
  });

  it("is documented in user-docs/configuration.md (config-docs gate)", () => {
    const doc = readDocs("user-docs/configuration.md");
    expect(doc).toContain("telegram.enabled");
    expect(doc).toContain("telegram.provisioningUrl");
  });

  it("declares only TOML keys the parser actually reads", () => {
    for (const key of ["telegram.enabled", "telegram.provisioningUrl"]) {
      expect(SUPPORTED_TOML_KEYS).toContain(key);
    }
  });
});

/**
 * The browser contract: repoos.toml holds no Telegram credential, and
 * `safeConfigForBrowser` carries only the feature switch — never a token,
 * never an encrypted envelope. Credentials live in
 * `.repoos/telegram-bot.json`, outside the config object entirely.
 */
describe("credential-free config surface", () => {
  it("safeConfigForBrowser carries telegram state without any credential fields", () => {
    writeToml('[telegram]\nenabled = true\nprovisioningUrl = "https://p.example"\n');
    const config = loadConfig(tmpRoot);
    const safe = safeConfigForBrowser({ ...config, auth: undefined } as Record<string, unknown>);
    const telegram = (safe as { telegram?: Record<string, unknown> }).telegram ?? {};
    expect(telegram.enabled).toBe(true);
    expect(telegram.provisioningUrl).toBe("https://p.example");
    // No credential-shaped keys anywhere in the telegram block.
    const serialized = JSON.stringify(telegram);
    expect(serialized).not.toMatch(/token|secret|ciphertext|iv|tag/i);
  });
});

function resolve_repo(): string {
  return resolve(__dirname, "../../..");
}

function readDocs(path: string): string {
  return readFileSync(join(resolve_repo(), path), "utf8");
}
