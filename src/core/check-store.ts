/**
 * Durable history of check runs (#0564).
 *
 * Every `repoos check` — local or remote, pre-review or close-out or release or
 * a bare CLI run — lands one row here, so "how long does a full suite take on
 * bee vs mini?" and "was that MTD failure a fluke?" have an answer after the
 * fact instead of only in the moment.
 *
 * This is deliberately a SEPARATE SQLite file from `repoos.db` (the auth DB).
 * `repoos.db` requires `REPOOS_SECRET_STORE_KEY` and is unavailable on machines
 * without auth configured; check-run history has no security requirement and
 * must not inherit that dependency. A separate file also means no locking
 * contention with auth writes, and a file you can inspect or delete freely.
 *
 * Zero runtime dependencies — sqlite is a platform builtin, same as db.ts.
 * Fail-soft throughout: a read-only checkout or a vanished cache dir must never
 * fail an otherwise-green gate — the store is for visibility, not for gating.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

let Database: any;
let sqliteAvailable = false;
let sqliteLoadAttempted = false;
let warnedSqliteUnavailable = false;
// RepoOS is ESM, so the CommonJS global `require` is not available. Create a
// local resolver for optional runtime builtins instead (same as db.ts).
const runtimeRequire = createRequire(import.meta.url);

/**
 * Load SQLite on first actual use, not at module import time — Node prints an
 * ExperimentalWarning the moment `node:sqlite` is required on some versions,
 * and this module is reachable from the check command's import graph (db.ts).
 */
function loadSqlite(): void {
  if (sqliteLoadAttempted) return;
  sqliteLoadAttempted = true;
  try {
    const global = globalThis as any;
    if (global.Bun && typeof global.Bun === "object") {
      try {
        const sqlite = runtimeRequire("bun:sqlite");
        Database = sqlite.Database;
        sqliteAvailable = true;
      } catch {
        // bun:sqlite not available, try node:sqlite below
      }
    }
    if (!sqliteAvailable) {
      try {
        const sqlite = runtimeRequire("node:sqlite");
        Database = sqlite.DatabaseSync;
        sqliteAvailable = true;
      } catch {
        // node:sqlite not available — degrade gracefully
      }
    }
  } catch {
    // Any error during initialization — degrade gracefully
  }
  if (!sqliteAvailable && !warnedSqliteUnavailable) {
    // Silent degradation here is how history silently disappears (0564
    // review): say so, once per process, instead of failing quietly forever.
    warnedSqliteUnavailable = true;
    console.error(
      "[repoos] check-run history unavailable: no SQLite runtime (needs Bun, or Node >= 22)",
    );
  }
}

/** Schema for the standalone `.repoos/checks.db`. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS check_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       TEXT,        -- null for bare CLI runs
    phase         TEXT NOT NULL,
    machine       TEXT,        -- short hostname, or null when never dispatched
    remote        INTEGER NOT NULL DEFAULT 0,
    scope         TEXT NOT NULL DEFAULT 'full',
    started_at    TEXT NOT NULL,
    duration_ms   INTEGER,
    outcome       TEXT NOT NULL,
    failed_step   TEXT,
    skipped_steps TEXT,        -- JSON array of step names skipped
    detail        TEXT,
    failed_tests  TEXT         -- JSON array of failing test names (tests step)
  );
  CREATE INDEX IF NOT EXISTS idx_check_runs_started_at ON check_runs(started_at);
  CREATE INDEX IF NOT EXISTS idx_check_runs_task_id ON check_runs(task_id);
`;

/** Keep this many rows at most — a store that grows without bound is a disk
 *  leak nobody asked for; 1000 runs at one row per gate is years of history. */
const MAX_ROWS = 1000;

/** Clip failure details so one noisy failure can't make a row huge. */
const MAX_DETAIL_CHARS = 4000;

export type CheckRunPhase = "pre-review" | "close-out" | "release" | "cli";

export type CheckRunOutcome = "pass" | "fail" | "cancelled";

