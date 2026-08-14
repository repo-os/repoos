/**
 * SQLite database layer for RepoOS.
 *
 * Provides durable storage for session stats (time, tokens, cost) across all
 * agent types. Uses bun:sqlite (Bun) or node:sqlite (Node >= 22), with graceful
 * degradation if neither is available.
 *
 * Zero runtime dependencies — sqlite is a platform builtin.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

let Database: any;
let dbAvailable = false;

// Try to load SQLite. Both Bun and Node 22+ have builtin sqlite support.
// We try Bun first, then fall back to node:sqlite, and gracefully degrade
// if neither is available.
try {
  const global = globalThis as any;
  if (global.Bun && typeof global.Bun === "object") {
    // Running in Bun — use bun:sqlite if available
    try {
      const sqlite = require("bun:sqlite");
      Database = sqlite.Database;
      dbAvailable = true;
    } catch {
      // bun:sqlite not available, try node:sqlite below
    }
  }

  // Fallback to node:sqlite (Node 22+)
  if (!dbAvailable) {
    try {
      const sqlite = require("node:sqlite");
      Database = sqlite.DatabaseSync;
      dbAvailable = true;
    } catch {
      // node:sqlite not available — degrade gracefully
    }
  }
} catch {
  // Any error during initialization — degrade gracefully
}

/** Migration definition: version → SQL. */
interface Migration {
  version: number;
  up: string;
}

/** Schema versions and their migrations. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS sessions (
        sessionId TEXT PRIMARY KEY,
        sessionType TEXT NOT NULL,
        taskId TEXT,
        agent TEXT NOT NULL,
        model TEXT NOT NULL,
        codingAgent TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        elapsedMs INTEGER NOT NULL DEFAULT 0,
        inputTokens INTEGER,
        outputTokens INTEGER,
        totalTokens INTEGER,
        costUsd REAL,
        costSource TEXT NOT NULL DEFAULT 'none',
        status TEXT NOT NULL DEFAULT 'active',
        lastActivityAt TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_taskId ON sessions(taskId);
      CREATE INDEX IF NOT EXISTS idx_sessions_sessionType ON sessions(sessionType);
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent);
      CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
      CREATE INDEX IF NOT EXISTS idx_sessions_startedAt ON sessions(startedAt);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
];

/** Singleton database instance. */
let dbInstance: RepoOSDb | null = null;

/** Query result for a session. */
export interface SessionRecord {
  sessionId: string;
  sessionType: string;
  taskId: string | null;
  agent: string;
  model: string;
  codingAgent: string;
  startedAt: string;
  endedAt: string | null;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  costSource: string;
  status: string;
  lastActivityAt: string;
}

/** Aggregation: per-task total stats. */
export interface TaskStats {
  taskId: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
}

/** Aggregation: per-session-type total stats. */
export interface SessionTypeStats {
  sessionType: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
}

/** Board-level summary stats. */
export interface BoardStats {
  totalSessions: number;
  totalElapsedMs: number;
  totalTokens: number | null;
  totalCostUsd: number | null;
  mostExpensiveSession: SessionRecord | null;
  mostExpensiveTask: { taskId: string; costUsd: number } | null;
}

/** Database wrapper providing high-level operations. */
export class RepoOSDb {
  private db: any;
  private available: boolean;

  /**
   * Open or create the database. If SQLite is not available, sets available=false
   * and all operations become no-ops (fail-soft).
   */
  constructor(repoRoot: string) {
    this.available = false;
    if (!dbAvailable || !Database) return;

    try {
      const cacheDir = join(repoRoot, ".repoos");
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      const dbPath = join(cacheDir, "repoos.db");
      this.db = new Database(dbPath, { mode: "rwc" });

      // Enable WAL mode for better concurrency
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA synchronous=NORMAL");

      this.runMigrations();
      this.available = true;
    } catch {
      // Initialization failed — graceful degradation
    }
  }

