/**
 * In-memory `ProvisioningStore` — the fake used by this service's own test
 * suite. Implements identical state-machine semantics to `pg-store.ts`
 * (same CAS rules, same passive expiry, same single-use link codes) so a
 * test proves the state machine, not just one storage backend.
 */
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
import type { EncryptedEnvelope } from "./crypto.js";

interface InternalRow extends RequestRow {
  envelope: EncryptedEnvelope | null;
}

export class InMemoryProvisioningStore implements ProvisioningStore {
  private rows = new Map<string, InternalRow>();
  private seenUpdateIds = new Set<number>();
  private rateBuckets = new Map<string, Map<number, number>>();
  auditLog: { event: string; detail: string; requestId: string | null; at: string }[] = [];

  async createRequest(input: NewRequestInput): Promise<void> {
    const now = new Date().toISOString();
    this.rows.set(input.id, {
      id: input.id,
      repository: input.repository,
      instanceId: input.instanceId,
      adminEmail: input.adminEmail,
      botNameHint: input.botNameHint,
      state: "pending",
      deepLink: input.deepLink,
      linkCode: input.linkCode,
      linkCodeExpiresAt: input.linkCodeExpiresAt.toISOString(),
      creatorTelegramUserId: null,
      bot: null,
      error: null,
      expiresAt: input.expiresAt.toISOString(),
      graceUntil: null,
      createdAt: now,
      updatedAt: now,
      envelope: null,
    });
  }

  private touch(row: InternalRow): void {
    row.updatedAt = new Date().toISOString();
  }

  private applyPassiveExpiry(row: InternalRow, now: Date): void {
    const nonTerminal: ProvisioningState[] = ["pending", "awaiting_bot_creation", "ready"];
    if (nonTerminal.includes(row.state) && now.getTime() > Date.parse(row.expiresAt)) {
      row.state = "expired";
      row.error = "the provisioning request expired before it was completed";
      this.touch(row);
    }
  }

  async bindLinkCode(
    code: string,
    telegramUserId: number,
    telegramUsername: string | null,
    now: Date,
  ): Promise<BindLinkCodeOutcome> {
    void telegramUsername;
    for (const row of this.rows.values()) {
      this.applyPassiveExpiry(row, now);
      if (row.linkCode !== code) continue;
      if (row.state !== "pending") return { kind: "not_found" };
      if (!row.linkCodeExpiresAt || now.getTime() > Date.parse(row.linkCodeExpiresAt)) {
        return { kind: "expired" };
      }
      row.creatorTelegramUserId = telegramUserId;
      row.state = "awaiting_bot_creation";
      row.linkCode = null; // single-use: cleared the instant it is consumed
      this.touch(row);
      return { kind: "bound", requestId: row.id };
    }
    return { kind: "not_found" };
  }

  async recordBotCreated(
    creatorTelegramUserId: number,
    bot: BotFields,
    now: Date,
  ): Promise<RecordBotCreatedOutcome> {
    for (const row of this.rows.values()) {
      this.applyPassiveExpiry(row, now);
      if (row.creatorTelegramUserId !== creatorTelegramUserId) continue;
      if (row.state !== "awaiting_bot_creation") continue;
      row.bot = bot;
      row.state = "ready";
      this.touch(row);
      return { kind: "matched", requestId: row.id };
    }
    return { kind: "no_pending_request" };
  }

  async getById(id: string, now: Date): Promise<RequestRow | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    this.applyPassiveExpiry(row, now);
    const { envelope: _envelope, ...view } = row;
    return { ...view };
  }

  async beginRedeem(id: string, now: Date): Promise<BeginRedeemOutcome> {
    const row = this.rows.get(id);
    if (!row) return { kind: "not_found" };
    this.applyPassiveExpiry(row, now);
    if (row.state === "expired") return { kind: "expired" };
    if (row.state !== "ready") {
      const { envelope: _e, ...view } = row;
      return { kind: "wrong_state", row: { ...view } };
    }
    row.state = "redeeming";
    this.touch(row);
    const { envelope: _e2, ...view } = row;
    return { kind: "owned", row: { ...view } };
  }

  async completeRedeem(id: string, envelope: EncryptedEnvelope, graceUntil: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.state = "redeemed";
    row.envelope = envelope;
    row.graceUntil = graceUntil.toISOString();
    this.touch(row);
  }

  async failRedeem(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.state = "ready";
    this.touch(row);
  }

  async takeRedeemedEnvelope(id: string, now: Date): Promise<EncryptedEnvelope | null> {
    const row = this.rows.get(id);
    if (!row || row.state !== "redeemed" || !row.envelope) return null;
    if (row.graceUntil && now.getTime() > Date.parse(row.graceUntil)) {
      row.envelope = null; // purge past the grace window
      return null;
    }
    return row.envelope;
  }

  async seeUpdate(updateId: number, _now: Date): Promise<boolean> {
    if (this.seenUpdateIds.has(updateId)) return false;
    this.seenUpdateIds.add(updateId);
    return true;
  }

  async rateLimit(
    scope: string,
    key: string,
    windowMs: number,
    max: number,
    now: Date,
  ): Promise<boolean> {
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    const bucketKey = `${scope}:${key}`;
    let windows = this.rateBuckets.get(bucketKey);
    if (!windows) {
      windows = new Map();
      this.rateBuckets.set(bucketKey, windows);
    }
    const count = (windows.get(windowStart) ?? 0) + 1;
    windows.set(windowStart, count);
    return count <= max;
  }

  async audit(event: string, detail: string, requestId: string | null, now: Date): Promise<void> {
    this.auditLog.push({ event, detail, requestId, at: now.toISOString() });
  }

  async sweep(now: Date): Promise<number> {
    let touched = 0;
    for (const row of this.rows.values()) {
      const before = row.state;
      this.applyPassiveExpiry(row, now);
      if (row.state !== before) touched++;
      if (row.envelope && row.graceUntil && now.getTime() > Date.parse(row.graceUntil)) {
        row.envelope = null;
        touched++;
      }
    }
    return touched;
  }
}
