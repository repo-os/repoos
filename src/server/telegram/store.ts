/**
 * Encrypted storage for the connected project bot's credential (#0531).
 *
 * One JSON record per repository, written to `<root>/.repoos/telegram-bot.json`
 * (`.repoos/` is gitignored, and crucially lives in the *serving* checkout:
 * a task worktree does not contain it, so even a worktree that inherited the
 * secret-store key through `.env` has no credential to decrypt).
 *
 * Layout:
 *   { version, source, bot: ProvisionedBot,
 *     credential: EncryptedSecret (AES-256-GCM envelope, #0530),
 *     transport, profile, webhookSecret: EncryptedSecret | null,
 *     polling: { lastUpdateId }, createdAt, updatedAt }
 *
 * The only field that holds secret material is the encrypted envelope; the
 * plaintext token exists in memory for the duration of an outbound call and
 * is never written to disk, `.env`, or a response. `repoos.toml` is never
 * touched — secrets do not belong in a git-tracked file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "../../core/secret-store.js";
import type {
  BotSource,
  ProvisionedBot,
  TelegramBotCommand,
  TelegramTransportMode,
} from "./types.js";

export interface TelegramConnectionRecord {
  version: 1;
  source: BotSource;
  bot: ProvisionedBot;
  credential: EncryptedSecret;
  transport: { mode: TelegramTransportMode; webhookUrl?: string };
  profile: {
    name?: string;
    description?: string;
    shortDescription?: string;
    commands?: TelegramBotCommand[];
    appliedAt?: string;
  };
  /** The webhook secret token Telegram re-sends as a header each delivery. */
  webhookSecret: EncryptedSecret | null;
  /** Highest update id consumed by long polling; avoids replays across restarts. */
  polling: { lastUpdateId: number | null };
  createdAt: string;
  updatedAt: string;
}

export class TelegramStoreCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramStoreCorruptError";
  }
}

export class TelegramCredentialDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramCredentialDecryptError";
  }
}

/** One JSON file per repository, under the gitignored cache dir. */
export function telegramConnectionPath(root: string): string {
  return join(root, ".repoos", "telegram-bot.json");
}

export class TelegramCredentialStore {
  private readonly path: string;

  constructor(root: string) {
    this.path = telegramConnectionPath(root);
  }

  /** The stored record, or null when no bot is connected.
   *
   * A malformed file is a finding, not an empty store — fail loudly so the
   * operator hears "your connection state is unreadable" instead of the
   * instance silently acting as if the bot had never been connected. */
  load(): TelegramConnectionRecord | null {
    if (!existsSync(this.path)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch (e) {
      throw new TelegramStoreCorruptError(
        `stored Telegram connection state is unreadable (${this.path}: ${
          e instanceof Error ? e.message : String(e)
        })`,
      );
    }
    const rec = parsed as Partial<TelegramConnectionRecord> | null;
    if (
      !rec ||
      rec.version !== 1 ||
      typeof rec.bot !== "object" ||
      rec.bot === null ||
      typeof rec.credential !== "object" ||
      rec.credential === null ||
      typeof (rec as { createdAt?: unknown }).createdAt !== "string"
    ) {
      throw new TelegramStoreCorruptError(
        `stored Telegram connection state has an unrecognized shape (${this.path})`,
      );
    }
    return parsed as TelegramConnectionRecord;
  }

  save(record: TelegramConnectionRecord): void {
    mkdirSync(join(this.path, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    try {
      chmodSync(this.path, 0o600);
    } catch {
      /* chmod is best-effort (e.g. some filesystems); mode was already set */
    }
  }

  /** Load, mutate, save — with a fresh updatedAt. Null when nothing is stored. */
  update(mutate: (record: TelegramConnectionRecord) => void): TelegramConnectionRecord | null {
    const record = this.load();
    if (!record) return null;
    mutate(record);
    record.updatedAt = new Date().toISOString();
    this.save(record);
    return record;
  }

  /** Forget the connection. Returns whether a record existed. */
  clear(): boolean {
    const existed = existsSync(this.path);
    try {
      rmSync(this.path, { force: true });
    } catch {
      /* already gone */
    }
    return existed;
  }

  /**
   * Decrypt and return the stored bot token. Fails closed: a wrong/missing
   * REPOOS_SECRET_STORE_KEY surfaces as a distinct, actionable error — never
   * a silent empty string and never a plaintext fallback.
   */
  readToken(record: TelegramConnectionRecord = this.loadOrThrow()): string {
    try {
      return decryptSecret(record.credential);
    } catch (e) {
      throw new TelegramCredentialDecryptError(
        `stored Telegram credential cannot be decrypted — REPOOS_SECRET_STORE_KEY is missing, ` +
          `invalid, or the record was written under a different key (${
            e instanceof Error ? e.message : String(e)
          })`,
      );
    }
  }

  private loadOrThrow(): TelegramConnectionRecord {
    const record = this.load();
    if (!record) {
      throw new TelegramCredentialDecryptError("no Telegram bot is connected for this repository");
    }
    return record;
  }

  /** Persist the polling pointer (best-effort; polling tolerates loss). */
  setPollingPointer(lastUpdateId: number): void {
    this.update((record) => {
      record.polling.lastUpdateId = lastUpdateId;
    });
  }

  /** Decrypt the webhook secret (#0532 compares the incoming header). */
  readWebhookSecret(): string | null {
    const record = this.load();
    if (!record?.webhookSecret) return null;
    try {
      return decryptSecret(record.webhookSecret);
    } catch {
      // Same fail-closed posture: an unreadable secret is reported, never guessed.
      return null;
    }
  }

  storeWebhookSecret(secretToken: string, record: TelegramConnectionRecord): void {
    record.webhookSecret = encryptSecret(secretToken);
  }
}
