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
  /** Disconnect progress is retained until remote revocation is confirmed. */
  disconnect?: { webhookRemoved: true };
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

const TRANSPORT_MODES: readonly TelegramTransportMode[] = ["off", "polling", "webhook"];

/**
 * Every field later code dereferences without guarding: `status()` reads
 * `transport`/`profile`, `connectByBotToken` merges them, the polling pointer
 * writes `polling.lastUpdateId`. A record missing any of these previously
 * passed `load()` and then blew up downstream with a 500 on status — and
 * blocked re-connecting. Validate the whole shape here and say what is wrong.
 * Returns null for a well-shaped record, else the first problem found.
 */
function recordShapeProblem(rec: unknown): string | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return "not an object";
  const r = rec as Partial<TelegramConnectionRecord> & Record<string, unknown>;
  if (r.version !== 1) return `unsupported version ${JSON.stringify(r.version)}`;
  if (typeof r.bot !== "object" || r.bot === null) return "missing bot";
  if (typeof r.credential !== "object" || r.credential === null) return "missing credential";
  if (typeof r.createdAt !== "string") return "missing createdAt";
  if (typeof r.updatedAt !== "string") return "missing updatedAt";
  if (typeof r.transport !== "object" || r.transport === null) return "missing transport";
  if (!TRANSPORT_MODES.includes((r.transport as { mode?: unknown }).mode as never)) {
    return `unknown transport mode ${JSON.stringify((r.transport as { mode?: unknown }).mode)}`;
  }
  if (typeof r.profile !== "object" || r.profile === null) return "missing profile";
  if (typeof r.polling !== "object" || r.polling === null) return "missing polling";
  if (
    r.disconnect !== undefined &&
    (typeof r.disconnect !== "object" ||
      r.disconnect === null ||
      (r.disconnect as { webhookRemoved?: unknown }).webhookRemoved !== true)
  ) {
    return "invalid disconnect progress";
  }
  const pointer = (r.polling as { lastUpdateId?: unknown }).lastUpdateId;
  if (pointer !== null && typeof pointer !== "number") {
    return `invalid polling pointer ${JSON.stringify(pointer)}`;
  }
  if (
    r.webhookSecret !== null &&
    (typeof r.webhookSecret !== "object" || r.webhookSecret === null)
  ) {
    return "webhookSecret must be null or an encrypted envelope";
  }
  return null;
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
    const problem = recordShapeProblem(rec);
    if (problem) {
      throw new TelegramStoreCorruptError(
        `stored Telegram connection state has an unrecognized shape (${this.path}: ${problem}). ` +
          "Reconnect after recovering the existing token state; do not delete the file by hand.",
      );
    }
    return parsed as TelegramConnectionRecord;
  }

  /**
   * `load()`, with a corrupt/unreadable record reported as `null` instead of
   * thrown. For paths whose whole purpose is to replace stored state
   * (connect, default-profile decisions): a corrupt record must not block
   * recovery, and `status()` is the loud reporter. Disconnect must use `load()`
   * and fail closed because it cannot revoke an unreadable credential.
   */
  loadOrNull(): TelegramConnectionRecord | null {
    try {
      return this.load();
    } catch {
      return null;
    }
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

  /** Update disconnect progress only if this is still the credential being disconnected. */
  markWebhookRemoved(expected: TelegramConnectionRecord): TelegramConnectionRecord | null {
    const current = this.load();
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return null;
    current.disconnect = { webhookRemoved: true };
    current.updatedAt = new Date().toISOString();
    this.save(current);
    return current;
  }

  /** Remove only the exact connection whose remote token was just revoked. */
  clearIfUnchanged(expected: TelegramConnectionRecord): boolean {
    const current = this.load();
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return false;
    return this.clear();
  }

  /** Forget the connection. Returns whether a record existed before removal. */
  clear(): boolean {
    const existed = existsSync(this.path);
    if (!existed) return false;
    try {
      rmSync(this.path, { force: true });
    } catch (e) {
      throw new Error(
        `failed to remove stored Telegram connection (${this.path}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    if (existsSync(this.path)) {
      throw new Error(
        `stored Telegram connection file was not removed (${this.path}) — disconnect is incomplete`,
      );
    }
    return true;
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