/** One recorded check run, as stored and as the API returns it. */
export interface CheckRunRow {
  id: number;
  /** null for bare CLI runs. */
  taskId: string | null;
  phase: CheckRunPhase;
  /** Short hostname of the machine that executed the run, or null when the
   *  run never reached a machine (dispatch failed before a host was chosen). */
  machine: string | null;
  /** True when the run executed on a remote validation host. */
  remote: boolean;
  /** 'full' or 'changed:<ref>'. */
  scope: string;
  startedAt: string;
  durationMs: number | null;
  outcome: CheckRunOutcome;
  /** The step that failed, when the outcome is a step failure. */
  failedStep: string | null;
  /** Names of steps this run skipped (profile / changed-path / blocked). */
  skippedSteps: string[];
  detail: string | null;
  /** Failing tests (`file > suite > test`) when the tests step failed. */
  failedTests: string[];
}

export interface RecordCheckRunInput {
  taskId?: string | null;
  phase: CheckRunPhase;
  machine?: string | null;
  remote?: boolean;
  scope?: string;
  startedAt: string;
  durationMs?: number | null;
  outcome: CheckRunOutcome;
  failedStep?: string | null;
  skippedSteps?: string[];
  detail?: string | null;
  failedTests?: string[];
}

export interface ListCheckRunsOptions {
  /** Newest-first limit; 1..MAX_ROWS, default 200. */
  limit?: number;
  taskId?: string;
  machine?: string;
  remote?: boolean;
}

function shortHostname(): string {
  try {
    const raw = hostname().trim().toLowerCase();
    return raw ? raw.split(".")[0] || "local" : "local";
  } catch {
    return "local";
  }
}

/** Short hostname of the local machine, for run attribution. */
export function localMachineName(): string {
  return shortHostname();
}

function clipDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const clean = detail.trim();
  if (!clean) return null;
  return clean.length > MAX_DETAIL_CHARS ? clean.slice(0, MAX_DETAIL_CHARS) : clean;
}

export class CheckStore {
  private db: any;
  private available: boolean;

  constructor(repoRoot: string, cacheDir = ".repoos") {
    this.available = false;
    loadSqlite();
    if (!sqliteAvailable || !Database) return;
    try {
      const dir = join(repoRoot, cacheDir);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      this.db = new Database(join(dir, "checks.db"));
      this.db.exec("PRAGMA journal_mode=WAL");
      // The store is written by the server process AND by spawned `repoos
      // check` children on the same machine — give a contending writer a
      // short busy window instead of failing the row outright.
      this.db.exec("PRAGMA busy_timeout=3000");
      this.db.exec("PRAGMA synchronous=NORMAL");
      this.db.exec(SCHEMA);
      this.migrate();
      this.available = true;
    } catch (e) {
      this.available = false;
      // Same rule as loadSqlite: a store that cannot open must say why once,
      // not let history vanish silently (0564 review).
      console.error(
        `[repoos] check-run history unavailable (${join(repoRoot, cacheDir, "checks.db")}): ` +
          `${(e as Error).message}`,
      );
    }
  }

