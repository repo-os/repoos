import { describe, expect, it, beforeEach } from "vitest";
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

describe("auth crypto utilities", () => {
  it("generateOtp produces a 6-digit string", () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generateOtp produces different codes on successive calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it("hashOtp returns a deterministic SHA-256 hex digest", () => {
    const hash1 = hashOtp("123456");
    const hash2 = hashOtp("123456");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashOtp produces different hashes for different inputs", () => {
    expect(hashOtp("111111")).not.toBe(hashOtp("222222"));
  });

  it("timingSafeEqualStr returns true for equal strings", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
  });

  it("timingSafeEqualStr returns false for different strings", () => {
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
  });

  it("timingSafeEqualStr returns false for different lengths", () => {
    expect(timingSafeEqualStr("ab", "abc")).toBe(false);
  });

  it("randomHex returns the requested number of bytes as hex", () => {
    const hex = randomHex(16);
    expect(hex).toMatch(/^[a-f0-9]{32}$/);
  });

  it("generateSessionToken returns a 64-char hex string", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashSessionToken is deterministic", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("generateOAuthState returns a 32-char hex string", () => {
    expect(generateOAuthState()).toMatch(/^[a-f0-9]{32}$/);
  });

  it("generatePkceVerifier returns a base64url string", () => {
    const verifier = generatePkceVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("pkceChallenge returns a deterministic base64url SHA-256", () => {
    const verifier = "test-verifier-value";
    const c1 = pkceChallenge(verifier);
    const c2 = pkceChallenge(verifier);
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("pkceChallenge produces a different challenge for different verifiers", () => {
    const v1 = generatePkceVerifier();
    const v2 = generatePkceVerifier();
    expect(pkceChallenge(v1)).not.toBe(pkceChallenge(v2));
  });

  it("PKCE verifier is always within the allowed character set and length", () => {
    for (let i = 0; i < 50; i++) {
      const verifier = generatePkceVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("email validation", () => {
  it("accepts valid email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test.user@domain.co.uk")).toBe(true);
    expect(isValidEmail("a+b@c.com")).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user @example.com")).toBe(false);
  });
});

describe("cookie helpers", () => {
  it("parseCookies parses a simple cookie header", () => {
    expect(parseCookies("a=1; b=2")).toEqual({ a: "1", b: "2" });
  });

  it("parseCookies handles empty/undefined input", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("parseCookies handles values with equals signs", () => {
    expect(parseCookies("token=abc=def=ghi")).toEqual({ token: "abc=def=ghi" });
  });

  it("buildSessionCookie produces a valid Set-Cookie string", () => {
    const cookie = buildSessionCookie("tok123", 3600, false);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=tok123`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=3600");
    expect(cookie).not.toContain("Secure");
  });

  it("buildSessionCookie includes Secure when secure=true", () => {
    const cookie = buildSessionCookie("tok123", 3600, true);
    expect(cookie).toContain("Secure");
  });
});

describe("RateLimiter", () => {
  it("allows requests within the limit", () => {
    const limiter = new RateLimiter(1000, 3);
    expect(limiter.tryAcquire("key")).toBe(true);
    expect(limiter.tryAcquire("key")).toBe(true);
    expect(limiter.tryAcquire("key")).toBe(true);
  });

  it("rejects requests over the limit", () => {
    const limiter = new RateLimiter(1000, 2);
    expect(limiter.tryAcquire("key")).toBe(true);
    expect(limiter.tryAcquire("key")).toBe(true);
    expect(limiter.tryAcquire("key")).toBe(false);
  });

  it("resets a key", () => {
    const limiter = new RateLimiter(1000, 1);
    expect(limiter.tryAcquire("key")).toBe(true);
    expect(limiter.tryAcquire("key")).toBe(false);
    limiter.reset("key");
    expect(limiter.tryAcquire("key")).toBe(true);
  });

  it("tracks different keys independently", () => {
    const limiter = new RateLimiter(1000, 1);
    expect(limiter.tryAcquire("a")).toBe(true);
    expect(limiter.tryAcquire("b")).toBe(true);
    expect(limiter.tryAcquire("a")).toBe(false);
    expect(limiter.tryAcquire("b")).toBe(false);
  });

  it("allows requests again after the window expires", async () => {
    const limiter = new RateLimiter(50, 1);
    expect(limiter.tryAcquire("key")).toBe(true);
    expect(limiter.tryAcquire("key")).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(limiter.tryAcquire("key")).toBe(true);
  });
});

describe("OTP rate limiters", () => {
  beforeEach(() => {
    otpRequestLimiter.reset("test_otp_req@test.com");
    otpVerifyLimiter.reset("test_otp_verify@test.com");
    globalRateLimiter.reset("test-global-ip");
  });

  it("otpRequestLimiter limits to 5 requests per email per 10 minutes", () => {
    const key = "test_otp_req@test.com";
    for (let i = 0; i < 5; i++) {
      expect(otpRequestLimiter.tryAcquire(key)).toBe(true);
    }
    expect(otpRequestLimiter.tryAcquire(key)).toBe(false);
  });

  it("otpVerifyLimiter limits to 5 attempts per email per 10 minutes", () => {
    const key = "test_otp_verify@test.com";
    for (let i = 0; i < 5; i++) {
      expect(otpVerifyLimiter.tryAcquire(key)).toBe(true);
    }
    expect(otpVerifyLimiter.tryAcquire(key)).toBe(false);
  });

  it("globalRateLimiter limits to 100 requests per IP per hour", () => {
    const key = "test-global-ip";
    for (let i = 0; i < 100; i++) {
      expect(globalRateLimiter.tryAcquire(key)).toBe(true);
    }
    expect(globalRateLimiter.tryAcquire(key)).toBe(false);
  });
});
