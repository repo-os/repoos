/**
 * Orchestration: ties the state machine (`store.ts`), the manager bot's
 * Telegram calls (`telegram-client.ts`), and rate limiting/audit together
 * into the three operations `docs/telegram-manager-service.md` and
 * `docs/telegram-adapter.md` document. `http.ts` is the only caller — this
 * module knows nothing about HTTP status codes, only outcome kinds, so the
 * mapping to wire responses stays in one place.
 */
import {
  decryptToken,
  encryptToken,
  randomLinkCode,
  randomRequestId,
  telegramUsernameSuffixFromRequestId,
} from "./crypto.js";
import type { ManagerConfig } from "./config.js";
import type { BeginRequestBody, ProvisioningState } from "./types.js";
import type { ProvisioningStore, RequestRow } from "./store.js";
import { ActiveRequestExistsError } from "./store.js";
import { botFieldsFromEvent, type TelegramManagerClient } from "./telegram-client.js";

export const REQUEST_TTL_MS = 15 * 60 * 1000; // 15 minutes to create the bot
export const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes to send /link
export const REDEEM_GRACE_MS = 5 * 60 * 1000; // replay window after a successful redeem

const BEGIN_WINDOW_MS = 60_000;
const BEGIN_MAX_PER_INSTANCE = 5;
const LINK_WINDOW_MS = 60_000;
const LINK_MAX_PER_TELEGRAM_USER = 10;
const ROTATE_WINDOW_MS = 60_000;
const ROTATE_MAX_PER_REQUEST = 10;

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "invalid"
      | "not_found"
      | "conflict"
      | "gone"
      | "rate_limited"
      | "upstream",
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface BeginResult {
  id: string;
  deepLink: string;
  expiresAt: string;
  linkCode: string;
}

export interface StatusResult {
  id: string;
  state: ProvisioningState;
  deepLink: string;
  expiresAt: string;
  /** Present only while the code is still unconsumed (`pending`). */
  linkCode?: string;
  bot?: RequestRow["bot"];
  error?: string;
}

export interface RedeemResult {
  token?: string;
  bot?: RequestRow["bot"];
}

function sanitizeUsernamePart(hint: string | undefined): string {
  const cleaned = (hint ?? "").replace(/[^A-Za-z0-9]/g, "");
  return cleaned.slice(0, 20) || "RepoOS";
}

export class ProvisioningService {
  constructor(
    private readonly store: ProvisioningStore,
    private readonly telegram: TelegramManagerClient,
    private readonly config: ManagerConfig,
    private readonly managerBotUsername: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async begin(
    instanceId: string,
    body: BeginRequestBody,
    authKeyHash: string,
  ): Promise<BeginResult> {
    const now = this.now();
    const allowed = await this.store.rateLimit(
      "begin",
      instanceId,
      BEGIN_WINDOW_MS,
      BEGIN_MAX_PER_INSTANCE,
      now,
    );
    if (!allowed) {
      await this.store.audit("rate_limited_begin", instanceId, null, now);
      throw new ServiceError(
        "too many provisioning requests from this instance — try again shortly",
        "rate_limited",
      );
    }
    if (!body.repository || !body.requestedBy) {
      throw new ServiceError("repository and requestedBy are required", "invalid");
    }
    const id = randomRequestId();
    const linkCode = randomLinkCode();
    const suggestedUsername =
      `${sanitizeUsernamePart(body.botNameHint)}${telegramUsernameSuffixFromRequestId(id)}Bot`.slice(
        0,
        32,
      );
    const displayName = body.botNameHint || "RepoOS Bot";
    const deepLink = `https://t.me/newbot/${this.managerBotUsername}/${suggestedUsername}?name=${encodeURIComponent(displayName)}`;
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);
    const linkCodeExpiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
    try {
      await this.store.createRequest(
        {
          id,
          repository: body.repository,
          instanceId,
          adminEmail: body.requestedBy,
          botNameHint: body.botNameHint ?? null,
          authKeyHash,
          suggestedUsername,
          deepLink,
          linkCode,
          linkCodeExpiresAt,
          expiresAt,
        },
        now,
      );
    } catch (e) {
      // The storage-level uniqueness constraint (one non-terminal request per
      // repository/instance) maps to a clean conflict, never an opaque 500 —
      // re-clicking "connect" mid-flow is a normal, recoverable situation.
      if (e instanceof ActiveRequestExistsError) {
        await this.store.audit(
          "begin_rejected_active_exists",
          `repository=${body.repository} instance=${instanceId}`,
          null,
          now,
        );
        throw new ServiceError(
          "this repository and instance already have a live provisioning request — " +
            "poll its status or wait for it to expire before starting another",
          "conflict",
        );
      }
      throw e;
    }
    await this.store.audit(
      "begin",
      `repository=${body.repository} instance=${instanceId}`,
      id,
      now,
    );
    return { id, deepLink, expiresAt: expiresAt.toISOString(), linkCode };
  }

