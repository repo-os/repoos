/**
 * Postgres-backed `ProvisioningStore` (Neon Postgres, pooled `DATABASE_URL`).
 * Every method that must be race-safe uses a single atomic SQL statement
 * (`UPDATE ... WHERE state = $expected RETURNING *`) rather than a
 * read-then-write pair, so concurrent callers — including two different
 * RepoOS instances racing the same guessed/leaked id — cannot both win a
 * transition. See `store.ts` for the contract this implements and
 * `memory-store.ts` for the fake exercising identical semantics in tests.
 */
import type { Pool } from "pg";
import type {
  BeginRedeemOutcome,
  BindLinkCodeOutcome,
  BotFields,
  NewRequestInput,
  ProvisioningState,
  ProvisioningStore,
  RecordBotCreatedOutcome,
  RequestRow,
} from "./store.js";
import { REDEEM_LOCK_TIMEOUT_MS } from "./store.js";
import type { EncryptedEnvelope } from "./crypto.js";

interface Row {
  id: string;
  repository: string;
  instance_id: string;
  admin_email: string;
  bot_name_hint: string | null;
  auth_key_hash: string;
  suggested_username: string;
  state: ProvisioningState;
  deep_link: string;
  link_code: string | null;
  link_code_expires_at: Date | null;
  creator_telegram_user_id: string | null;
  bot_id: string | null;
  bot_username: string | null;
  bot_display_name: string | null;
  bot_can_read_all_group_messages: boolean | null;
  error: string | null;
  expires_at: Date;
  grace_until: Date | null;
  redeeming_since: Date | null;
  created_at: Date;
  updated_at: Date;
  token_envelope_iv?: string | null;
  token_envelope_tag?: string | null;
  token_envelope_ciphertext?: string | null;
}

