/**
 * The provisioning state machine's storage boundary. Every business rule
 * that must be atomic (single-use redemption, no cross-instance claiming,
 * one-shot link codes) is expressed as one storage call here, so both the
 * Postgres-backed production store (`pg-store.ts`) and the in-memory test
 * store (`memory-store.ts`) implement identical semantics and the service
 * layer (`service.ts`) never has to reason about races itself.
 */
import type { EncryptedEnvelope } from "./crypto.js";

/** Thrown by `createRequest` when the per-(repository, instance) active-request
 * uniqueness constraint (`provisioning_requests_active_per_instance`,
 * migrations/0001_init.sql) rejects a second non-terminal request. The service
 * maps this to a clean 409; without this typed error a raw Postgres
 * unique-violation (SQLSTATE 23505) would escape the ServiceError mapping and
 * surface as an opaque 500 — see
 * docs/telegram-manager-service.md#one-active-request-per-repository-instance. */
export class ActiveRequestExistsError extends Error {
  constructor() {
    super("an active provisioning request already exists for this repository and instance");
    this.name = "ActiveRequestExistsError";
  }
}

/** How long a `redeeming` CAS-lock may be held before it is considered
 * abandoned (crash/restart mid-redeem) and reclaimable by a fresh attempt —
 * see docs/telegram-manager-service.md#recovering-a-stuck-redeeming-lock.
 * Comfortably above the slowest plausible `getManagedBotToken` round trip. */
export const REDEEM_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

export type ProvisioningState =
  | "pending"
  | "awaiting_bot_creation"
  | "ready"
  | "redeeming"
  | "redeemed"
  | "expired"
  | "failed";

export interface BotFields {
  id: number;
  username: string;
  displayName: string;
  canReadAllGroupMessages: boolean | null;
}