  /** Fetches a row and enforces that it was created with the same instance
   * auth key presented for this call. A mismatch is reported as `not_found`
   * — never a distinct "forbidden" — so a caller cannot use the response to
   * confirm another instance's request id exists
   * (docs/telegram-manager-service.md#per-request-authorization). */
  private async getOwnedRow(id: string, authKeyHash: string, now: Date): Promise<RequestRow> {
    const row = await this.store.getById(id, now);
    if (!row || row.authKeyHash !== authKeyHash) {
      throw new ServiceError("no such provisioning request", "not_found");
    }
    return row;
  }

  async getStatus(id: string, authKeyHash: string): Promise<StatusResult> {
    const row = await this.getOwnedRow(id, authKeyHash, this.now());
    return {
      id: row.id,
      state: row.state === "redeeming" ? "ready" : row.state, // "redeeming" is an internal-only state
      deepLink: row.deepLink,
      expiresAt: row.expiresAt,
      ...(row.state === "pending" && row.linkCode ? { linkCode: row.linkCode } : {}),
      ...(row.bot ? { bot: row.bot } : {}),
      ...(row.error ? { error: row.error } : {}),
    };
  }

  /** Handles a manager-bot webhook update once past secret-token
   * verification and dedup. Never throws for a malformed/irrelevant update —
   * it is normalized away and silently ignored, same invariant as the local
   * adapter (#0531). */
  async handleUpdate(raw: Record<string, unknown>): Promise<void> {
    const now = this.now();
    const link = this.telegram.normalizeLinkCommand(raw);
    if (link) {
      const allowed = await this.store.rateLimit(
        "link",
        String(link.telegramUserId),
        LINK_WINDOW_MS,
        LINK_MAX_PER_TELEGRAM_USER,
        now,
      );
      if (!allowed) return; // silent — no information disclosed to a guesser
      const outcome = await this.store.bindLinkCode(
        link.code,
        link.telegramUserId,
        link.telegramUsername,
        now,
      );
      if (outcome.kind === "bound") {
        await this.store.audit(
          "link_bound",
          `telegram_user=${link.telegramUserId}`,
          outcome.requestId,
          now,
        );
        await this.safeReply(
          link.chatId,
          "Linked. Now tap the bot-creation link from RepoOS to finish connecting.",
        );
      } else {
        await this.store.audit(
          "link_rejected",
          `telegram_user=${link.telegramUserId} reason=${outcome.kind}`,
          null,
          now,
        );
        await this.safeReply(
          link.chatId,
          "That code is invalid or expired. Start again from RepoOS.",
        );
      }
      return;
    }
    const event = this.telegram.normalizeManagedBotEvent(raw);
    if (event) {
      const outcome = await this.store.recordBotCreated(
        event.creatorTelegramUserId,
        botFieldsFromEvent(event),
        now,
      );
      if (outcome.kind === "matched") {
        await this.store.audit("bot_created", `bot_id=${event.botId}`, outcome.requestId, now);
      } else {
        // Not necessarily an attack — could be a stray/duplicate delivery,
        // or a creation that never sent /link first. Either way nothing is
        // disclosed and no credential is fetched.
        await this.store.audit(
          "bot_created_unmatched",
          `telegram_user=${event.creatorTelegramUserId} bot_id=${event.botId}`,
          null,
          now,
        );
      }
      return;
    }
    // Anything else (other update kinds) is out of scope for this service —
    // it handles provisioning and management only.
  }

