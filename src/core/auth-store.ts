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
import type { HubCapability } from "./hub-capabilities.js";

let Database: any;
let dbAvailable = false;
let sqliteLoadAttempted = false;
const runtimeRequire = createRequire(import.meta.url);

/**
 * Load SQLite on first actual use, not at module import time — see the
 * matching comment in db.ts for why (this module is on the same
 * nearly-every-command import path, so requiring node:sqlite eagerly here
 * would print its ExperimentalWarning before the CLI even dispatches).
 */
function loadSqlite(): void {
  if (sqliteLoadAttempted) return;
  sqliteLoadAttempted = true;
  try {
    const g = globalThis as any;
    if (g.Bun && typeof g.Bun === "object") {
      try {
        const sqlite = runtimeRequire("bun:sqlite");
        Database = sqlite.Database;
        dbAvailable = true;
      } catch {
        /* fall through */
      }
    }
    if (!dbAvailable) {
      try {
        const sqlite = runtimeRequire("node:sqlite");
        Database = sqlite.DatabaseSync;
        dbAvailable = true;
      } catch {
        /* unavailable */
      }
    }
  } catch {
    /* degrade */
  }
}

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

export interface TelegramUserLink {
  telegramUserId: number;
  email: string;
  telegramUsername: string | null;
  boundAt: string;
  boundBy: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface TelegramChatLink {
  telegramChatId: number;
  chatType: string;
  title: string | null;
  boundAt: string;
  boundBy: string;
  revokedAt: string | null;
}

export interface TelegramChatBindInvite {
  nonceHash: string;
  repoIdentity: string;
  instanceIdentity: string;
  mac: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedChatId: number | null;
}

export interface TelegramLinkInvite {
  nonceHash: string;
  email: string;
  repoIdentity: string;
  instanceIdentity: string;
  mac: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
}

interface HubCapabilityRow {
  id: string;
  label: string;
  owner_email: string;
  token_hash: string;
  origin: string;
  audience: string;
  scope: string;
  version: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
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