function toRequestRow(row: Row): RequestRow {
  return {
    id: row.id,
    repository: row.repository,
    instanceId: row.instance_id,
    adminEmail: row.admin_email,
    botNameHint: row.bot_name_hint,
    authKeyHash: row.auth_key_hash,
    suggestedUsername: row.suggested_username,
    state: row.state,
    deepLink: row.deep_link,
    linkCode: row.link_code,
    linkCodeExpiresAt: row.link_code_expires_at ? row.link_code_expires_at.toISOString() : null,
    creatorTelegramUserId: row.creator_telegram_user_id
      ? Number(row.creator_telegram_user_id)
      : null,
    bot:
      row.bot_id !== null && row.bot_id !== undefined
        ? {
            id: Number(row.bot_id),
            username: row.bot_username ?? "",
            displayName: row.bot_display_name ?? "",
            canReadAllGroupMessages: row.bot_can_read_all_group_messages,
          }
        : null,
    error: row.error,
    expiresAt: row.expires_at.toISOString(),
    graceUntil: row.grace_until ? row.grace_until.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const NON_TERMINAL: ProvisioningState[] = ["pending", "awaiting_bot_creation", "ready"];

export class PgProvisioningStore implements ProvisioningStore {
  constructor(private readonly pool: Pool) {}

  async createRequest(input: NewRequestInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO provisioning_requests
        (id, repository, instance_id, admin_email, bot_name_hint, auth_key_hash,
         suggested_username, state, deep_link, link_code, link_code_expires_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11)`,
      [
        input.id,
        input.repository,
        input.instanceId,
        input.adminEmail,
        input.botNameHint,
        input.authKeyHash,
        input.suggestedUsername,
        input.deepLink,
        input.linkCode,
        input.linkCodeExpiresAt,
        input.expiresAt,
      ],
    );
  }

  /** Passively expires a single row in place (used before every read/CAS so
   * an expired request never appears active regardless of which method
   * touches it first). */
  private async expireIfDue(id: string, now: Date): Promise<Row | null> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE provisioning_requests
         SET state = 'expired', error = 'the provisioning request expired before it was completed',
             updated_at = now()
       WHERE id = $1 AND state = ANY($2) AND expires_at < $3
       RETURNING *`,
      [id, NON_TERMINAL, now],
    );
    if (rows[0]) return rows[0];
    const { rows: current } = await this.pool.query<Row>(
      `SELECT * FROM provisioning_requests WHERE id = $1`,
      [id],
    );
    return current[0] ?? null;
  }

  async bindLinkCode(
    code: string,
    telegramUserId: number,
    telegramUsername: string | null,
    now: Date,
  ): Promise<BindLinkCodeOutcome> {
    void telegramUsername;
    // Expire any stale row that happens to hold this code before matching,
    // so a code from a long-abandoned request never binds.
    await this.pool.query(
      `UPDATE provisioning_requests
         SET state = 'expired', error = 'the provisioning request expired before it was completed',
             updated_at = now()
       WHERE link_code = $1 AND state = ANY($2) AND expires_at < $3`,
      [code, NON_TERMINAL, now],
    );
    const { rows } = await this.pool.query<{ id: string; link_code_expires_at: Date }>(
      `SELECT id, link_code_expires_at FROM provisioning_requests
        WHERE link_code = $1 AND state = 'pending'`,
      [code],
    );
    const candidate = rows[0];
    if (!candidate) return { kind: "not_found" };
    if (candidate.link_code_expires_at < now) return { kind: "expired" };
    const { rowCount } = await this.pool.query(
      `UPDATE provisioning_requests
         SET state = 'awaiting_bot_creation', creator_telegram_user_id = $2,
             link_code = NULL, updated_at = now()
       WHERE id = $1 AND state = 'pending'`,
      [candidate.id, telegramUserId],
    );
    if (!rowCount) return { kind: "not_found" }; // lost the race to another consumer
    return { kind: "bound", requestId: candidate.id };
  }

  /** Picks exactly one candidate row per event — never more than one, even
   * when a Telegram user has several pending requests (Bug: a bare
   * `WHERE creator_telegram_user_id = ... AND state = 'awaiting_bot_creation'`
   * UPDATE with no LIMIT touches every matching row). Prefers an exact
   * `suggested_username` match; otherwise the single oldest candidate. The
   * `FOR UPDATE SKIP LOCKED` selection plus the join-on-id UPDATE keeps the
   * pick-and-claim atomic against a concurrent duplicate delivery. */
  async recordBotCreated(
    creatorTelegramUserId: number,
    bot: BotFields,
    now: Date,
  ): Promise<RecordBotCreatedOutcome> {
    const { rows } = await this.pool.query<{ id: string }>(
      `WITH candidate AS (
         SELECT id FROM provisioning_requests
         WHERE creator_telegram_user_id = $1 AND state = 'awaiting_bot_creation'
           AND expires_at >= $6
         ORDER BY (suggested_username = $3) DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE provisioning_requests p
         SET state = 'ready', bot_id = $2, bot_username = $3, bot_display_name = $4,
             bot_can_read_all_group_messages = $5, updated_at = now()
       FROM candidate
       WHERE p.id = candidate.id
       RETURNING p.id AS id`,
      [
        creatorTelegramUserId,
        bot.id,
        bot.username,
        bot.displayName,
        bot.canReadAllGroupMessages,
        now,
      ],
    );
    if (!rows[0]) return { kind: "no_pending_request" };
    return { kind: "matched", requestId: rows[0].id };
  }

  async getById(id: string, now: Date): Promise<RequestRow | null> {
    const row = await this.expireIfDue(id, now);
    return row ? toRequestRow(row) : null;
  }

  async beginRedeem(id: string, now: Date): Promise<BeginRedeemOutcome> {
    await this.expireIfDue(id, now);
    const staleCutoff = new Date(now.getTime() - REDEEM_LOCK_TIMEOUT_MS);
    const { rows } = await this.pool.query<Row>(
      `UPDATE provisioning_requests SET state = 'redeeming', redeeming_since = $2, updated_at = now()
       WHERE id = $1
         AND (state = 'ready' OR (state = 'redeeming' AND redeeming_since < $3))
       RETURNING *`,
      [id, now, staleCutoff],
    );
    if (rows[0]) return { kind: "owned", row: toRequestRow(rows[0]) };
    const current = await this.expireIfDue(id, now);
    if (!current) return { kind: "not_found" };
    if (current.state === "expired") return { kind: "expired" };
    return { kind: "wrong_state", row: toRequestRow(current) };
  }

  async completeRedeem(id: string, envelope: EncryptedEnvelope, graceUntil: Date): Promise<void> {
    await this.pool.query(
      `UPDATE provisioning_requests
         SET state = 'redeemed', redeemed_at = now(), grace_until = $2,
             token_envelope_iv = $3, token_envelope_tag = $4, token_envelope_ciphertext = $5,
             redeeming_since = NULL, updated_at = now()
       WHERE id = $1`,
      [id, graceUntil, envelope.iv, envelope.tag, envelope.ciphertext],
    );
  }

  async failRedeem(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE provisioning_requests SET state = 'ready', redeeming_since = NULL, updated_at = now()
       WHERE id = $1 AND state = 'redeeming'`,
      [id],
    );
  }

  async takeRedeemedEnvelope(id: string, now: Date): Promise<EncryptedEnvelope | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM provisioning_requests WHERE id = $1 AND state = 'redeemed'`,
      [id],
    );
    const row = rows[0];
    if (!row || !row.token_envelope_ciphertext) return null;
    if (row.grace_until && row.grace_until < now) {
      await this.purgeEnvelope(id);
      return null;
    }
    return {
      iv: row.token_envelope_iv!,
      tag: row.token_envelope_tag!,
      ciphertext: row.token_envelope_ciphertext!,
    };
  }

  async recordRotatedToken(id: string, envelope: EncryptedEnvelope, graceUntil: Date): Promise<void> {
    await this.pool.query(
      `UPDATE provisioning_requests
         SET grace_until = $2, token_envelope_iv = $3, token_envelope_tag = $4,
             token_envelope_ciphertext = $5, updated_at = now()
       WHERE id = $1`,
      [id, graceUntil, envelope.iv, envelope.tag, envelope.ciphertext],
    );
  }

  private async purgeEnvelope(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE provisioning_requests
         SET token_envelope_iv = NULL, token_envelope_tag = NULL, token_envelope_ciphertext = NULL
       WHERE id = $1`,
      [id],
    );
  }

  async seeUpdate(updateId: number, now: Date): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO telegram_update_dedup (update_id, seen_at) VALUES ($1, $2)
       ON CONFLICT (update_id) DO NOTHING`,
      [updateId, now],
    );
    return (rowCount ?? 0) > 0;
  }

  async forgetUpdate(updateId: number): Promise<void> {
    await this.pool.query(`DELETE FROM telegram_update_dedup WHERE update_id = $1`, [updateId]);
  }

  async rateLimit(
    scope: string,
    key: string,
    windowMs: number,
    max: number,
    now: Date,
  ): Promise<boolean> {
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const { rows } = await this.pool.query<{ count: number }>(
      `INSERT INTO rate_limit_counters (scope, key, window_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (scope, key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
       RETURNING count`,
      [scope, key, windowStart],
    );
    return (rows[0]?.count ?? max + 1) <= max;
  }

  async audit(event: string, detail: string, requestId: string | null, now: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log (request_id, event, detail, created_at) VALUES ($1,$2,$3,$4)`,
      [requestId, event, detail, now],
    );
  }

  async sweep(now: Date): Promise<number> {
    const expired = await this.pool.query(
      `UPDATE provisioning_requests
         SET state = 'expired', error = 'the provisioning request expired before it was completed',
             updated_at = now()
       WHERE state = ANY($1) AND expires_at < $2`,
      [NON_TERMINAL, now],
    );
    // Defense-in-depth reclamation of a `redeeming` lock abandoned by a
    // crashed/restarted redeem attempt — `beginRedeem` already reclaims one
    // lazily on the next attempt, but a request nobody retries would
    // otherwise stay wedged forever. See
    // docs/telegram-manager-service.md#recovering-a-stuck-redeeming-lock.
    const staleCutoff = new Date(now.getTime() - REDEEM_LOCK_TIMEOUT_MS);
    const reclaimed = await this.pool.query(
      `UPDATE provisioning_requests SET state = 'ready', redeeming_since = NULL, updated_at = now()
       WHERE state = 'redeeming' AND redeeming_since < $1`,
      [staleCutoff],
    );
    const purged = await this.pool.query(
      `UPDATE provisioning_requests
         SET token_envelope_iv = NULL, token_envelope_tag = NULL, token_envelope_ciphertext = NULL
       WHERE state = 'redeemed' AND grace_until < $1 AND token_envelope_ciphertext IS NOT NULL`,
      [now],
    );
    // Old dedup rows are unbounded growth otherwise; Telegram never redelivers
    // an update this stale, so a week's retention is generous, not tight.
    const dedup = await this.pool.query(`DELETE FROM telegram_update_dedup WHERE seen_at < $1`, [
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    ]);
    return (
      (expired.rowCount ?? 0) +
      (reclaimed.rowCount ?? 0) +
      (purged.rowCount ?? 0) +
      (dedup.rowCount ?? 0)
    );
  }
}