  private async safeReply(chatId: number, text: string): Promise<void> {
    try {
      await this.telegram.sendMessage(chatId, text);
    } catch {
      // A reply is a courtesy, not part of the state machine; a Telegram
      // send failure must never fail the update handler.
    }
  }

  async redeem(id: string, authKeyHash: string): Promise<RedeemResult> {
    const now = this.now();
    // Ownership check first: a caller presenting a different (but valid)
    // instance key must get the same "not found" a wrong id would produce,
    // never a hint that a request with this id exists for someone else.
    await this.getOwnedRow(id, authKeyHash, now);
    const begun = await this.store.beginRedeem(id, now);
    if (begun.kind === "not_found")
      throw new ServiceError("no such provisioning request", "not_found");
    if (begun.kind === "expired")
      throw new ServiceError("the provisioning request expired", "gone");
    if (begun.kind === "wrong_state") {
      if (begun.row.state === "redeemed") {
        const envelope = await this.store.takeRedeemedEnvelope(id, now);
        if (envelope) {
          const token = decryptToken(envelope, this.config.encryptionKey);
          return { token, ...(begun.row.bot ? { bot: begun.row.bot } : {}) };
        }
        // Grace window elapsed or already replayed past it: the honest
        // answer is "no credential" (200, no token) — the client contract
        // (#0531) reads that as ManagedRedemptionFollowUpError.
        return {};
      }
      if (begun.row.state === "failed") {
        throw new ServiceError(begun.row.error ?? "the provisioning request failed", "gone");
      }
      if (begun.row.state === "redeeming") {
        // A concurrent redeem of this same request (client retry while the
        // first attempt is mid-Telegram-call, typically after a dropped
        // connection) — completing attempt one publishes the envelope, so the
        // caller's backoff-then-retry replays the same token from the grace
        // window. Phrase it specifically so a retrier can tell this apart
        // from a structurally not-ready request.
        throw new ServiceError(
          "a redemption is already in progress for this request — retry shortly",
          "conflict",
        );
      }
      throw new ServiceError(
        `the provisioning request is not ready yet (state: ${begun.row.state})`,
        "conflict",
      );
    }
    // begun.kind === "owned": we hold the only "redeeming" lock for this id.
    const bot = begun.row.bot;
    if (!bot) {
      await this.store.failRedeem(id);
      throw new ServiceError("the provisioning request has no bot recorded", "conflict");
    }
    try {
      const token = await this.telegram.getManagedBotToken(bot.id);
      const envelope = encryptToken(token, this.config.encryptionKey);
      const graceUntil = new Date(now.getTime() + REDEEM_GRACE_MS);
      await this.store.completeRedeem(id, envelope, graceUntil);
      await this.store.audit("redeemed", `bot_id=${bot.id}`, id, now);
      return { token, bot };
    } catch (e) {
      await this.store.failRedeem(id);
      const detail = e instanceof Error ? e.message : String(e);
      await this.store.audit("redeem_failed", detail, id, now);
      throw new ServiceError(`could not retrieve the project bot token: ${detail}`, "upstream");
    }
  }

  async sweep(): Promise<number> {
    return this.store.sweep(this.now());
  }

