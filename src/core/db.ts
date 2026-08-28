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
import { createRequire } from "node:module";
import { join } from "node:path";

let Database: any;
let dbAvailable = false;
let sqliteLoadAttempted = false;
// RepoOS is ESM, so the CommonJS global `require` is not available. Create a
// local resolver for optional runtime builtins instead; otherwise telemetry
// silently degrades even on Node versions that provide `node:sqlite`.
const runtimeRequire = createRequire(import.meta.url);

/**
 * Load SQLite on first actual use, not at module import time. Node prints an
 * ExperimentalWarning the moment `node:sqlite` is required on some Node
 * versions — since this module is reachable from nearly every command's
 * import graph, requiring it eagerly at the top of the file would fire that
 * warning before the CLI even dispatches to a command, before anything has
 * a chance to suppress it. Both Bun and Node 22+ have builtin sqlite support;
 * we try Bun first, then fall back to node:sqlite, and gracefully degrade if
 * neither is available.
 */
function loadSqlite(): void {
  if (sqliteLoadAttempted) return;
  sqliteLoadAttempted = true;
  try {
    const global = globalThis as any;
    if (global.Bun && typeof global.Bun === "object") {
      // Running in Bun — use bun:sqlite if available
      try {
        const sqlite = runtimeRequire("bun:sqlite");
        Database = sqlite.Database;
        dbAvailable = true;
      } catch {
        // bun:sqlite not available, try node:sqlite below
      }
    }

    // Fallback to node:sqlite (Node 22+)
    if (!dbAvailable) {
      try {
        const sqlite = runtimeRequire("node:sqlite");
        Database = sqlite.DatabaseSync;
        dbAvailable = true;
      } catch {
        // node:sqlite not available — degrade gracefully
      }
    }
  } catch {
    // Any error during initialization — degrade gracefully
  }
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
  {
    version: 2,
    up: `
      -- Allowed users with roles
      CREATE TABLE IF NOT EXISTS auth_users (
        email TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'member',
        display_name TEXT,
        auth_source TEXT NOT NULL DEFAULT 'otp',
        added_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Server-side sessions (hashed tokens)
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

      -- OTP challenges (hashed codes)
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

      -- Audit log for membership/role changes
      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        target_email TEXT,
        actor_email TEXT,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    // Prompt-cache token visibility (Phase 0). Nullable — left NULL for any
    // session whose CLI reported no cache figures, and for every row that
    // predates this migration.
    version: 3,
    up: `
      ALTER TABLE sessions ADD COLUMN cacheReadTokens INTEGER;
      ALTER TABLE sessions ADD COLUMN cacheCreationTokens INTEGER;
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
  /** Input tokens served from the provider's prompt cache; null if unreported. */
  cacheReadTokens: number | null;
  /** Input tokens written to the prompt cache this session; null if unreported. */
  cacheCreationTokens: number | null;
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
  totalCacheReadTokens: number | null;
  totalCacheCreationTokens: number | null;
  totalCostUsd: number | null;
  /** Representative cost source for the task's sessions ("none"/"estimate"/"extractUsage"/"kiro-credits"/"mixed"). */
  costSource: string;
  /** Role-level breakdown (engineer/pm/reviewer/cto/guide/…) for this task. */
  roles: TaskRoleStats[];
  /** Individual session rows for this task, newest first. */
  sessions: SessionRecord[];
}

/** Aggregation: one role's share of a task's usage. */
export interface TaskRoleStats {
  role: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCacheReadTokens: number | null;
  totalCacheCreationTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
}

/** Aggregation: one day's totals (server's local time). */
export interface DailyTotals {
  day: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
}

/** Aggregation: per-session-type total stats. */
export interface SessionTypeStats {
  sessionType: string;
  role: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCacheReadTokens: number | null;
  totalCacheCreationTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
}

/** Board-level summary stats. */
export interface BoardStats {
  totalSessions: number;
  totalElapsedMs: number;
  totalTokens: number | null;
  totalCostUsd: number | null;
  /** Representative cost source for the board ("none"/"estimate"/"extractUsage"/"kiro-credits"/"mixed"). */
  costSource: string;
  mostExpensiveSession: SessionRecord | null;
  mostExpensiveTask: { taskId: string; costUsd: number } | null;
  /** Per-role board totals (sessionType breakdown). */
  roles: TaskRoleStats[];
  /** Per-day board totals (server's local time). */
  days: DailyTotals[];
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
    loadSqlite();
    if (!dbAvailable || !Database) return;

    try {
      const cacheDir = join(repoRoot, ".repoos");
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      const dbPath = join(cacheDir, "repoos.db");
      this.db = new Database(dbPath);

      // Enable WAL mode for better concurrency
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA synchronous=NORMAL");

      // Only consider the store available once the schema is actually in place;
      // a failed migration must degrade gracefully (available=false) rather than
      // leave a half-initialized DB that silently no-ops every read (0230).
      this.available = this.runMigrations();
    } catch {
      // Initialization failed — graceful degradation
    }
  }

  /** Apply pending migrations. Returns true only if the schema is in place. */
  private runMigrations(): boolean {
    if (!this.db) return false;
    try {
      let currentVersion = 0;
      try {
        const result = this.db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").all();
        currentVersion = result.length > 0 ? (result[0] as { version: number }).version : 0;
      } catch {
        // No schema_version yet — run all migrations below.
        currentVersion = 0;
      }

      for (const migration of MIGRATIONS) {
        if (migration.version > currentVersion) {
          this.db.exec(migration.up);
          this.db.exec(`INSERT INTO schema_version (version) VALUES (${migration.version})`);
        }
      }
      return true;
    } catch {
      // A migration failed — the schema is incomplete, so report unavailable.
      return false;
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
    cacheReadTokens?: number | null;
    cacheCreationTokens?: number | null;
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
          cacheReadTokens, cacheCreationTokens,
          costUsd, costSource, status, lastActivityAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(sessionId) DO UPDATE SET
          endedAt = excluded.endedAt,
          elapsedMs = excluded.elapsedMs,
          inputTokens = COALESCE(excluded.inputTokens, inputTokens),
          outputTokens = COALESCE(excluded.outputTokens, outputTokens),
          totalTokens = COALESCE(excluded.totalTokens, totalTokens),
          cacheReadTokens = COALESCE(excluded.cacheReadTokens, cacheReadTokens),
          cacheCreationTokens = COALESCE(excluded.cacheCreationTokens, cacheCreationTokens),
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
        session.cacheReadTokens ?? null,
        session.cacheCreationTokens ?? null,
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
      const result = this.db.prepare("SELECT * FROM sessions WHERE sessionId = ?").all(sessionId);
      return result.length > 0 ? (result[0] as SessionRecord) : null;
    } catch {
      return null;
    }
  }

  /** Retrieve all sessions for a task. */
  getTaskSessions(taskId: string): SessionRecord[] {
    if (!this.available || !this.db) return [];
    try {
      return this.db.prepare("SELECT * FROM sessions WHERE taskId = ? ORDER BY startedAt DESC").all(taskId) as SessionRecord[];
    } catch {
      return [];
    }
  }

  /** Aggregate stats for a task (all sessions and review rounds). */
  getTaskStats(taskId: string): TaskStats | null {
    if (!this.available || !this.db) return null;
    try {
      const rows = this.getTaskSessions(taskId);
      if (rows.length === 0) return null;
      const agg = this.aggregateRows(rows);
      return {
        taskId,
        totalSessions: agg.totalSessions,
        totalElapsedMs: agg.totalElapsedMs,
        totalInputTokens: agg.totalInputTokens,
        totalOutputTokens: agg.totalOutputTokens,
        totalTokens: agg.totalTokens,
        totalCacheReadTokens: agg.totalCacheReadTokens,
        totalCacheCreationTokens: agg.totalCacheCreationTokens,
        totalCostUsd: agg.totalCostUsd,
        costSource: agg.costSource,
        roles: this.groupRows(rows, (r) => r.sessionType)
          .map(([role, group]) => this.toRoleStats(role, group))
          .sort((a, b) => b.totalElapsedMs - a.totalElapsedMs),
        sessions: rows,
      };
    } catch {
      return null;
    }
  }

  /**
   * Aggregate totals broken down by day, using the server's LOCAL time zone
   * (the day a session's `endedAt` falls into on this machine). Done in JS so
   * the grouping genuinely reflects local wall-clock days rather than SQLite's
   * UTC `date()`.
   */
  getDailyTotals(): DailyTotals[] {
    if (!this.available || !this.db) return [];
    try {
      const rows = this.db.prepare("SELECT * FROM sessions WHERE endedAt IS NOT NULL").all() as SessionRecord[];
      const byDay = new Map<string, SessionRecord[]>();
      for (const r of rows) {
        const d = new Date(r.endedAt as string);
        if (Number.isNaN(d.getTime())) continue;
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const list = byDay.get(day);
        if (list) list.push(r);
        else byDay.set(day, [r]);
      }
      return [...byDay.entries()]
        .map(([day, group]) => {
          const agg = this.aggregateRows(group);
          return {
            day,
            totalSessions: agg.totalSessions,
            totalElapsedMs: agg.totalElapsedMs,
            totalInputTokens: agg.totalInputTokens,
            totalOutputTokens: agg.totalOutputTokens,
            totalTokens: agg.totalTokens,
            totalCostUsd: agg.totalCostUsd,
            costSource: agg.costSource,
          };
        })
        .sort((a, b) => (a.day < b.day ? 1 : -1));
    } catch {
      return [];
    }
  }

  /** Aggregate stats grouped by session type. */
  getSessionTypeStats(): SessionTypeStats[] {
    if (!this.available || !this.db) return [];
    try {
      const rows = this.db.prepare("SELECT * FROM sessions").all() as SessionRecord[];
      return this.groupRows(rows, (r) => r.sessionType)
        .map(([sessionType, group]) => {
          const agg = this.aggregateRows(group);
          return {
            sessionType,
            role: sessionType,
            totalSessions: agg.totalSessions,
            totalElapsedMs: agg.totalElapsedMs,
            totalInputTokens: agg.totalInputTokens,
            totalOutputTokens: agg.totalOutputTokens,
            totalTokens: agg.totalTokens,
            totalCacheReadTokens: agg.totalCacheReadTokens,
            totalCacheCreationTokens: agg.totalCacheCreationTokens,
            totalCostUsd: agg.totalCostUsd,
            costSource: agg.costSource,
          };
        })
        .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0));
    } catch {
      return [];
    }
  }

  /** Group sessions by a key, preserving insertion order of keys. */
  private groupRows(rows: SessionRecord[], key: (r: SessionRecord) => string): Array<[string, SessionRecord[]]> {
    const map = new Map<string, SessionRecord[]>();
    for (const r of rows) {
      const k = key(r);
      const list = map.get(k);
      if (list) list.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()];
  }

  /** Build a single role's totals from a group of sessions. */
  private toRoleStats(role: string, rows: SessionRecord[]): TaskRoleStats {
    const agg = this.aggregateRows(rows);
    return {
      role,
      totalSessions: agg.totalSessions,
      totalElapsedMs: agg.totalElapsedMs,
      totalInputTokens: agg.totalInputTokens,
      totalOutputTokens: agg.totalOutputTokens,
      totalTokens: agg.totalTokens,
      totalCacheReadTokens: agg.totalCacheReadTokens,
      totalCacheCreationTokens: agg.totalCacheCreationTokens,
      totalCostUsd: agg.totalCostUsd,
      costSource: agg.costSource,
    };
  }

  /**
   * Sum usage across a group of sessions. costSource is classified as "mixed"
   * when the group's spend comes from more than one source, otherwise the
   * single non-"none" source (or "none"). This drives honest labeling in the UI
   * (estimates and Kiro credits are never silently shown as firm USD, 0230).
   */
  private aggregateRows(rows: SessionRecord[]): {
    totalSessions: number;
    totalElapsedMs: number;
    totalInputTokens: number | null;
    totalOutputTokens: number | null;
    totalTokens: number | null;
    totalCacheReadTokens: number | null;
    totalCacheCreationTokens: number | null;
    totalCostUsd: number | null;
    costSource: string;
  } {
    let totalSessions = 0;
    let totalElapsedMs = 0;
    let totalInputTokens: number | null = null;
    let totalOutputTokens: number | null = null;
    let totalTokens: number | null = null;
    let totalCacheReadTokens: number | null = null;
    let totalCacheCreationTokens: number | null = null;
    let totalCostUsd: number | null = null;
    const sources = new Set<string>();
    for (const r of rows) {
      totalSessions += 1;
      totalElapsedMs += r.elapsedMs || 0;
      if (r.inputTokens != null) totalInputTokens = (totalInputTokens ?? 0) + r.inputTokens;
      if (r.outputTokens != null) totalOutputTokens = (totalOutputTokens ?? 0) + r.outputTokens;
      if (r.totalTokens != null) totalTokens = (totalTokens ?? 0) + r.totalTokens;
      if (r.cacheReadTokens != null)
        totalCacheReadTokens = (totalCacheReadTokens ?? 0) + r.cacheReadTokens;
      if (r.cacheCreationTokens != null)
        totalCacheCreationTokens = (totalCacheCreationTokens ?? 0) + r.cacheCreationTokens;
      if (r.costUsd != null) {
        totalCostUsd = (totalCostUsd ?? 0) + r.costUsd;
        sources.add(r.costSource || "extractUsage");
      }
    }
    let costSource = "none";
    if (sources.size > 1) costSource = "mixed";
    else if (sources.size === 1) costSource = [...sources][0];
    return {
      totalSessions,
      totalElapsedMs,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCostUsd,
      costSource,
    };
  }

  /** Board-level summary: total spend, tokens, time, most expensive session/task. */
  getBoardStats(): BoardStats {
    if (!this.available || !this.db) {
      return {
        totalSessions: 0,
        totalElapsedMs: 0,
        totalTokens: null,
        totalCostUsd: null,
        costSource: "none",
        mostExpensiveSession: null,
        mostExpensiveTask: null,
        roles: [],
        days: [],
      };
    }

    try {
      const summary = this.db.prepare(`
        SELECT
          COUNT(*) as totalSessions,
          COALESCE(SUM(elapsedMs), 0) as totalElapsedMs,
          SUM(CASE WHEN totalTokens IS NOT NULL THEN totalTokens ELSE 0 END) as totalTokens,
          SUM(CASE WHEN costUsd IS NOT NULL THEN costUsd ELSE 0 END) as totalCostUsd
        FROM sessions
      `).all()[0] as any;

      const mostExpensive = this.db.prepare(`
        SELECT * FROM sessions
        WHERE costUsd IS NOT NULL
        ORDER BY costUsd DESC
        LIMIT 1
      `).all();
      const mostExpensiveSession = mostExpensive.length > 0 ? (mostExpensive[0] as SessionRecord) : null;

      const mostExpensiveTaskResult = this.db.prepare(`
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

      // Representative cost source across the whole board — mirrors the per-role
      // / per-day classification in aggregateRows so estimates and Kiro credits
      // are never silently shown as firm USD at the board level (0230).
      const sourceRows = this.db
        .prepare(
          "SELECT DISTINCT COALESCE(costSource, 'extractUsage') as costSource FROM sessions WHERE costUsd IS NOT NULL",
        )
        .all() as { costSource: string }[];
      const costSource =
        sourceRows.length > 1 ? "mixed" : sourceRows.length === 1 ? sourceRows[0].costSource : "none";

      return {
        totalSessions: summary.totalSessions || 0,
        totalElapsedMs: summary.totalElapsedMs || 0,
        totalTokens: summary.totalTokens || null,
        totalCostUsd: summary.totalCostUsd || null,
        costSource,
        mostExpensiveSession,
        mostExpensiveTask,
        roles: this.getSessionTypeStats(),
        days: this.getDailyTotals(),
      };
    } catch {
      return {
        totalSessions: 0,
        totalElapsedMs: 0,
        totalTokens: null,
        totalCostUsd: null,
        costSource: "none",
        mostExpensiveSession: null,
        mostExpensiveTask: null,
        roles: [],
        days: [],
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
    costSource: "none",
    mostExpensiveSession: null,
    mostExpensiveTask: null,
    roles: [],
    days: [],
  };
}
