/**
 * Telegram user binding (#0533): allowlisted email, expiry, replay,
 * silent-rebind refusal, live role resolution, username never authorizes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { hashOtp } from "../../core/auth.js";
import {
  TELEGRAM_AUDIT,
  TELEGRAM_START_PAYLOAD_MAX,
  createTelegramInvite,
  instanceIdentity,
  reassignTelegramUser,
  redeemTelegramInvite,
  repositoryIdentity,
  resolveTelegramSender,
  signTelegramInvite,
  telegramDeepLink,
  unbindTelegramUser,
  type TelegramInviteContext,
} from "../../core/telegram-identity.js";

const SECRET = "test-telegram-invite-secret";
let tmpDir: string;
let store: AuthStore;
let ctx: TelegramInviteContext;

beforeEach(() => {
  tmpDir = join(tmpdir(), `repoos-tg-id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  store = new AuthStore(tmpDir);
  ctx = {
    secret: SECRET,
    repoIdentity: repositoryIdentity(tmpDir),
    instanceIdentity: instanceIdentity(tmpDir),
    now: new Date("2026-01-15T12:00:00.000Z"),
  };
});

afterEach(() => {
  store.close();
  resetAuthStoreInstance();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function allow(email: string, role: "admin" | "member" = "member"): void {
  store.upsertUser(email, role, "admin@test.com");
}

describe("createTelegramInvite", () => {
  it("refuses an email that is not on the allowlist", () => {
    const created = createTelegramInvite(store, ctx, {
      email: "ghost@test.com",
      createdBy: "admin@test.com",
    });
    expect(created).toEqual({ error: "not_allowlisted" });
  });

  it("returns a start payload under Telegram's 64-character limit", () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
      botUsername: "ExampleRepoBot",
    });
    expect("error" in created).toBe(false);
    if ("error" in created) return;
    expect(created.nonce.length).toBeLessThanOrEqual(TELEGRAM_START_PAYLOAD_MAX);
    expect(created.deepLink).toBe(`https://t.me/ExampleRepoBot?start=${created.nonce}`);
    expect(store.getAuditLog(5).some((e) => e.action === TELEGRAM_AUDIT.inviteCreated)).toBe(true);
  });
});

describe("redeemTelegramInvite", () => {
  it("binds a numeric Telegram id to the allowlisted email and role", () => {
    allow("alice@test.com", "member");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    const result = redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 4242,
      telegramUsername: "alice_handle",
    });
    expect(result).toEqual({ ok: true, email: "alice@test.com", role: "member" });
    expect(resolveTelegramSender(store, 4242)).toEqual({
      email: "alice@test.com",
      role: "member",
    });
    const bound = store.getAuditLog(10).find((e) => e.action === TELEGRAM_AUDIT.userBound);
    expect(bound?.targetEmail).toBe("alice@test.com");
    expect(bound?.details).toContain("4242");
    expect(bound?.details).not.toContain("alice_handle");
  });

  it("rejects a nonce after the invite expires", () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
      ttlMs: 60_000,
    });
    if ("error" in created) throw new Error("invite");
    const expired = redeemTelegramInvite(
      store,
      { ...ctx, now: new Date("2026-01-15T12:02:00.000Z") },
      { nonce: created.nonce, telegramUserId: 1 },
    );
    expect(expired).toEqual({ ok: false, reason: "expired" });
    expect(resolveTelegramSender(store, 1)).toBeNull();
  });

  it("rejects a replayed nonce", () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    const first = redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 9,
    });
    expect(first.ok).toBe(true);
    const replay = redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 10,
    });
    expect(replay).toEqual({ ok: false, reason: "replay" });
    expect(resolveTelegramSender(store, 10)).toBeNull();
  });

  it("refuses to bind when the email is no longer allowlisted", () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    store.deleteUser("alice@test.com");
    const result = redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 3,
    });
    expect(result).toEqual({ ok: false, reason: "not_allowlisted" });
    expect(resolveTelegramSender(store, 3)).toBeNull();
  });

  it("refuses to silently rebind a Telegram id already bound to another email", () => {
    allow("alice@test.com");
    allow("bob@test.com");
    const forAlice = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    const forBob = createTelegramInvite(store, ctx, {
      email: "bob@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in forAlice || "error" in forBob) throw new Error("invite");
    expect(
      redeemTelegramInvite(store, ctx, {
        nonce: forAlice.nonce,
        telegramUserId: 77,
      }).ok,
    ).toBe(true);
    const stolen = redeemTelegramInvite(store, ctx, {
      nonce: forBob.nonce,
      telegramUserId: 77,
    });
    expect(stolen).toEqual({ ok: false, reason: "already_bound" });
    expect(resolveTelegramSender(store, 77)?.email).toBe("alice@test.com");
    const stillBob = redeemTelegramInvite(store, ctx, {
      nonce: forBob.nonce,
      telegramUserId: 78,
    });
    expect(stillBob).toEqual({ ok: true, email: "bob@test.com", role: "member" });
  });

  it("rejects a tampered invite row whose email no longer matches the MAC", () => {
    allow("alice@test.com");
    allow("mallory@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    const row = store.getTelegramInviteByNonceHash(hashOtp(created.nonce));
    expect(row).not.toBeNull();
    (
      store as unknown as {
        db: { prepare: (s: string) => { run: (email: string, hash: string) => void } };
      }
    ).db
      .prepare("UPDATE telegram_link_invites SET email = ? WHERE nonce_hash = ?")
      .run("mallory@test.com", row!.nonceHash);
    const result = redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 5,
    });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("resolveTelegramSender", () => {
  it("uses the live allowlist role and ignores telegram_username", () => {
    allow("alice@test.com", "member");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, {
      nonce: created.nonce,
      telegramUserId: 100,
      telegramUsername: "spoofed_admin",
    });
    store.upsertUser("alice@test.com", "admin", "admin@test.com");
    store.upsertTelegramLink({
      ...store.getTelegramLink(100)!,
      telegramUsername: "someone_else",
    });
    expect(resolveTelegramSender(store, 100)).toEqual({
      email: "alice@test.com",
      role: "admin",
    });
  });

  it("treats a deleted allowlist row as inert and restores access if re-added", () => {
    allow("alice@test.com", "member");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, { nonce: created.nonce, telegramUserId: 100 });
    store.deleteUser("alice@test.com");
    expect(resolveTelegramSender(store, 100)).toBeNull();
    allow("alice@test.com", "admin");
    expect(resolveTelegramSender(store, 100)).toEqual({
      email: "alice@test.com",
      role: "admin",
    });
  });
});

describe("unbind and reassign", () => {
  it("unbinds with an audit event and frees the Telegram id", () => {
    allow("alice@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, { nonce: created.nonce, telegramUserId: 12 });
    expect(unbindTelegramUser(store, 12, "admin@test.com")?.email).toBe("alice@test.com");
    expect(resolveTelegramSender(store, 12)).toBeNull();
    expect(store.getAuditLog(10).some((e) => e.action === TELEGRAM_AUDIT.userUnbound)).toBe(true);
  });

  it("reassigns only via an explicit admin action", () => {
    allow("alice@test.com");
    allow("bob@test.com");
    const created = createTelegramInvite(store, ctx, {
      email: "alice@test.com",
      createdBy: "admin@test.com",
    });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, { nonce: created.nonce, telegramUserId: 12 });
    const result = reassignTelegramUser(store, {
      telegramUserId: 12,
      email: "bob@test.com",
      actorEmail: "admin@test.com",
    });
    expect(result).toEqual({ ok: true, email: "bob@test.com" });
    expect(resolveTelegramSender(store, 12)?.email).toBe("bob@test.com");
    const audit = store.getAuditLog(10).find((e) => e.action === TELEGRAM_AUDIT.userReassigned);
    expect(audit?.details).toContain("alice@test.com");
  });
});

describe("telegramDeepLink and MAC helpers", () => {
  it("does not invent a deep link without a bot username", () => {
    expect(telegramDeepLink(null, "abcd")).toBeNull();
    expect(
      signTelegramInvite(SECRET, {
        nonce: "aa",
        email: "a@b.c",
        repoIdentity: "r",
        instanceIdentity: "i",
        expiresAt: "t",
      }),
    ).toHaveLength(64);
  });
});
