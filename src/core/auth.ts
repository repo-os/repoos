/**
 * Authentication module for RepoOS.
 *
 * Opt-in, disabled by default. When enabled, protects all UI, API, and SSE
 * routes with server-side sessions and HttpOnly cookies. Supports email OTP
 * (via Resend) and Google OAuth as login methods.
 *
 * Zero runtime dependencies — native crypto, fetch, and SQLite.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Auth config types
// ---------------------------------------------------------------------------

export type AuthRole = "admin" | "member";

export interface AuthEmailProvider {
  type: "resend";
  apiKey: string;
  fromAddress: string;
  /** Display name shown alongside fromAddress (e.g. "RepoOS"). Optional —
   *  without it, mail clients fall back to showing the address's local part. */
  fromName?: string;
}

export interface AuthGoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface AuthConfig {
  enabled: boolean;
  /** Server-side session secret (auto-generated if not provided). Never exposed to browser. */
  sessionSecret?: string;
  /** Session lifetime in seconds. Default 7 days. */
  sessionMaxAge?: number;
  /** Email provider config (required when auth enabled). */
  emailProvider?: AuthEmailProvider;
  /** Google OAuth config (optional). */
  google?: AuthGoogleConfig;
  /** Bootstrap admin email (required on first enable). */
  bootstrapAdmin?: string;
}

// ---------------------------------------------------------------------------
// Crypto utilities
// ---------------------------------------------------------------------------

/** Generate a cryptographically random hex string. */
export function randomHex(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Generate a 6-digit OTP code. */
export function generateOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** SHA-256 hash a string (for OTP storage). */
export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Constant-time string comparison. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Generate a random session token. */
export function generateSessionToken(): string {
  return randomHex(32);
}

/** Hash a session token for storage. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a CSRF-like state parameter for OAuth. */
export function generateOAuthState(): string {
  return randomHex(16);
}

/** Generate a PKCE code verifier (43-128 chars, unreserved chars only). */
export function generatePkceVerifier(): string {
  const buf = randomBytes(32);
  // base64url encode
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hash for PKCE code challenge, base64url encoded. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Session cookie helpers
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "repoos_session";
export const DEFAULT_SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export function buildSessionCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    `Path=/`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.split("=");
    if (key && rest.length) out[key.trim()] = rest.join("=").trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per-process)
// ---------------------------------------------------------------------------

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxAttempts: number;

  constructor(windowMs: number, maxAttempts: number) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
  }

  /** Returns true if the request should be allowed. */
  tryAcquire(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || now > entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.maxAttempts) return false;
    entry.count++;
    return true;
  }

  /** Reset a key (e.g. after successful OTP verify). */
  reset(key: string): void {
    this.entries.delete(key);
  }
}

// OTP request: max 5 per email per 10 minutes
export const otpRequestLimiter = new RateLimiter(10 * 60 * 1000, 5);
// OTP verify: max 5 failed attempts per email per 10 minutes
export const otpVerifyLimiter = new RateLimiter(10 * 60 * 1000, 5);
// Global: max 100 OTP requests per IP per hour
export const globalRateLimiter = new RateLimiter(60 * 60 * 1000, 100);
