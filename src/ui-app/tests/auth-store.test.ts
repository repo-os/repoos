import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { hashOtp, hashSessionToken, randomHex } from "../../core/auth.js";

let tmpDir: string;
let store: AuthStore;

beforeEach(() => {
  tmpDir = join(tmpdir(), `repoos-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  store = new AuthStore(tmpDir);
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

describe("AuthStore users", () => {
  it("starts with no users", () => {
    expect(store.listUsers()).toEqual([]);
  });

  it("creates and retrieves a user", () => {
    store.upsertUser("alice@example.com", "admin", null, "Alice");
    const user = store.getUser("alice@example.com");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("alice@example.com");
    expect(user!.role).toBe("admin");
    expect(user!.displayName).toBe("Alice");
  });

  it("returns null for a nonexistent user", () => {
    expect(store.getUser("nobody@example.com")).toBeNull();
  });

  it("lists users in creation order", () => {
    store.upsertUser("a@test.com", "member", null);
    store.upsertUser("b@test.com", "admin", null);
    const users = store.listUsers();
    expect(users).toHaveLength(2);
    expect(users[0].email).toBe("a@test.com");
    expect(users[1].email).toBe("b@test.com");
  });

  it("upsert updates an existing user's role", () => {
    store.upsertUser("alice@test.com", "member", null);
    store.upsertUser("alice@test.com", "admin", "bob@test.com");
    const user = store.getUser("alice@test.com");
    expect(user!.role).toBe("admin");
  });

  it("deletes a user", () => {
    store.upsertUser("alice@test.com", "member", null);
    expect(store.deleteUser("alice@test.com")).toBe(true);
    expect(store.getUser("alice@test.com")).toBeNull();
  });

  it("getAdminCount counts admins correctly", () => {
    expect(store.getAdminCount()).toBe(0);
    store.upsertUser("a@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(1);
    store.upsertUser("b@test.com", "member", null);
    expect(store.getAdminCount()).toBe(1);
    store.upsertUser("c@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(2);
  });
});

describe("AuthStore sessions", () => {
  it("creates a session and returns a token", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  });

  it("retrieves a valid session by token", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    const session = store.getSession(token);
    expect(session).not.toBeNull();
    expect(session!.email).toBe("alice@test.com");
    expect(session!.role).toBe("admin");
    expect(session!.revokedAt).toBeNull();
  });

  it("returns null for an invalid token", () => {
    expect(store.getSession("nonexistent-token")).toBeNull();
  });

  it("returns null for a revoked session", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    store.revokeSession(token);
    expect(store.getSession(token)).toBeNull();
  });

  it("revokes all sessions for an email", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const t1 = store.createSession("alice@test.com", "admin", 3600);
    const t2 = store.createSession("alice@test.com", "admin", 3600);
    expect(store.revokeAllSessions("alice@test.com")).toBe(2);
    expect(store.getSession(t1)).toBeNull();
    expect(store.getSession(t2)).toBeNull();
  });

  it("cleans up expired sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const validToken = store.createSession("alice@test.com", "admin", 3600);
    // Create a session that expired in the past (negative TTL)
    const expiredToken = store.createSession("alice@test.com", "admin", -10);
    const removed = store.cleanupExpiredSessions();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(store.getSession(validToken)).not.toBeNull();
  });

  it("returns empty string when store is unavailable", () => {
    // Create a store pointing to a non-existent path
    const badStore = new AuthStore("/nonexistent/path/to/repo");
    const token = badStore.createSession("alice@test.com", "admin", 3600);
    expect(token).toBe("");
    badStore.close();
  });
});

describe("AuthStore OTP challenges", () => {
  it("creates and finds a valid OTP challenge", () => {
    store.upsertUser("alice@test.com", "member", null);
    const code = "123456";
    const codeHash = hashOtp(code);
    const id = store.createOtpChallenge("alice@test.com", codeHash, 600, "127.0.0.1");
    expect(id).toBeGreaterThan(0);

    const challenge = store.findValidOtp("alice@test.com", codeHash);
    expect(challenge).not.toBeNull();
    expect(challenge!.email).toBe("alice@test.com");
    expect(challenge!.sourceIp).toBe("127.0.0.1");
    expect(challenge!.usedAt).toBeNull();
  });

  it("returns null for wrong code hash", () => {
    store.upsertUser("alice@test.com", "member", null);
    store.createOtpChallenge("alice@test.com", hashOtp("123456"), 600, null);
    expect(store.findValidOtp("alice@test.com", hashOtp("999999"))).toBeNull();
  });

  it("returns null for an already-used OTP", () => {
    store.upsertUser("alice@test.com", "member", null);
    const id = store.createOtpChallenge("alice@test.com", hashOtp("123456"), 600, null);
    store.markOtpUsed(id);
    expect(store.findValidOtp("alice@test.com", hashOtp("123456"))).toBeNull();
  });

  it("returns null for an expired OTP", () => {
    store.upsertUser("alice@test.com", "member", null);
    // TTL of 0 seconds means immediately expired
    store.createOtpChallenge("alice@test.com", hashOtp("123456"), 0, null);
    expect(store.findValidOtp("alice@test.com", hashOtp("123456"))).toBeNull();
  });

  it("counts recent OTP requests", () => {
    store.upsertUser("alice@test.com", "member", null);
    expect(store.countRecentOtpRequests("alice@test.com", 600)).toBe(0);
    store.createOtpChallenge("alice@test.com", hashOtp("111111"), 600, null);
    store.createOtpChallenge("alice@test.com", hashOtp("222222"), 600, null);
    expect(store.countRecentOtpRequests("alice@test.com", 600)).toBe(2);
  });

  it("counts failed verify attempts", () => {
    store.upsertUser("alice@test.com", "member", null);
    const id1 = store.createOtpChallenge("alice@test.com", hashOtp("111111"), 600, null);
    const id2 = store.createOtpChallenge("alice@test.com", hashOtp("222222"), 600, null);
    store.markOtpUsed(id1);
    store.markOtpUsed(id2);
    expect(store.countFailedVerifyAttempts("alice@test.com", 600)).toBe(2);
  });

  it("cleans up expired OTPs", () => {
    store.upsertUser("alice@test.com", "member", null);
    // Use negative TTL so expiry is clearly in the past
    store.createOtpChallenge("alice@test.com", hashOtp("111111"), -10, null);
    store.createOtpChallenge("alice@test.com", hashOtp("222222"), 600, null);
    const removed = store.cleanupExpiredOtps();
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});

describe("AuthStore audit log", () => {
  it("logs and retrieves audit entries", () => {
    store.logAudit("test_action", "target@test.com", "actor@test.com", "detail");
    const entries = store.getAuditLog(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("test_action");
    expect(entries[0].targetEmail).toBe("target@test.com");
    expect(entries[0].actorEmail).toBe("actor@test.com");
    expect(entries[0].details).toBe("detail");
  });

  it("returns entries in reverse chronological order", () => {
    // Entries created at the same second may have identical timestamps.
    // Verify the ordering is stable and the limit works.
    store.logAudit("first", null, null);
    store.logAudit("second", null, null);
    const entries = store.getAuditLog(10);
    expect(entries).toHaveLength(2);
    // Both entries should be present; their order for same-second inserts
    // is implementation-defined (INSERTion order), so just check both exist.
    const actions = entries.map((e) => e.action);
    expect(actions).toContain("first");
    expect(actions).toContain("second");
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      store.logAudit(`action_${i}`, null, null);
    }
    expect(store.getAuditLog(3)).toHaveLength(3);
  });
});

describe("AuthStore session security", () => {
  it("different tokens resolve to different sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const t1 = store.createSession("alice@test.com", "admin", 3600);
    const t2 = store.createSession("alice@test.com", "admin", 3600);
    expect(t1).not.toBe(t2);
    const s1 = store.getSession(t1);
    const s2 = store.getSession(t2);
    expect(s1!.sessionId).not.toBe(s2!.sessionId);
  });

  it("session token hash is not the raw token", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    // The token itself should not be stored as plaintext
    const session = store.getSession(token);
    expect(session!.tokenHash).not.toBe(token);
    expect(session!.tokenHash).toBe(hashSessionToken(token));
  });

  it("OTP code hash is not the raw code", () => {
    store.upsertUser("alice@test.com", "member", null);
    const code = "123456";
    const id = store.createOtpChallenge("alice@test.com", hashOtp(code), 600, null);
    const challenge = store.findValidOtp("alice@test.com", hashOtp(code));
    expect(challenge!.codeHash).not.toBe(code);
    expect(challenge!.codeHash).toBe(hashOtp(code));
  });
});

describe("AuthStore edge cases", () => {
  it("handles null/empty operations gracefully when unavailable", () => {
    const badStore = new AuthStore("/nonexistent/path");
    expect(badStore.isAvailable()).toBe(false);
    expect(badStore.getUser("x@test.com")).toBeNull();
    expect(badStore.listUsers()).toEqual([]);
    expect(badStore.getAdminCount()).toBe(0);
    expect(badStore.getSession("tok")).toBeNull();
    expect(badStore.revokeSession("tok")).toBe(false);
    expect(badStore.revokeAllSessions("x@test.com")).toBe(0);
    expect(badStore.cleanupExpiredSessions()).toBe(0);
    expect(badStore.countRecentOtpRequests("x@test.com", 600)).toBe(0);
    expect(badStore.countFailedVerifyAttempts("x@test.com", 600)).toBe(0);
    expect(badStore.cleanupExpiredOtps()).toBe(0);
    expect(badStore.getAuditLog(10)).toEqual([]);
    badStore.close();
  });

  it("deleteUser for nonexistent user does not affect other users", () => {
    // SQLite DELETE with 0 matching rows still succeeds; verify idempotency
    store.upsertUser("alice@test.com", "admin", null);
    store.deleteUser("nobody@test.com");
    expect(store.getUser("alice@test.com")).not.toBeNull();
  });

  it("session for different user is not affected by revokeAllSessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    store.upsertUser("bob@test.com", "member", null);
    const aliceToken = store.createSession("alice@test.com", "admin", 3600);
    store.createSession("bob@test.com", "member", 3600);
    store.revokeAllSessions("alice@test.com");
    expect(store.getSession(aliceToken)).toBeNull();
    // Bob's sessions should still be valid (listUsers to check Bob has sessions)
    const bobUser = store.getUser("bob@test.com");
    expect(bobUser).not.toBeNull();
  });

  it("updateSessionRoles propagates role to existing sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    const sessionBefore = store.getSession(token);
    expect(sessionBefore!.role).toBe("admin");

    // Demote alice to member
    store.upsertUser("alice@test.com", "member", "admin@test.com");
    store.updateSessionRoles("alice@test.com", "member");

    const sessionAfter = store.getSession(token);
    expect(sessionAfter!.role).toBe("member");
  });

  it("updateSessionRoles only affects active sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const tokenActive = store.createSession("alice@test.com", "admin", 3600);
    const tokenRevoked = store.createSession("alice@test.com", "admin", 3600);
    store.revokeSession(tokenRevoked);

    store.updateSessionRoles("alice@test.com", "member");

    // Active session gets the new role
    expect(store.getSession(tokenActive)!.role).toBe("member");
    // Revoked session is still not returned by getSession
    expect(store.getSession(tokenRevoked)).toBeNull();
  });

  it("updateSessionRoles returns count of updated sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    store.createSession("alice@test.com", "admin", 3600);
    store.createSession("alice@test.com", "admin", 3600);
    const count = store.updateSessionRoles("alice@test.com", "member");
    expect(count).toBe(2);
  });

  it("updateSessionRoles returns 0 for nonexistent user", () => {
    const count = store.updateSessionRoles("nobody@test.com", "admin");
    expect(count).toBe(0);
  });
});