  CREATE TABLE IF NOT EXISTS auth_hub_capabilities (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    origin TEXT NOT NULL,
    audience TEXT NOT NULL,
    scope TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_auth_hub_capabilities_owner ON auth_hub_capabilities(owner_email);
  CREATE INDEX IF NOT EXISTS idx_auth_hub_capabilities_token ON auth_hub_capabilities(token_hash);

  -- Telegram numeric user IDs bound to allowlisted emails. No FK to
  -- auth_users: deleting an allowlist row must leave the link inert, not
  -- cascade-delete it (ADR 0007). Enforce presence of the email at bind time
  -- in application code. telegram_username is display-only.
  CREATE TABLE IF NOT EXISTS telegram_user_links (
    telegram_user_id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    telegram_username TEXT,
    bound_at TEXT NOT NULL,
    bound_by TEXT,
    last_seen_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_user_links_email ON telegram_user_links(email);

  CREATE TABLE IF NOT EXISTS telegram_link_invites (
    nonce_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    repo_identity TEXT NOT NULL,
    instance_identity TEXT NOT NULL,
    mac TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    redeemed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_link_invites_email ON telegram_link_invites(email);

  -- Approved Telegram destinations for this repository (routing only; ADR 0007).
  CREATE TABLE IF NOT EXISTS telegram_chat_links (
    telegram_chat_id INTEGER PRIMARY KEY,
    chat_type TEXT NOT NULL,
    title TEXT,
    bound_at TEXT NOT NULL,
    bound_by TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS telegram_chat_bind_invites (
    nonce_hash TEXT PRIMARY KEY,
    repo_identity TEXT NOT NULL,
    instance_identity TEXT NOT NULL,
    mac TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_chat_id INTEGER
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
    loadSqlite();
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
      this.db
        .prepare(`
        INSERT INTO auth_users (email, role, display_name, added_by, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(email) DO UPDATE SET
          role = excluded.role,
          display_name = COALESCE(excluded.display_name, display_name),
          updated_at = datetime('now')
      `)
        .run(email, role, displayName ?? null, addedBy);
    } catch {
      /* ignore */
    }
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
      const rows = this.db
        .prepare("SELECT COUNT(*) as cnt FROM auth_users WHERE role = 'admin'")
        .all();
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
      this.db
        .prepare(`
        INSERT INTO auth_sessions (session_id, token_hash, email, role, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .run(sessionId, tokenHash, email, role, now.toISOString(), expires.toISOString());
    } catch {
      return "";
    }
    return token;
  }

  getSession(token: string): AuthSessionRow | null {
    if (!this.available) return null;
    const tokenHash = hashSessionToken(token);
    try {
      const now = new Date().toISOString();
      const rows = this.db
        .prepare(`
        SELECT * FROM auth_sessions
        WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
      `)
        .all(tokenHash, now);
      return rows.length > 0 ? this.toSession(rows[0]) : null;
    } catch {
      return null;
    }
  }

  revokeSession(token: string): boolean {
    if (!this.available) return false;
    const tokenHash = hashSessionToken(token);
    try {
      this.db
        .prepare(`
        UPDATE auth_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL
      `)
        .run(tokenHash);
      return true;
    } catch {
      return false;
    }
  }

  revokeAllSessions(email: string): number {
    if (!this.available) return 0;
    try {
      const result = this.db
        .prepare(`
        UPDATE auth_sessions SET revoked_at = datetime('now')
        WHERE email = ? AND revoked_at IS NULL
      `)
        .run(email);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  /** Update the role column on all active sessions for a user. */
  updateSessionRoles(email: string, newRole: AuthRole): number {
    if (!this.available) return 0;
    try {
      const result = this.db
        .prepare(`
        UPDATE auth_sessions SET role = ?
        WHERE email = ? AND revoked_at IS NULL
      `)
        .run(newRole, email);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  cleanupExpiredSessions(): number {
    if (!this.available) return 0;
    try {
      const now = new Date().toISOString();
      const result = this.db
        .prepare(`
        DELETE FROM auth_sessions WHERE expires_at < ?
      `)
        .run(now);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- OTP ----

  /** Store a hashed OTP challenge. Returns the challenge id. */
  createOtpChallenge(
    email: string,
    codeHash: string,
    ttlSeconds: number,
    sourceIp: string | null,
  ): number {
    if (!this.available) return -1;
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    try {
      const result = this.db
        .prepare(`
        INSERT INTO auth_otp (email, code_hash, created_at, expires_at, source_ip)
        VALUES (?, ?, ?, ?, ?)
      `)
        .run(email, codeHash, now.toISOString(), expires.toISOString(), sourceIp);
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
      const rows = this.db
        .prepare(`
        SELECT * FROM auth_otp
        WHERE email = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
      `)
        .all(email, codeHash, now);
      return rows.length > 0 ? this.toOtp(rows[0]) : null;
    } catch {
      return null;
    }
  }

  /** Mark an OTP as used. */
  markOtpUsed(otpId: number): void {
    if (!this.available) return;
    try {
      this.db
        .prepare(`
        UPDATE auth_otp SET used_at = datetime('now') WHERE id = ?
      `)
        .run(otpId);
    } catch {
      /* ignore */
    }
  }

  /** Count OTP requests for this email in the given time window. */
  countRecentOtpRequests(email: string, windowSeconds: number): number {
    if (!this.available) return 0;
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
      const rows = this.db
        .prepare(`
        SELECT COUNT(*) as cnt FROM auth_otp
        WHERE email = ? AND created_at > ?
      `)
        .all(email, cutoff);
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
      const rows = this.db
        .prepare(`
        SELECT COUNT(*) as cnt FROM auth_otp
        WHERE email = ? AND created_at > ? AND used_at IS NOT NULL AND code_hash != ''
      `)
        .all(email, cutoff);
      return (rows[0] as any)?.cnt ?? 0;
    } catch {
      return 0;
    }
  }

  cleanupExpiredOtps(): number {
    if (!this.available) return 0;
    try {
      const now = new Date().toISOString();
      const result = this.db
        .prepare(`
        DELETE FROM auth_otp WHERE expires_at < ?
      `)
        .run(now);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- Audit Log ----

  logAudit(
    action: string,
    targetEmail: string | null,
    actorEmail: string | null,
    details?: string,
  ): void {
    if (!this.available) return;
    try {
      this.db
        .prepare(`
        INSERT INTO auth_audit_log (action, target_email, actor_email, details, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `)
        .run(action, targetEmail, actorEmail, details ?? null);
    } catch {
      /* ignore */
    }
  }

  /** Like logAudit, but required for lifecycle events that must not report success without a row. */
  logAuditRequired(
    action: string,
    targetEmail: string | null,
    actorEmail: string | null,
    details?: string,
  ): void {
    if (!this.available) {
      throw new Error("auth store is not available");
    }
    try {
      this.db
        .prepare(`
        INSERT INTO auth_audit_log (action, target_email, actor_email, details, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `)
        .run(action, targetEmail, actorEmail, details ?? null);
    } catch (e) {
      throw new Error(
        `failed to write audit log (${action}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  getAuditLog(limit: number = 50): AuditLogEntry[] {
    if (!this.available) return [];
    try {
      return this.db
        .prepare(`
        SELECT * FROM auth_audit_log ORDER BY created_at DESC LIMIT ?
      `)
        .all(limit)
        .map((r: any) => this.toAuditEntry(r));
    } catch {
      return [];
    }
  }

  // ---- Native Hub capabilities ----

  createHubCapability(
    input: Omit<HubCapability, "tokenHash" | "revokedAt" | "lastUsedAt"> & { tokenHash: string },
  ): void {
    if (!this.available) return;
    try {
      this.db
        .prepare(`
        INSERT INTO auth_hub_capabilities
          (id, label, owner_email, token_hash, origin, audience, scope, version, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          input.id,
          input.label,
          input.ownerEmail,
          input.tokenHash,
          input.origin,
          input.audience,
          input.scope,
          input.version,
          input.createdAt,
          input.expiresAt,
        );
    } catch {
      /* ignore */
    }
  }

  getHubCapabilityByToken(token: string): HubCapability | null {
    if (!this.available) return null;
    try {
      const rows = this.db
        .prepare(`
        SELECT * FROM auth_hub_capabilities
        WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
      `)
        .all(hashSessionToken(token), new Date().toISOString());
      return rows.length ? this.toHubCapability(rows[0]) : null;
    } catch {
      return null;
    }
  }

  listHubCapabilities(ownerEmail?: string): HubCapability[] {
    if (!this.available) return [];
    try {
      const rows = ownerEmail
        ? this.db
            .prepare(
              "SELECT * FROM auth_hub_capabilities WHERE owner_email = ? ORDER BY created_at DESC",
            )
            .all(ownerEmail)
        : this.db.prepare("SELECT * FROM auth_hub_capabilities ORDER BY created_at DESC").all();
      return rows.map((row: HubCapabilityRow) => this.toHubCapability(row));
    } catch {
      return [];
    }
  }

  getHubCapability(id: string): HubCapability | null {
    if (!this.available) return null;
    try {
      const rows = this.db.prepare("SELECT * FROM auth_hub_capabilities WHERE id = ?").all(id);
      return rows.length ? this.toHubCapability(rows[0]) : null;
    } catch {
      return null;
    }
  }

  revokeHubCapability(id: string): boolean {
    if (!this.available) return false;
    try {
      const result = this.db
        .prepare(`
        UPDATE auth_hub_capabilities SET revoked_at = datetime('now')
        WHERE id = ? AND revoked_at IS NULL
      `)
        .run(id);
      return (result.changes ?? 0) > 0;
    } catch {
      return false;
    }
  }

  markHubCapabilityUsed(id: string): void {
    if (!this.available) return;
    try {
      this.db
        .prepare("UPDATE auth_hub_capabilities SET last_used_at = datetime('now') WHERE id = ?")
        .run(id);
    } catch {
      /* ignore */
    }
  }

  // ---- Telegram user links + invites ----

  getTelegramLink(telegramUserId: number): TelegramUserLink | null {
    if (!this.available) return null;
    try {
      const rows = this.db
        .prepare("SELECT * FROM telegram_user_links WHERE telegram_user_id = ?")
        .all(telegramUserId);
      return rows.length > 0 ? this.toTelegramLink(rows[0]) : null;
    } catch {
      return null;
    }
  }

  listTelegramLinks(): TelegramUserLink[] {
    if (!this.available) return [];
    try {
      return this.db
        .prepare(
          "SELECT * FROM telegram_user_links WHERE revoked_at IS NULL ORDER BY bound_at DESC",
        )
        .all()
        .map((row: Record<string, unknown>) => this.toTelegramLink(row));
    } catch {
      return [];
    }
  }

  upsertTelegramLink(link: TelegramUserLink): boolean {
    if (!this.available) return false;
    try {
      this.db
        .prepare(`
        INSERT INTO telegram_user_links (
          telegram_user_id, email, telegram_username, bound_at, bound_by, last_seen_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(telegram_user_id) DO UPDATE SET
          email = excluded.email,
          telegram_username = excluded.telegram_username,
          bound_at = excluded.bound_at,
          bound_by = excluded.bound_by,
          last_seen_at = excluded.last_seen_at,
          revoked_at = excluded.revoked_at
      `)
        .run(
          link.telegramUserId,
          link.email,
          link.telegramUsername,
          link.boundAt,
          link.boundBy,
          link.lastSeenAt,
          link.revokedAt,
        );
      return true;
    } catch {
      return false;
    }
  }

  touchTelegramLinkSeen(telegramUserId: number, seenAt: string): void {
    if (!this.available) return;
    try {
      this.db
        .prepare(
          `UPDATE telegram_user_links SET last_seen_at = ?
           WHERE telegram_user_id = ? AND revoked_at IS NULL`,
        )
        .run(seenAt, telegramUserId);
    } catch {
      /* ignore */
    }
  }

  revokeTelegramLink(telegramUserId: number, revokedAt: string): boolean {
    if (!this.available) return false;
    try {
      const result = this.db
        .prepare(
          `UPDATE telegram_user_links SET revoked_at = ?
           WHERE telegram_user_id = ? AND revoked_at IS NULL`,
        )
        .run(revokedAt, telegramUserId);
      return (result.changes ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Revokes every active user link in this repository's database. Rows are not
   * filtered by instance id — isolation is one `.repoos/repoos.db` per checkout.
   */
  revokeAllActiveTelegramUserLinks(revokedAt: string): number {
    if (!this.available) {
      throw new Error("auth store is not available");
    }
    try {
      const result = this.db
        .prepare(
          `UPDATE telegram_user_links SET revoked_at = ?
           WHERE revoked_at IS NULL`,
        )
        .run(revokedAt);
      return result.changes ?? 0;
    } catch (e) {
      throw new Error("failed to revoke Telegram user links", { cause: e });
    }
  }

  insertTelegramInvite(invite: TelegramLinkInvite): boolean {
    if (!this.available) return false;
    try {
      this.db
        .prepare(`
        INSERT INTO telegram_link_invites (
          nonce_hash, email, repo_identity, instance_identity, mac,
          created_by, created_at, expires_at, redeemed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
        .run(
          invite.nonceHash,
          invite.email,
          invite.repoIdentity,
          invite.instanceIdentity,
          invite.mac,
          invite.createdBy,
          invite.createdAt,
          invite.expiresAt,
        );
      return true;
    } catch {
      return false;
    }
  }

  getTelegramInviteByNonceHash(nonceHash: string): TelegramLinkInvite | null {
    if (!this.available) return null;
    try {
      const rows = this.db
        .prepare("SELECT * FROM telegram_link_invites WHERE nonce_hash = ?")
        .all(nonceHash);
      return rows.length > 0 ? this.toTelegramInvite(rows[0]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Mark an unused invite redeemed. Returns false if the row is missing,
   * already redeemed, or the write fails — callers treat all as replay.
   */
  markTelegramInviteRedeemed(nonceHash: string, redeemedAt: string): boolean {
    if (!this.available) return false;
    try {
      const result = this.db
        .prepare(
          `UPDATE telegram_link_invites SET redeemed_at = ?
           WHERE nonce_hash = ? AND redeemed_at IS NULL`,
        )
        .run(redeemedAt, nonceHash);
      return (result.changes ?? 0) > 0;
    } catch {
      return false;
    }
  }

  cleanupExpiredTelegramInvites(): number {
    if (!this.available) return 0;
    try {
      const now = new Date().toISOString();
      const result = this.db
        .prepare(
          `DELETE FROM telegram_link_invites
           WHERE expires_at < ? AND redeemed_at IS NULL`,
        )
        .run(now);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- Telegram chat links + bind invites ----

  getTelegramChatLink(telegramChatId: number): TelegramChatLink | null {
    if (!this.available) return null;
    try {
      const rows = this.db
        .prepare("SELECT * FROM telegram_chat_links WHERE telegram_chat_id = ?")
        .all(telegramChatId);
      return rows.length > 0 ? this.toTelegramChatLink(rows[0]) : null;
    } catch {
      return null;
    }
  }

  listTelegramChatLinks(): TelegramChatLink[] {
    if (!this.available) return [];
    try {
      return this.db
        .prepare(
          "SELECT * FROM telegram_chat_links WHERE revoked_at IS NULL ORDER BY bound_at DESC",
        )
        .all()
        .map((row: Record<string, unknown>) => this.toTelegramChatLink(row));
    } catch {
      return [];
    }
  }

  upsertTelegramChatLink(link: TelegramChatLink): boolean {
    if (!this.available) return false;
    try {
      this.db
        .prepare(`
        INSERT INTO telegram_chat_links (
          telegram_chat_id, chat_type, title, bound_at, bound_by, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(telegram_chat_id) DO UPDATE SET
          chat_type = excluded.chat_type,
          title = excluded.title,
          bound_at = excluded.bound_at,
          bound_by = excluded.bound_by,
          revoked_at = excluded.revoked_at
      `)
        .run(
          link.telegramChatId,
          link.chatType,
          link.title,
          link.boundAt,
          link.boundBy,
          link.revokedAt,
        );
      return true;
    } catch {
      return false;
    }
  }

  revokeTelegramChatLink(telegramChatId: number, revokedAt: string): boolean {
    if (!this.available) return false;
    try {
      const result = this.db
        .prepare(
          `UPDATE telegram_chat_links SET revoked_at = ?
           WHERE telegram_chat_id = ? AND revoked_at IS NULL`,
        )
        .run(revokedAt, telegramChatId);
      return (result.changes ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /** Same scoping model as {@link revokeAllActiveTelegramUserLinks}. */
  revokeAllActiveTelegramChatLinks(revokedAt: string): number {
    if (!this.available) {
      throw new Error("auth store is not available");
    }
    try {
      const result = this.db
        .prepare(
          `UPDATE telegram_chat_links SET revoked_at = ?
           WHERE revoked_at IS NULL`,
        )
        .run(revokedAt);
      return result.changes ?? 0;
    } catch (e) {
      throw new Error("failed to revoke Telegram chat links", { cause: e });
    }
  }

  deleteTelegramUserInvitesForInstance(instanceIdentity: string): number {
    if (!this.available) {
      throw new Error("auth store is not available");
    }
    try {
      const result = this.db
        .prepare(`DELETE FROM telegram_link_invites WHERE instance_identity = ?`)
        .run(instanceIdentity);
      return result.changes ?? 0;
    } catch (e) {
      throw new Error("failed to delete Telegram user invites", { cause: e });
    }
  }

  deleteTelegramChatBindInvitesForInstance(instanceIdentity: string): number {
    if (!this.available) {
      throw new Error("auth store is not available");
    }
    try {
      const result = this.db
        .prepare(`DELETE FROM telegram_chat_bind_invites WHERE instance_identity = ?`)
        .run(instanceIdentity);
      return result.changes ?? 0;
    } catch (e) {
      throw new Error("failed to delete Telegram chat bind invites", { cause: e });
    }
  }

  insertTelegramChatBindInvite(invite: TelegramChatBindInvite): boolean {
    if (!this.available) return false;
    try {
      this.db
        .prepare(`
        INSERT INTO telegram_chat_bind_invites (
          nonce_hash, repo_identity, instance_identity, mac,
          created_by, created_at, expires_at, redeemed_at, redeemed_chat_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `)
        .run(
          invite.nonceHash,
          invite.repoIdentity,
          invite.instanceIdentity,
          invite.mac,
          invite.createdBy,
          invite.createdAt,
          invite.expiresAt,
        );
      return true;
    } catch {
      return false;
    }
  }

  getTelegramChatBindInviteByNonceHash(nonceHash: string): TelegramChatBindInvite | null {
    if (!this.available) return null;
    try {
      const rows = this.db
        .prepare("SELECT * FROM telegram_chat_bind_invites WHERE nonce_hash = ?")
        .all(nonceHash);
      return rows.length > 0 ? this.toTelegramChatBindInvite(rows[0]) : null;
    } catch {
      return null;
    }
  }

  markTelegramChatBindInviteRedeemed(
    nonceHash: string,
    redeemedAt: string,
    redeemedChatId: number,
  ): boolean {
    if (!this.available) return false;
    try {
      const result = this.db
        .prepare(
          `UPDATE telegram_chat_bind_invites SET redeemed_at = ?, redeemed_chat_id = ?
           WHERE nonce_hash = ? AND redeemed_at IS NULL`,
        )
        .run(redeemedAt, redeemedChatId, nonceHash);
      return (result.changes ?? 0) > 0;
    } catch {
      return false;
    }
  }

  cleanupExpiredTelegramChatBindInvites(): number {
    if (!this.available) return 0;
    try {
      const now = new Date().toISOString();
      const result = this.db
        .prepare(
          `DELETE FROM telegram_chat_bind_invites
           WHERE expires_at < ? AND redeemed_at IS NULL`,
        )
        .run(now);
      return result.changes ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Run `fn` inside BEGIN IMMEDIATE so invite redeem cannot race a second
   * /start into a double bind. Nested calls are not supported — later
   * Telegram intake (#0532/#0534) must not wrap redeemTelegramInvite in
   * another transaction.
   */
  withImmediateTransaction<T>(fn: () => T): T {
    if (!this.available) throw new Error("Auth store unavailable");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  private toHubCapability(row: HubCapabilityRow): HubCapability {
    return {
      id: row.id,
      label: row.label,
      ownerEmail: row.owner_email,
      tokenHash: row.token_hash,
      origin: row.origin,
      audience: row.audience as HubCapability["audience"],
      scope: row.scope as HubCapability["scope"],
      version: row.version as HubCapability["version"],
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
    };
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

  private toTelegramLink(row: any): TelegramUserLink {
    return {
      telegramUserId: Number(row.telegram_user_id),
      email: row.email,
      telegramUsername: row.telegram_username ?? null,
      boundAt: row.bound_at,
      boundBy: row.bound_by ?? null,
      lastSeenAt: row.last_seen_at ?? null,
      revokedAt: row.revoked_at ?? null,
    };
  }

  private toTelegramInvite(row: any): TelegramLinkInvite {
    return {
      nonceHash: row.nonce_hash,
      email: row.email,
      repoIdentity: row.repo_identity,
      instanceIdentity: row.instance_identity,
      mac: row.mac,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at ?? null,
    };
  }

  private toTelegramChatLink(row: any): TelegramChatLink {
    return {
      telegramChatId: Number(row.telegram_chat_id),
      chatType: row.chat_type,
      title: row.title ?? null,
      boundAt: row.bound_at,
      boundBy: row.bound_by,
      revokedAt: row.revoked_at ?? null,
    };
  }

  private toTelegramChatBindInvite(row: any): TelegramChatBindInvite {
    return {
      nonceHash: row.nonce_hash,
      repoIdentity: row.repo_identity,
      instanceIdentity: row.instance_identity,
      mac: row.mac,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at ?? null,
      redeemedChatId:
        row.redeemed_chat_id != null && row.redeemed_chat_id !== ""
          ? Number(row.redeemed_chat_id)
          : null,
    };
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* ignore */
      }
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
        authStoreInstance.cleanupExpiredTelegramInvites();
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