  private runMigrations(): void {
    if (!this.available || !this.db) return;
    try {
      // Get current schema version
      try {
        const result = this.db.query("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").all();
        const currentVersion = result.length > 0 ? (result[0] as { version: number }).version : 0;

        // Apply missing migrations
        for (const migration of MIGRATIONS) {
          if (migration.version > currentVersion) {
            this.db.exec(migration.up);
            this.db.exec(`INSERT INTO schema_version (version) VALUES (${migration.version})`);
          }
        }
      } catch {
        // Table doesn't exist yet, run all migrations
        for (const migration of MIGRATIONS) {
          this.db.exec(migration.up);
          this.db.exec(`INSERT INTO schema_version (version) VALUES (${migration.version})`);
        }
      }
    } catch {
      // Migration failed — log and continue
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Create or update a session record. The sessionId is unique; multiple turns
   * update the same record (idempotent).
   */
  upsertSession(session: {
    sessionId: string;
    sessionType: string;
    taskId?: string | null;
    agent: string;
    model: string;
    codingAgent: string;
    startedAt: string;
    endedAt?: string | null;
    elapsedMs: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    costUsd?: number | null;
    costSource?: string;
    status?: string;
    lastActivityAt: string;
  }): void {
    if (!this.available || !this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (
          sessionId, sessionType, taskId, agent, model, codingAgent,
          startedAt, endedAt, elapsedMs, inputTokens, outputTokens, totalTokens,
          costUsd, costSource, status, lastActivityAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(sessionId) DO UPDATE SET
          endedAt = excluded.endedAt,
          elapsedMs = excluded.elapsedMs,
          inputTokens = COALESCE(excluded.inputTokens, inputTokens),
          outputTokens = COALESCE(excluded.outputTokens, outputTokens),
          totalTokens = COALESCE(excluded.totalTokens, totalTokens),
          costUsd = COALESCE(excluded.costUsd, costUsd),
          costSource = excluded.costSource,
          status = excluded.status,
          lastActivityAt = excluded.lastActivityAt,
          updatedAt = datetime('now')
      `);

      stmt.run(
        session.sessionId,
        session.sessionType,
        session.taskId ?? null,
        session.agent,
        session.model,
        session.codingAgent,
        session.startedAt,
        session.endedAt ?? null,
        session.elapsedMs,
        session.inputTokens ?? null,
        session.outputTokens ?? null,
        session.totalTokens ?? null,
        session.costUsd ?? null,
        session.costSource ?? "none",
        session.status ?? "active",
        session.lastActivityAt,
      );
    } catch {
      // Operation failed — continue gracefully
    }
  }

  /** Retrieve a session record by ID. */
  getSession(sessionId: string): SessionRecord | null {
    if (!this.available || !this.db) return null;
    try {
      const result = this.db.query("SELECT * FROM sessions WHERE sessionId = ?").all(sessionId);
      return result.length > 0 ? (result[0] as SessionRecord) : null;
    } catch {
      return null;
    }
  }

  /** Retrieve all sessions for a task. */
  getTaskSessions(taskId: string): SessionRecord[] {
    if (!this.available || !this.db) return [];
    try {
      return this.db.query("SELECT * FROM sessions WHERE taskId = ? ORDER BY startedAt DESC").all(taskId) as SessionRecord[];
    } catch {
      return [];
    }
  }

  /** Aggregate stats for a task (all sessions and review rounds). */
  getTaskStats(taskId: string): TaskStats | null {
    if (!this.available || !this.db) return null;
    try {
      const result = this.db.query(`
        SELECT
          ? as taskId,
          COUNT(*) as totalSessions,
          COALESCE(SUM(elapsedMs), 0) as totalElapsedMs,
          SUM(CASE WHEN inputTokens IS NOT NULL THEN inputTokens ELSE 0 END) as totalInputTokens,
          SUM(CASE WHEN outputTokens IS NOT NULL THEN outputTokens ELSE 0 END) as totalOutputTokens,
          SUM(CASE WHEN totalTokens IS NOT NULL THEN totalTokens ELSE 0 END) as totalTokens,
          SUM(CASE WHEN costUsd IS NOT NULL THEN costUsd ELSE 0 END) as totalCostUsd
        FROM sessions
        WHERE taskId = ?
      `).all(taskId, taskId);

      if (result.length > 0) {
        const row = result[0] as any;
        return {
          taskId,
          totalSessions: row.totalSessions || 0,
          totalElapsedMs: row.totalElapsedMs || 0,
          totalInputTokens: row.totalInputTokens || null,
          totalOutputTokens: row.totalOutputTokens || null,
          totalTokens: row.totalTokens || null,
          totalCostUsd: row.totalCostUsd || null,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Aggregate stats grouped by session type. */
  getSessionTypeStats(): SessionTypeStats[] {
    if (!this.available || !this.db) return [];
    try {
      return this.db.query(`
        SELECT
          sessionType,
          COUNT(*) as totalSessions,
          COALESCE(SUM(elapsedMs), 0) as totalElapsedMs,
          SUM(CASE WHEN inputTokens IS NOT NULL THEN inputTokens ELSE 0 END) as totalInputTokens,
          SUM(CASE WHEN outputTokens IS NOT NULL THEN outputTokens ELSE 0 END) as totalOutputTokens,
          SUM(CASE WHEN totalTokens IS NOT NULL THEN totalTokens ELSE 0 END) as totalTokens,
          SUM(CASE WHEN costUsd IS NOT NULL THEN costUsd ELSE 0 END) as totalCostUsd
        FROM sessions
        GROUP BY sessionType
        ORDER BY totalCostUsd DESC NULLS LAST
      `).all() as SessionTypeStats[];
    } catch {
      return [];
    }
  }

  /** Board-level summary: total spend, tokens, time, most expensive session/task. */
  getBoardStats(): BoardStats {
    if (!this.available || !this.db) {
      return {
        totalSessions: 0,
        totalElapsedMs: 0,
        totalTokens: null,
        totalCostUsd: null,
        mostExpensiveSession: null,
        mostExpensiveTask: null,
      };
    }

    try {
      const summary = this.db.query(`
        SELECT
          COUNT(*) as totalSessions,
          COALESCE(SUM(elapsedMs), 0) as totalElapsedMs,
          SUM(CASE WHEN totalTokens IS NOT NULL THEN totalTokens ELSE 0 END) as totalTokens,
          SUM(CASE WHEN costUsd IS NOT NULL THEN costUsd ELSE 0 END) as totalCostUsd
        FROM sessions
      `).all()[0] as any;

      const mostExpensive = this.db.query(`
        SELECT * FROM sessions
        WHERE costUsd IS NOT NULL
        ORDER BY costUsd DESC
        LIMIT 1
      `).all();
      const mostExpensiveSession = mostExpensive.length > 0 ? (mostExpensive[0] as SessionRecord) : null;

      const mostExpensiveTaskResult = this.db.query(`
        SELECT
          taskId,
          SUM(CASE WHEN costUsd IS NOT NULL THEN costUsd ELSE 0 END) as costUsd
        FROM sessions
        WHERE taskId IS NOT NULL
        GROUP BY taskId
        ORDER BY costUsd DESC
        LIMIT 1
      `).all();
      const mostExpensiveTask =
        mostExpensiveTaskResult.length > 0
          ? { taskId: (mostExpensiveTaskResult[0] as any).taskId, costUsd: (mostExpensiveTaskResult[0] as any).costUsd }
          : null;

      return {
        totalSessions: summary.totalSessions || 0,
        totalElapsedMs: summary.totalElapsedMs || 0,
        totalTokens: summary.totalTokens || null,
        totalCostUsd: summary.totalCostUsd || null,
        mostExpensiveSession,
        mostExpensiveTask,
      };
    } catch {
      return {
        totalSessions: 0,
        totalElapsedMs: 0,
        totalTokens: null,
        totalCostUsd: null,
        mostExpensiveSession: null,
        mostExpensiveTask: null,
      };
    }
  }

  /** Close the database connection. */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Already closed or error during close
      }
      this.db = null;
    }
  }
}

/**
 * Get or create the singleton database instance for a repo root.
 * Returns null if SQLite is not available (graceful degradation).
 */
export function getRepoOSDb(repoRoot: string): RepoOSDb | null {
  if (!dbInstance) {
    dbInstance = new RepoOSDb(repoRoot);
  }
  return dbInstance.isAvailable() ? dbInstance : null;
}

/** Reset the singleton (for tests). */
export function resetDbInstance(): void {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = null;
}

/** Convenience function to get task stats from the singleton database. */
export function getTaskStats(repoRoot: string, taskId: string): TaskStats | null {
  const db = getRepoOSDb(repoRoot);
  return db?.getTaskStats(taskId) ?? null;
}

/** Convenience function to get session type stats from the singleton database. */
export function getSessionTypeStats(repoRoot: string): SessionTypeStats[] {
  const db = getRepoOSDb(repoRoot);
  return db?.getSessionTypeStats() ?? [];
}

/** Convenience function to get board stats from the singleton database. */
export function getBoardStats(repoRoot: string): BoardStats {
  const db = getRepoOSDb(repoRoot);
  return db?.getBoardStats() ?? {
    totalSessions: 0,
    totalElapsedMs: 0,
    totalTokens: null,
    totalCostUsd: null,
    mostExpensiveSession: null,
    mostExpensiveTask: null,
  };
}
