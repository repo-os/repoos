/**
 * Auth persistence layer. Wraps the SQLite database with typed operations
 * for users, sessions, OTP challenges, and audit log entries.
 *
 * All OTP codes and session tokens are stored hashed — plaintext never
 * touches disk.
 */

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { AuthRole } from "./auth.js";
import { hashOtp, hashSessionToken, randomHex, DEFAULT_SESSION_MAX_AGE } from "./auth.js";

let Database: any;
let dbAvailable = false;
const runtimeRequire = createRequire(import.meta.url);

try {
  const g = globalThis as any;
  if (g.Bun && typeof g.Bun === "object") {
    try {
      const sqlite = runtimeRequire("bun:sqlite");
      Database = sqlite.Database;
      dbAvailable = true;
    } catch { /* fall through */ }
  }
  if (!dbAvailable) {
    try {
      const sqlite = runtimeRequire("node:sqlite");
      Database = sqlite.DatabaseSync;
      dbAvailable = true;
    } catch { /* unavailable */ }
  }
} catch { /* degrade */ }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  email: string;
  role: AuthRole;
  displayName: string | null;
  authSource: string;
  addedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionRow {
  sessionId: string;
  tokenHash: string;
  email: string;
  role: AuthRole;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface OtpChallengeRow {
  id: number;
  email: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  sourceIp: string | null;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  targetEmail: string | null;
  actorEmail: string | null;
  details: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

// Safety-net DDL — identical to db.ts migration v2 but ensures auth tables
// exist even if the auth-store is opened before the main DB migration runs.
// All statements use CREATE TABLE IF NOT EXISTS, so this is idempotent.
const AUTH_MIGRATION = `
  CREATE TABLE IF NOT EXISTS auth_users (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'member',
    display_name TEXT,
    auth_source TEXT NOT NULL DEFAULT 'otp',
    added_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(email);

  CREATE TABLE IF NOT EXISTS auth_otp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    source_ip TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auth_otp_email ON auth_otp(email);

  CREATE TABLE IF NOT EXISTS auth_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target_email TEXT,
    actor_email TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class AuthStore {
  private db: any;
  private available: boolean;

  constructor(repoRoot: string) {
    this.available = false;
    if (!dbAvailable || !Database) return;

    try {
      const cacheDir = join(repoRoot, ".repoos");
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      const dbPath = join(cacheDir, "repoos.db");
      this.db = new Database(dbPath);
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA synchronous=NORMAL");
      this.db.exec(AUTH_MIGRATION);
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  // ---- Users ----

  getUser(email: string): AuthUser | null {
    if (!this.available) return null;
    try {
      const rows = this.db.prepare("SELECT * FROM auth_users WHERE email = ?").all(email);
      return rows.length > 0 ? this.toUser(rows[0]) : null;
    } catch {
      return null;
    }
  }

  listUsers(): AuthUser[] {
    if (!this.available) return [];
    try {
      const rows = this.db.prepare("SELECT * FROM auth_users ORDER BY created_at").all();
      return rows.map((r: any) => this.toUser(r));
    } catch {
      return [];
    }
  }

  upsertUser(email: string, role: AuthRole, addedBy: string | null, displayName?: string): void {
    if (!this.available) return;
    try {
      this.db.prepare(`
        INSERT INTO auth_users (email, role, display_name, added_by, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(email) DO UPDATE SET
          role = excluded.role,
          display_name = COALESCE(excluded.display_name, display_name),
          updated_at = datetime('now')
      `).run(email, role, displayName ?? null, addedBy);
    } catch { /* ignore */ }
  }

  deleteUser(email: string): boolean {
    if (!this.available) return false;
    try {
      this.db.prepare("DELETE FROM auth_users WHERE email = ?").run(email);
      return true;
    } catch {
      return false;
    }
  }

  getAdminCount(): number {
    if (!this.available) return 0;
    try {
      const rows = this.db.prepare("SELECT COUNT(*) as cnt FROM auth_users WHERE role = 'admin'").all();
      return (rows[0] as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- Sessions ----

  createSession(email: string, role: AuthRole, maxAgeSeconds: number): string {
    if (!this.available) return "";
    const token = randomHex(32);
    const tokenHash = hashSessionToken(token);
    const sessionId = randomHex(16);
    const now = new Date();
    const expires = new Date(now.getTime() + maxAgeSeconds * 1000);
    try {
      this.db.prepare(`
        INSERT INTO auth_sessions (session_id, token_hash, email, role, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, tokenHash, email, role, now.toISOString(), expires.toISOString());
    } catch { return ""; }
    return token;
  }

  getSession(token: string): AuthSessionRow | null {
    if (!this.available) return null;
    const tokenHash = hashSessionToken(token);
    try {
      const now = new Date().toISOString();
      const rows = this.db.prepare(`
        SELECT * FROM auth_sessions
        WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
      `).all(tokenHash, now);
      return rows.length > 0 ? this.toSession(rows[0]) : null;
    } catch {
      return null;
    }
  }

  revokeSession(token: string): boolean {
    if (!this.available) return false;
    const tokenHash = hashSessionToken(token);
    try {
      this.db.prepare(`
        UPDATE auth_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL
      `).run(tokenHash);
      return true;
    } catch {
      return false;
    }
  }

  revokeAllSessions(email: string): number {
    if (!this.available) return 0;
    try {
      const result = this.db.prepare(`
        UPDATE auth_sessions SET revoked_at = datetime('now')
        WHERE email = ? AND revoked_at IS NULL
      `).run(email);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  /** Update the role column on all active sessions for a user. */
  updateSessionRoles(email: string, newRole: AuthRole): number {
    if (!this.available) return 0;
    try {
      const result = this.db.prepare(`
        UPDATE auth_sessions SET role = ?
        WHERE email = ? AND revoked_at IS NULL
      `).run(newRole, email);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  cleanupExpiredSessions(): number {
    if (!this.available) return 0;
    try {
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        DELETE FROM auth_sessions WHERE expires_at < ?
      `).run(now);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- OTP ----

  /** Store a hashed OTP challenge. Returns the challenge id. */
  createOtpChallenge(email: string, codeHash: string, ttlSeconds: number, sourceIp: string | null): number {
    if (!this.available) return -1;
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    try {
      const result = this.db.prepare(`
        INSERT INTO auth_otp (email, code_hash, created_at, expires_at, source_ip)
        VALUES (?, ?, ?, ?, ?)
      `).run(email, codeHash, now.toISOString(), expires.toISOString(), sourceIp);
      return result.lastInsertRowid ?? -1;
    } catch {
      return -1;
    }
  }

  /** Find a valid, unused OTP for this email. Returns null if none found or expired. */
  findValidOtp(email: string, codeHash: string): OtpChallengeRow | null {
    if (!this.available) return null;
    const now = new Date().toISOString();
    try {
      const rows = this.db.prepare(`
        SELECT * FROM auth_otp
        WHERE email = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).all(email, codeHash, now);
      return rows.length > 0 ? this.toOtp(rows[0]) : null;
    } catch {
      return null;
    }
  }

  /** Mark an OTP as used. */
  markOtpUsed(otpId: number): void {
    if (!this.available) return;
    try {
      this.db.prepare(`
        UPDATE auth_otp SET used_at = datetime('now') WHERE id = ?
      `).run(otpId);
    } catch { /* ignore */ }
  }

  /** Count OTP requests for this email in the given time window. */
  countRecentOtpRequests(email: string, windowSeconds: number): number {
    if (!this.available) return 0;
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
      const rows = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM auth_otp
        WHERE email = ? AND created_at > ?
      `).all(email, cutoff);
      return (rows[0] as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  /** Count failed verify attempts for this email in the given time window. */
  countFailedVerifyAttempts(email: string, windowSeconds: number): number {
    if (!this.available) return 0;
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
      const rows = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM auth_otp
        WHERE email = ? AND created_at > ? AND used_at IS NOT NULL AND code_hash != ''
      `).all(email, cutoff);
      return (rows[0] as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  cleanupExpiredOtps(): number {
    if (!this.available) return 0;
    try {
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        DELETE FROM auth_otp WHERE expires_at < ?
      `).run(now);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- Audit Log ----

  logAudit(action: string, targetEmail: string | null, actorEmail: string | null, details?: string): void {
    if (!this.available) return;
    try {
      this.db.prepare(`
        INSERT INTO auth_audit_log (action, target_email, actor_email, details, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(action, targetEmail, actorEmail, details ?? null);
    } catch { /* ignore */ }
  }

  getAuditLog(limit: number = 50): AuditLogEntry[] {
    if (!this.available) return [];
    try {
      return this.db.prepare(`
        SELECT * FROM auth_audit_log ORDER BY created_at DESC LIMIT ?
      `).all(limit).map((r: any) => this.toAuditEntry(r));
    } catch {
      return [];
    }
  }

  // ---- Row mappers ----

  private toUser(row: any): AuthUser {
    return {
      email: row.email,
      role: row.role,
      displayName: row.display_name,
      authSource: row.auth_source,
      addedBy: row.added_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toSession(row: any): AuthSessionRow {
    return {
      sessionId: row.session_id,
      tokenHash: row.token_hash,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  private toOtp(row: any): OtpChallengeRow {
    return {
      id: row.id,
      email: row.email,
      codeHash: row.code_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      sourceIp: row.source_ip,
    };
  }

  private toAuditEntry(row: any): AuditLogEntry {
    return {
      id: row.id,
      action: row.action,
      targetEmail: row.target_email,
      actorEmail: row.actor_email,
      details: row.details,
      createdAt: row.created_at,
    };
  }

  close(): void {
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
      this.db = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton + periodic cleanup
// ---------------------------------------------------------------------------

let authStoreInstance: AuthStore | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function getAuthStore(repoRoot: string): AuthStore | null {
  if (!authStoreInstance) {
    authStoreInstance = new AuthStore(repoRoot);
  }
  // Start periodic cleanup on first access
  if (!cleanupTimer && authStoreInstance.isAvailable()) {
    cleanupTimer = setInterval(() => {
      if (authStoreInstance?.isAvailable()) {
        authStoreInstance.cleanupExpiredSessions();
        authStoreInstance.cleanupExpiredOtps();
      }
    }, CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is running
    if (cleanupTimer.unref) cleanupTimer.unref();
  }
  return authStoreInstance.isAvailable() ? authStoreInstance : null;
}

export function resetAuthStoreInstance(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (authStoreInstance) {
    authStoreInstance.close();
  }
  authStoreInstance = null;
}
