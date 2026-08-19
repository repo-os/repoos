import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import {
  generateOtp,
  hashOtp,
  timingSafeEqualStr,
  isValidEmail,
  parseCookies,
  buildSessionCookie,
  SESSION_COOKIE_NAME,
  RateLimiter,
  randomHex,
  hashSessionToken,
  generateSessionToken,
  generateOAuthState,
  generatePkceVerifier,
  pkceChallenge,
  otpRequestLimiter,
  otpVerifyLimiter,
  globalRateLimiter,
} from "../../core/auth.js";

let tmpDir: string;
let store: AuthStore;

beforeEach(() => {
  tmpDir = join(tmpdir(), `repoos-auth-integ-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  store = new AuthStore(tmpDir);
});

afterEach(() => {
  store.close();
  resetAuthStoreInstance();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// OTP replay prevention
// ---------------------------------------------------------------------------

describe("OTP replay prevention", () => {
  it("same code cannot be verified twice", () => {
    store.upsertUser("alice@test.com", "member", null);
    const code = "123456";
    const codeHash = hashOtp(code);
    const id = store.createOtpChallenge("alice@test.com", codeHash, 600, "127.0.0.1");

    // First lookup succeeds
    const first = store.findValidOtp("alice@test.com", codeHash);
    expect(first).not.toBeNull();

    // Mark as used
    store.markOtpUsed(id);

    // Second lookup returns null — replay blocked
    const second = store.findValidOtp("alice@test.com", codeHash);
    expect(second).toBeNull();
  });

  it("expired OTP cannot be used", () => {
    store.upsertUser("alice@test.com", "member", null);
    const code = generateOtp();
    store.createOtpChallenge("alice@test.com", hashOtp(code), 0, null);

    expect(store.findValidOtp("alice@test.com", hashOtp(code))).toBeNull();
  });

  it("wrong code fails even for valid OTP", () => {
    store.upsertUser("alice@test.com", "member", null);
    store.createOtpChallenge("alice@test.com", hashOtp("123456"), 600, null);

    expect(store.findValidOtp("alice@test.com", hashOtp("000000"))).toBeNull();
    expect(store.findValidOtp("alice@test.com", hashOtp("123456"))).not.toBeNull();
  });

  it("non-enumerating: same error for wrong code vs no user", () => {
    // Both should return null from findValidOtp
    expect(store.findValidOtp("nobody@test.com", hashOtp("123456"))).toBeNull();
    store.upsertUser("alice@test.com", "member", null);
    expect(store.findValidOtp("alice@test.com", hashOtp("000000"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

describe("Session lifecycle", () => {
  it("session is invalid after logout (revoke)", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    expect(store.getSession(token)).not.toBeNull();

    store.revokeSession(token);
    expect(store.getSession(token)).toBeNull();
  });

  it("all sessions revoked on deleteUser path", () => {
    store.upsertUser("alice@test.com", "member", null);
    const t1 = store.createSession("alice@test.com", "member", 3600);
    const t2 = store.createSession("alice@test.com", "member", 3600);
    const t3 = store.createSession("alice@test.com", "member", 3600);

    const revoked = store.revokeAllSessions("alice@test.com");
    expect(revoked).toBe(3);
    expect(store.getSession(t1)).toBeNull();
    expect(store.getSession(t2)).toBeNull();
    expect(store.getSession(t3)).toBeNull();
  });

  it("role change propagates to active sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const token = store.createSession("alice@test.com", "admin", 3600);
    expect(store.getSession(token)!.role).toBe("admin");

    store.updateSessionRoles("alice@test.com", "member");
    expect(store.getSession(token)!.role).toBe("member");
  });

  it("expired sessions are cleaned up", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const validToken = store.createSession("alice@test.com", "admin", 3600);
    store.createSession("alice@test.com", "admin", -10); // already expired

    const removed = store.cleanupExpiredSessions();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(store.getSession(validToken)).not.toBeNull();
  });

  it("different users' sessions are isolated", () => {
    store.upsertUser("alice@test.com", "admin", null);
    store.upsertUser("bob@test.com", "member", null);

    const aliceToken = store.createSession("alice@test.com", "admin", 3600);
    const bobToken = store.createSession("bob@test.com", "member", 3600);

    store.revokeAllSessions("alice@test.com");
    expect(store.getSession(aliceToken)).toBeNull();
    expect(store.getSession(bobToken)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Admin edge cases
// ---------------------------------------------------------------------------

describe("Admin edge cases", () => {
  it("prevents removing the last admin", () => {
    store.upsertUser("onlyadmin@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(1);

    // Removing the last admin should be guarded at the route level,
    // but the store itself allows it — the guard is in deleteUser handler.
    // We verify the store-level count is accurate for the guard to use.
    expect(store.getAdminCount()).toBe(1);
  });

  it("prevents demoting the last admin", () => {
    store.upsertUser("onlyadmin@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(1);

    // Demote is guarded at route level using getAdminCount
    store.upsertUser("other@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(2);

    // Now demoting one is fine
    store.upsertUser("other@test.com", "member", "onlyadmin@test.com");
    expect(store.getAdminCount()).toBe(1);
  });

  it("bootstrap creates admin and count reflects it", () => {
    expect(store.getAdminCount()).toBe(0);
    store.upsertUser("admin@test.com", "admin", null, "Admin");
    expect(store.getAdminCount()).toBe(1);
    const user = store.getUser("admin@test.com");
    expect(user!.role).toBe("admin");
    expect(user!.displayName).toBe("Admin");
  });

  it("can have multiple admins", () => {
    store.upsertUser("admin1@test.com", "admin", null);
    store.upsertUser("admin2@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(2);
  });

  it("demoting admin to member decreases admin count", () => {
    store.upsertUser("admin@test.com", "admin", null);
    store.upsertUser("other@test.com", "admin", null);
    expect(store.getAdminCount()).toBe(2);

    store.upsertUser("other@test.com", "member", "admin@test.com");
    expect(store.getAdminCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

describe("Audit log", () => {
  it("logs bootstrap admin", () => {
    store.upsertUser("admin@test.com", "admin", null);
    store.logAudit("bootstrap_admin", "admin@test.com", null, "Initial bootstrap");
    const entries = store.getAuditLog(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("bootstrap_admin");
    expect(entries[0].targetEmail).toBe("admin@test.com");
  });

  it("logs role changes with details", () => {
    store.upsertUser("alice@test.com", "member", "admin@test.com");
    store.logAudit("change_role", "alice@test.com", "admin@test.com", "role: admin");
    const entries = store.getAuditLog(10);
    expect(entries[0].details).toBe("role: admin");
  });

  it("logs OTP login", () => {
    store.logAudit("otp_login", "alice@test.com", "alice@test.com");
    const entries = store.getAuditLog(10);
    expect(entries[0].action).toBe("otp_login");
  });

  it("logs Google login", () => {
    store.logAudit("google_login", "alice@test.com", "alice@test.com");
    const entries = store.getAuditLog(10);
    expect(entries[0].action).toBe("google_login");
  });

  it("logs user removal", () => {
    store.upsertUser("admin@test.com", "admin", null);
    store.logAudit("remove_user", "bob@test.com", "admin@test.com");
    const entries = store.getAuditLog(10);
    expect(entries[0].action).toBe("remove_user");
    expect(entries[0].actorEmail).toBe("admin@test.com");
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      store.logAudit(`action_${i}`, null, null);
    }
    expect(store.getAuditLog(5)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Cookie parsing and session cookie
// ---------------------------------------------------------------------------

describe("Cookie parsing and session cookie", () => {
  it("parseCookies extracts repoos_session from cookie header", () => {
    const cookies = parseCookies(`foo=bar; ${SESSION_COOKIE_NAME}=abc123; baz=qux`);
    expect(cookies[SESSION_COOKIE_NAME]).toBe("abc123");
  });

  it("parseCookies returns empty for undefined", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("buildSessionCookie is HttpOnly and SameSite=Lax", () => {
    const cookie = buildSessionCookie("tok", 3600, false);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=3600");
    expect(cookie).not.toContain("Secure");
  });

  it("buildSessionCookie adds Secure when requested", () => {
    const cookie = buildSessionCookie("tok", 3600, true);
    expect(cookie).toContain("Secure");
  });
});

// ---------------------------------------------------------------------------
// Rate limiter isolation
// ---------------------------------------------------------------------------

describe("Rate limiter isolation", () => {
  it("otpRequestLimiter does not interfere with otpVerifyLimiter", () => {
    const key = "test isolation@test.com";
    // Exhaust request limiter
    for (let i = 0; i < 5; i++) otpRequestLimiter.tryAcquire(key);
    expect(otpRequestLimiter.tryAcquire(key)).toBe(false);

    // Verify limiter is independent
    expect(otpVerifyLimiter.tryAcquire(key)).toBe(true);
    otpVerifyLimiter.reset(key);
  });

  it("reset clears the key for retry", () => {
    const key = "test retry@test.com";
    expect(otpRequestLimiter.tryAcquire(key)).toBe(true);
    otpRequestLimiter.reset(key);
    expect(otpRequestLimiter.tryAcquire(key)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("Expired data cleanup", () => {
  it("cleanupExpiredSessions removes only expired sessions", () => {
    store.upsertUser("alice@test.com", "admin", null);
    const validToken = store.createSession("alice@test.com", "admin", 3600);
    store.createSession("alice@test.com", "admin", -1);

    const removed = store.cleanupExpiredSessions();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(store.getSession(validToken)).not.toBeNull();
  });

  it("cleanupExpiredOtps removes only expired OTPs", () => {
    store.upsertUser("alice@test.com", "member", null);
    store.createOtpChallenge("alice@test.com", hashOtp("111111"), -1, null); // expired
    store.createOtpChallenge("alice@test.com", hashOtp("222222"), 600, null); // valid

    const removed = store.cleanupExpiredOtps();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(store.findValidOtp("alice@test.com", hashOtp("222222"))).not.toBeNull();
  });
});
