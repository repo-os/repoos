/**
 * Environment configuration for the manager service. Neon Functions inject
 * `DATABASE_URL` (pooled) automatically once Postgres is enabled on the
 * branch (verified: neon.com/docs/compute/functions/environment-variables,
 * 2026-09-28) — everything else here is an operator-supplied secret set
 * through the platform's own secret store (`neon functions deploy --env
 * KEY=VALUE`, or `env` in `neon.ts` read from `process.env` at deploy time),
 * never committed to this repo or baked into `neon.ts` literally.
 */

export interface ManagerConfig {
  /** Pooled Postgres connection string (Neon-injected `DATABASE_URL`). */
  databaseUrl: string;
  /** The official manager bot's token. Never logged, never returned. */
  managerBotToken: string;
  /** The manager bot's own `@username`, used to build the `t.me/newbot/...`
   * deep link. Not a secret. */
  managerBotUsername: string;
  /** Verifies `X-Telegram-Bot-Api-Secret-Token` on inbound webhook calls. */
  webhookSecret: string;
  /** Shared bearer secrets RepoOS instances present on provisioning calls —
   * a keyring, not a single key: operators SHOULD issue one distinct key per
   * instance so `getStatus`/`redeem` can enforce that only the instance
   * which created a request can later read or redeem it (see
   * docs/telegram-manager-service.md#per-request-authorization). A single
   * shared key across all instances still works (isolation then degrades to
   * "same trust domain") but is not the recommended multi-instance setup. */
  instanceAuthKeys: string[];
  /** AES-256-GCM key (32 bytes, base64 or hex) for grace-window token storage. */
  encryptionKey: string;
  /** Telegram Bot API base, overridable in tests. */
  telegramApiBase: string;
  /** Outbound Telegram Bot API call timeout (ms). */
  telegramApiTimeoutMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value.trim();
}

/** Reads and validates the full config from `process.env`. Fails loudly and
 * early (at request time, not import time, so a health check can still say
 * why) rather than starting half-configured. */
export function loadConfig(): ManagerConfig {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    managerBotToken: requireEnv("TELEGRAM_MANAGER_BOT_TOKEN"),
    managerBotUsername: requireEnv("TELEGRAM_MANAGER_BOT_USERNAME"),
    webhookSecret: requireEnv("TELEGRAM_MANAGER_WEBHOOK_SECRET"),
    instanceAuthKeys: parseInstanceAuthKeys(requireEnv("TELEGRAM_MANAGER_INSTANCE_AUTH_KEY")),
    encryptionKey: requireEnv("TELEGRAM_MANAGER_ENCRYPTION_KEY"),
    telegramApiBase: process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org",
    telegramApiTimeoutMs: parsePositiveInt(process.env.TELEGRAM_API_TIMEOUT_MS, 30_000),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** `TELEGRAM_MANAGER_INSTANCE_AUTH_KEY` may be a single shared key or a
 * comma-separated keyring (one key per instance, recommended). */
function parseInstanceAuthKeys(raw: string): string[] {
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (keys.length === 0) {
    throw new Error("TELEGRAM_MANAGER_INSTANCE_AUTH_KEY must contain at least one key");
  }
  return keys;
}
