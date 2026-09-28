#!/usr/bin/env bun
/**
 * Pre-deploy smoke test for `PgProvisioningStore` against a REAL Postgres
 * (`DATABASE_URL` — the Neon pooled connection string in production).
 *
 * The unit suite runs against the in-memory store only (no Postgres in CI),
 * so this script is the required gate before first production deploy: it
 * exercises the exact SQL the service's race-safety depends on — the
 * per-(repository, instance) unique-index conflict mapping (including the
 * expire-and-retry), the One-active-request rule, the `beginRedeem`
 * compare-and-swap, grace-window replay + purge, and the revoke cleanup —
 * and issues a short one-shot script against a random repository name, so a
 * re-run never collides with a previous one. Run migrations first
 * (`bun run migrate`); rows created here are deleted on exit.
 *
 * Exit 0 with "smoke ok" means the store's SQL behaved as designed.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PgProvisioningStore } from "../src/pg-store.js";
import { ActiveRequestExistsError, REDEEM_LOCK_TIMEOUT_MS } from "../src/store.js";
import type { NewRequestInput, RequestRow } from "../src/store.js";
import { decryptToken, encryptToken } from "../src/crypto.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("smoke: DATABASE_URL is required (the real Postgres to test against)");
  process.exit(1);
}

function makeInput(overrides: Partial<NewRequestInput> = {}): NewRequestInput {
  const now = new Date();
  return {
    id: randomUUID().replace(/-/g, "").slice(0, 24),
    repository: `smoke/repoos-${randomUUID()}`,
    instanceId: "smoke-instance",
    adminEmail: "smoke@repoos.test",
    botNameHint: null,
    authKeyHash: "smoke-hash",
    suggestedUsername: `smoke${Math.random().toString(36).slice(2, 8)}Bot`,
    deepLink: "https://t.me/newbot/smoke",
    linkCode: "SMOKE12",
    linkCodeExpiresAt: new Date(now.getTime() + 60_000),
    expiresAt: new Date(now.getTime() + 15 * 60_000),
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`smoke failed: ${message}`);
}

const pool = new Pool({ connectionString: databaseUrl });
const store = new PgProvisioningStore(pool);
let touched: string[] = [];

try {
  // 1. The active-request uniqueness constraint: a live predecessor conflicts;
  //    one already past its TTL is expired in place and the insert retries.
  const first = makeInput();
  touched.push(first.repository);
  await store.createRequest(first, new Date());
  await store
    .createRequest(
      makeInput({ repository: first.repository, instanceId: first.instanceId }),
      new Date(),
    )
    .then(
      () => {
        throw new Error("second live request for the same pair did not conflict");
      },
      (e) => assert(e instanceof ActiveRequestExistsError, `unexpected error: ${e}`),
    );
  const later = new Date(Date.now() + 16 * 60_000); // past the pair's 15m TTL
  await store.createRequest(
    makeInput({
      id: "smoke-successor",
      repository: first.repository,
      instanceId: "smoke-instance",
    }),
    later,
  );
  const expiredFirst: RequestRow | null = await store.getById(first.id, later);
  assert(expiredFirst?.state === "expired", "past-TTL predecessor was not expired in place");
  assert(store instanceof PgProvisioningStore, "pg store");

  // 2. The redeem compare-and-swap: exactly one caller holds the lock; a
  //    concurrent duplicate reads wrong_state('redeeming'); a committed
  //    envelope replays within grace and purges past it; the post-timeout
  //    reclaim reopens the lock.
  await pool.query(
    `UPDATE provisioning_requests SET state='ready', bot_id=42, bot_username='smoke_bot',
       bot_display_name='Smoke Bot', bot_can_read_all_group_messages=NULL
     WHERE id = 'smoke-successor'`,
  );
  const owned = await store.beginRedeem("smoke-successor", new Date());
  assert(owned.kind === "owned", "CAS did not acquire a ready row");
  const duplicate = await store.beginRedeem("smoke-successor", new Date());
  assert(duplicate.kind === "wrong_state", "duplicate redeem did not read wrong_state");
  assert(duplicate.row.state === "redeeming", "duplicate saw a state other than redeeming");
  // Abandoned-lock reclaim: a lock held past REDEEM_LOCK_TIMEOUT_MS (crashed
  // redeem) is reopened by the next attempt instead of wedging the request.
  await pool.query(
    `UPDATE provisioning_requests SET redeeming_since = $1 WHERE id = 'smoke-successor'`,
    [new Date(Date.now() - REDEEM_LOCK_TIMEOUT_MS - 1)],
  );
  const reclaimed = await store.beginRedeem("smoke-successor", new Date());
  assert(reclaimed.kind === "owned", "abandoned redeeming lock was not reclaimed");
  const envelope = encryptToken("smoke-secret-token", "0".repeat(64));
  const graceUntil = new Date(Date.now() + 5000);
  await store.completeRedeem("smoke-successor", envelope, graceUntil);
  const replayed = await store.takeRedeemedEnvelope("smoke-successor", new Date());
  assert(
    replayed && decryptToken(replayed, "0".repeat(64)) === "smoke-secret-token",
    "grace-window replay did not return the stored envelope",
  );
  const stale = await store.beginRedeem(
    "smoke-successor",
    new Date(Date.now() + REDEEM_LOCK_TIMEOUT_MS + 1),
  );
  assert(stale.kind === "wrong_state", "reclaim check on a redeemed row misbehaved");
  assert(stale.row.state === "redeemed", "unexpected state after completion");
  const purged = await store.takeRedeemedEnvelope(
    "smoke-successor",
    new Date(graceUntil.getTime() + 1),
  );
  assert(purged === null, "envelope was not purged past its grace window");

  // 3. Revoke cleanup: the bot is resolvable by id and the envelope is
  //    cleared exactly the way `ProvisioningService.revokeBot` does.
  await store.recordRotatedToken(
    "smoke-successor",
    encryptToken("smoke-rotated", "0".repeat(64)),
    new Date(Date.now() + 5000),
  );
  const byBot = await store.getByBotId(42, new Date());
  assert(byBot?.id === "smoke-successor", "getByBotId did not resolve the bot's row");
  await store.clearRedeemedEnvelope("smoke-successor");
  const cleared = await store.takeRedeemedEnvelope("smoke-successor", new Date());
  assert(cleared === null, "clearRedeemedEnvelope did not purge the envelope");

  console.log("smoke ok");
} finally {
  if (touched.length > 0) {
    await pool.query(`DELETE FROM provisioning_requests WHERE repository = ANY($1)`, [touched]);
  }
  await pool.end();
}