  /** Add columns introduced after a checks.db was first created. */
  private migrate(): void {
    const cols = this.db.prepare("PRAGMA table_info(check_runs)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "failed_tests")) {
      this.db.exec("ALTER TABLE check_runs ADD COLUMN failed_tests TEXT");
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  /** Insert one row (plus retention pruning). Fail-soft by design. */
  record(input: RecordCheckRunInput): void {
    if (!this.available || !this.db) return;
    try {
      this.db
        .prepare(
          `INSERT INTO check_runs
             (task_id, phase, machine, remote, scope, started_at, duration_ms,
              outcome, failed_step, skipped_steps, detail, failed_tests)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.taskId ?? null,
          input.phase,
          input.machine ?? null,
          input.remote ? 1 : 0,
          input.scope || "full",
          input.startedAt,
          input.durationMs ?? null,
          input.outcome,
          input.failedStep ?? null,
          input.skippedSteps && input.skippedSteps.length > 0
            ? JSON.stringify(input.skippedSteps)
            : null,
          clipDetail(input.detail),
          input.failedTests && input.failedTests.length > 0
            ? JSON.stringify(input.failedTests)
            : null,
        );
      // Retention: delete everything older than the newest MAX_ROWS rows.
      this.db
        .prepare(
          `DELETE FROM check_runs WHERE id NOT IN
             (SELECT id FROM check_runs ORDER BY id DESC LIMIT ${MAX_ROWS})`,
        )
        .run();
    } catch {
      /* visibility only — never fail the gate on a store write */
    }
  }

  /** Newest-first history, with optional filters. Never throws. */
  list(opts: ListCheckRunsOptions = {}): CheckRunRow[] {
    if (!this.available || !this.db) return [];
    const limit = Math.min(MAX_ROWS, Math.max(1, Math.floor(opts.limit ?? 200)));
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.taskId) {
      where.push("task_id = ?");
      args.push(opts.taskId);
    }
    if (opts.machine) {
      where.push("machine = ?");
      args.push(opts.machine);
    }
    if (opts.remote !== undefined) {
      where.push("remote = ?");
      args.push(opts.remote ? 1 : 0);
    }
    try {
      const sql = `SELECT * FROM check_runs
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY started_at DESC, id DESC LIMIT ${limit}`;
      const rows = this.db.prepare(sql).all(...args) as Record<string, any>[];
      return rows.map((r) => this.toRow(r));
    } catch {
      return [];
    }
  }

  private toRow(r: Record<string, any>): CheckRunRow {
    const jsonList = (v: unknown): string[] => {
      try {
        if (typeof v === "string" && v) {
          const parsed = JSON.parse(v) as unknown;
          if (Array.isArray(parsed)) return parsed.map(String);
        }
      } catch {
        /* corrupt row — treat as none */
      }
      return [];
    };
    const skipped = jsonList(r.skipped_steps);
    return {
      id: Number(r.id) || 0,
      taskId: r.task_id ?? null,
      phase: (r.phase ?? "cli") as CheckRunPhase,
      machine: r.machine ?? null,
      remote: Number(r.remote) === 1,
      scope: String(r.scope ?? "full"),
      startedAt: String(r.started_at ?? ""),
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      outcome: (r.outcome ?? "fail") as CheckRunOutcome,
      failedStep: r.failed_step ?? null,
      skippedSteps: skipped,
      detail: r.detail ?? null,
      failedTests: jsonList(r.failed_tests),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton per (root, cacheDir) — writers across a server process share one
// open handle; spawned CLI children open their own short-lived handle.
// ---------------------------------------------------------------------------

const instances = new Map<string, CheckStore>();

/** Get or create the store for a repo root (and optional cache dir override). */
export function getCheckStore(repoRoot: string, cacheDir = ".repoos"): CheckStore {
  const key = `${repoRoot}:${cacheDir}`;
  let store = instances.get(key);
  if (!store) {
    store = new CheckStore(repoRoot, cacheDir);
    instances.set(key, store);
  }
  return store;
}

/** Reset the singleton (for tests). */
export function resetCheckStore(): void {
  instances.clear();
}

/**
 * Which phase a spawned `repoos check` belongs to, from the caller-supplied
 * env. Task-less callers (a plain `repoos check` in a terminal) record as
 * phase 'cli' with a null task id.
 */
export function envToRunContext(env: NodeJS.ProcessEnv): {
  taskId: string | null;
  phase: CheckRunPhase;
} {
  const taskId = env.REPOOS_CHECK_TASK_ID?.trim() || null;
  const raw = env.REPOOS_CHECK_PHASE?.trim();
  const phase: CheckRunPhase =
    raw === "pre-review" || raw === "close-out" || raw === "release"
      ? raw
      : taskId
        ? "pre-review"
        : "cli";
  return { taskId, phase };
}
