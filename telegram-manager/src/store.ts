/**
 * The provisioning state machine's storage boundary. Every business rule
 * that must be atomic (single-use redemption, no cross-instance claiming,
 * one-shot link codes) is expressed as one storage call here, so both the
 * Postgres-backed production store (`pg-store.ts`) and the in-memory test
 * store (`memory-store.ts`) implement identical semantics and the service
 * layer (`service.ts`) never has to reason about races itself.
 */
import type { EncryptedEnvelope } from "./crypto.js";

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
  createRequest(input: NewRequestInput): Promise<void>;
  /** Single-use: the first caller to present an unexpired code wins; a
   * second attempt (typo, replay, or an attacker guessing) gets `not_found`
   * because the code is cleared the moment it is consumed. */
  bindLinkCode(
    code: string,
    telegramUserId: number,
    telegramUsername: string | null,
    now: Date,
  ): Promise<BindLinkCodeOutcome>;
  /** Matches a `managed_bot` webhook event to the pending request bound to
   * this Telegram user id (docs/telegram-manager-service.md#correlation). */
  recordBotCreated(
    creatorTelegramUserId: number,
    bot: BotFields,
    now: Date,
  ): Promise<RecordBotCreatedOutcome>;
  /** Read with passive expiry: a `ready`/`pending`/`awaiting_bot_creation`
   * row past `expires_at` is flipped to `expired` on the way out. */
  getById(id: string, now: Date): Promise<RequestRow | null>;
  /** Atomic compare-and-swap `ready` → `redeeming`; the only way a caller is
   * allowed to proceed to fetch the token from Telegram. */
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
  /** True the first time an `update_id` is seen; false (duplicate) after. */
  seeUpdate(updateId: number, now: Date): Promise<boolean>;
  /** Fixed-window counter. Returns true while under `max` for this window. */
  rateLimit(scope: string, key: string, windowMs: number, max: number, now: Date): Promise<boolean>;
  audit(event: string, detail: string, requestId: string | null, now: Date): Promise<void>;
  /** Maintenance sweep: expires stale non-terminal rows and purges any
   * envelope past its grace window. Safe to call from a scheduled trigger or
   * ad hoc; idempotent. Returns the number of rows touched. */
  sweep(now: Date): Promise<number>;
}