  /** Rotates the project bot's token via Telegram's `replaceManagedBotToken`
   * (see #0539) — Telegram has no separate revoke primitive; replacing the
   * token is the only way to invalidate the previous one
   * (docs/telegram-manager-service.md#management-lifecycle-rotate-and-revoke-0539).
   * Only callable once a bot has actually been redeemed; the fresh token is
   * re-encrypted into the same grace-window envelope so an in-flight local
   * instance can still fetch it once. */
  async rotateToken(id: string, authKeyHash: string): Promise<RedeemResult> {
    const now = this.now();
    const row = await this.getOwnedRow(id, authKeyHash, now);
    if (row.state !== "redeemed" || !row.bot) {
      throw new ServiceError(
        "the provisioning request has not been redeemed yet — nothing to rotate",
        "conflict",
      );
    }
    // Ownership is verified first (only then do we count against the cap) —
    // each accepted rotate is a real `replaceManagedBotToken` call to
    // Telegram, so a valid-key flood must be bounded per request.
    const allowed = await this.store.rateLimit(
      "rotate",
      id,
      ROTATE_WINDOW_MS,
      ROTATE_MAX_PER_REQUEST,
      now,
    );
    if (!allowed) {
      await this.store.audit("rate_limited_rotate", `bot_id=${row.bot.id}`, id, now);
      throw new ServiceError(
        "too many token rotations for this request — try again shortly",
        "rate_limited",
      );
    }
    try {
      const token = await this.telegram.replaceManagedBotToken(row.bot.id);
      const envelope = encryptToken(token, this.config.encryptionKey);
      const graceUntil = new Date(now.getTime() + REDEEM_GRACE_MS);
      await this.store.recordRotatedToken(id, envelope, graceUntil);
      await this.store.audit("token_rotated", `bot_id=${row.bot.id}`, id, now);
      return { token, bot: row.bot };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await this.store.audit("token_rotate_failed", detail, id, now);
      throw new ServiceError(`could not rotate the project bot token: ${detail}`, "upstream");
    }
  }

  /** Revokes a managed project bot — the #0539 disconnect contract. The
   * local instance's `HttpProvisioningClient.revokeBot`
   * (`src/server/telegram/provisioning.ts` on main) calls
   * `POST /v1/provisioning/bots/{botId}/revoke` with
   * `{ repository, instance: { id } }` when an admin disconnects a
   * managed-source bot, and treats any confirmed response as success.
   *
   * Telegram exposes no revoke/rename primitive for a managed bot
   * (docs/telegram-manager-service.md#management-lifecycle-rotate-and-revoke-0539), so
   * revocation here is `replaceManagedBotToken`: the caller's old token stops
   * working immediately, the fresh token is known to nobody (it is never
   * stored or returned — unlike `rotateToken`, this discards it), and any
   * stored grace-window envelope is purged so the dropped credential can
   * never be replayed by this route afterwards. Repeat calls simply rotate
   * again — idempotent in outcome, so a retry that races the first is safe.
   * Ownership is the same triple redeem uses: the presented auth key's hash,
   * the repository, and the instance id. Any mismatch is `not_found`, never
   * a distinguishing 403, so the route cannot be probed for bot existence
   * (docs/telegram-manager-service.md#per-request-authorization). */
  async revokeBot(
    botId: number,
    repository: string,
    instanceId: string,
    authKeyHash: string,
  ): Promise<{ confirmed: boolean }> {
    const now = this.now();
    const row = await this.store.getByBotId(botId, now);
    if (
      !row ||
      row.authKeyHash !== authKeyHash ||
      row.repository !== repository ||
      row.instanceId !== instanceId ||
      !row.bot
    ) {
      throw new ServiceError("no such managed bot", "not_found");
    }
    try {
      await this.telegram.replaceManagedBotToken(botId);
      // Confirming the Telegram-side rotation, not reporting success — the
      // fresh token is deliberately dropped: callers of this route are
      // disconnecting, and the credential should go nowhere.
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await this.store.audit("bot_revoke_failed", detail, row.id, now);
      throw new ServiceError(`could not revoke the project bot: ${detail}`, "upstream");
    }
    await this.store.clearRedeemedEnvelope(row.id);
    await this.store.audit("bot_revoked", `bot_id=${botId}`, row.id, now);
    return { confirmed: true };
  }
}