export interface RequestRow {
  id: string;
  repository: string;
  instanceId: string;
  adminEmail: string;
  botNameHint: string | null;
  /** Hash of the instance auth key presented when this request was created
   * (`hashAuthKey` in crypto.ts). `getStatus`/`redeem` must present the same
   * key or be refused — see docs/telegram-manager-service.md#per-request-authorization. */
  authKeyHash: string;
  /** The bot username suggested in the deep link at `begin` time — the
   * primary signal for matching a `managed_bot` event to exactly one row
   * when a Telegram user has more than one pending request. */
  suggestedUsername: string;
  state: ProvisioningState;
  deepLink: string;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
  creatorTelegramUserId: number | null;
  bot: BotFields | null;
  error: string | null;
  expiresAt: string;
  graceUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewRequestInput {
  id: string;
  repository: string;
  instanceId: string;
  adminEmail: string;
  botNameHint: string | null;
  authKeyHash: string;
  suggestedUsername: string;
  deepLink: string;
  linkCode: string;
  linkCodeExpiresAt: Date;
  expiresAt: Date;
}

export type BindLinkCodeOutcome =
  | { kind: "bound"; requestId: string }
  | { kind: "not_found" }
  | { kind: "expired" };

export type RecordBotCreatedOutcome =
  | { kind: "matched"; requestId: string }
  | { kind: "no_pending_request" };

export type BeginRedeemOutcome =
  | { kind: "owned"; row: RequestRow }
  | { kind: "not_found" }
  | { kind: "wrong_state"; row: RequestRow }
  | { kind: "expired" };

export interface ProvisioningStore {
  /** Throws `ActiveRequestExistsError` when a non-terminal request already
   * exists for the same (repository, instance) pair — the storage-enforced
   * uniqueness every implementation must mirror
   * (docs/telegram-manager-service.md#one-active-request-per-repository-instance).
   * A predecessor already past `expires_at` is expired in place by this call
   * (it no longer pins the pair) instead of blocking. */
  createRequest(input: NewRequestInput, now: Date): Promise<void>;
  /** Single-use: the first caller to present an unexpired code wins; a
   * second attempt (typo, replay, or an attacker guessing) gets `not_found`
   * because the code is cleared the moment it is consumed. */
  bindLinkCode(
    code: string,
    telegramUserId: number,
    telegramUsername: string | null,
    now: Date,
  ): Promise<BindLinkCodeOutcome>;
  /** Matches a `managed_bot` webhook event to exactly one pending request
   * bound to this Telegram user id (docs/telegram-manager-service.md#correlation).
   * Never updates more than one row: prefers the row whose `suggestedUsername`
   * matches the created bot's username, and otherwise falls back to the
   * single oldest `awaiting_bot_creation` row for that user — a Telegram user
   * with two pending requests must never have both bound to one bot.
   *
   * Known limitation, accepted deliberately: Telegram's `ManagedBotUpdated`
   * fires not only for creations but also when a managed bot's token or owner
   * *changes*. During `awaiting_bot_creation` the matcher cannot distinguish
   * that from a creation, so such a stray event binds credulously (it is
   * still bound to the right creator user id, and unmatched change events
   * reach `bot_created_unmatched`). */
  recordBotCreated(
    creatorTelegramUserId: number,
    bot: BotFields,
    now: Date,
  ): Promise<RecordBotCreatedOutcome>;
  /** Read with passive expiry: a `ready`/`pending`/`awaiting_bot_creation`
   * row past `expires_at` is flipped to `expired` on the way out. */
  getById(id: string, now: Date): Promise<RequestRow | null>;
  /** Atomic compare-and-swap `ready` → `redeeming`; the only way a caller is
   * allowed to proceed to fetch the token from Telegram. Also reclaims a
   * `redeeming` row abandoned past `REDEEM_LOCK_TIMEOUT_MS` (a crash/restart
   * mid-redeem must not wedge a request forever) — see
   * docs/telegram-manager-service.md#recovering-a-stuck-redeeming-lock. */
  beginRedeem(id: string, now: Date): Promise<BeginRedeemOutcome>;
  /** `redeeming` → `redeemed`, storing the encrypted token for the grace
   * window only. */
  completeRedeem(id: string, envelope: EncryptedEnvelope, graceUntil: Date): Promise<void>;
  /** Roll back `redeeming` → `ready` after a Telegram-side failure, so a
   * retry can proceed — the credential was never delivered. */
  failRedeem(id: string): Promise<void>;
  /** Returns the still-valid encrypted envelope for a grace-window replay,
   * or null (already purged / grace elapsed — and purges it now if so). */
  takeRedeemedEnvelope(id: string, now: Date): Promise<EncryptedEnvelope | null>;
  /** Stores a freshly rotated credential over an already-redeemed row,
   * restarting its grace window — see `ProvisioningService.rotateToken`. */
  recordRotatedToken(id: string, envelope: EncryptedEnvelope, graceUntil: Date): Promise<void>;
  /** Looks up the request row that recorded this Telegram bot id (managed bot
   * ids are globally unique; only one row carries a given bot). No
   * authorization filtering happens here — the caller (e.g.
   * `ProvisioningService.revokeBot`) checks {@link RequestRow.authKeyHash},
   * repository and instance and reports a mismatch as `not_found`. */
  getByBotId(botId: number, now: Date): Promise<RequestRow | null>;
  /** Clears any stored redemption envelope and its grace window — post-revoke
   * cleanup so a dropped credential can never be replayed afterwards. */
  clearRedeemedEnvelope(id: string): Promise<void>;
  /** True the first time an `update_id` is seen; false (duplicate) after. */
  seeUpdate(updateId: number, now: Date): Promise<boolean>;
  /** Compensates a `seeUpdate` when handling the update then failed, so
   * Telegram's own retry of the same `update_id` is not silently dropped as
   * a duplicate (docs/telegram-manager-service.md#webhook-delivery-and-retries). */
  forgetUpdate(updateId: number): Promise<void>;
  /** Fixed-window counter. Returns true while under `max` for this window. */
  rateLimit(scope: string, key: string, windowMs: number, max: number, now: Date): Promise<boolean>;
  audit(event: string, detail: string, requestId: string | null, now: Date): Promise<void>;
  /** Maintenance sweep: expires stale non-terminal rows and purges any
   * envelope past its grace window. Safe to call from a scheduled trigger or
   * ad hoc; idempotent. Returns the number of rows touched. */
  sweep(now: Date): Promise<number>;
}
