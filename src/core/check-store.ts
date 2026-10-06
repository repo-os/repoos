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
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { currentBranch } from "./git.js";

let Database: any;
let sqliteAvailable = false;
let sqliteLoadAttempted = false;
let warnedSqliteUnavailable = false;
let warnedRecordFailed = false;
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
    worktree      TEXT,        -- absolute worktree path this run executed in
    machine       TEXT,        -- short hostname, or null when never dispatched
    remote        INTEGER NOT NULL DEFAULT 0,
    scope         TEXT NOT NULL DEFAULT 'full',
    started_at    TEXT NOT NULL,
    duration_ms   INTEGER,
    outcome       TEXT NOT NULL,
    failed_step   TEXT,
    skipped_steps TEXT,        -- JSON array of step names skipped
    detail        TEXT,
    failed_tests  TEXT,        -- JSON array of failing test names (tests step)
    isolation_note TEXT        -- flake-triage label, e.g. "passed 3/3 alone" (#0655)
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

/** One recorded check run, as stored and as the API returns it. */
export type CheckRunOutcome = "pass" | "fail" | "cancelled" | "skipped";

/**
 * `skipped` (#0592): the gate ran nothing because this repo has no check plan
 * and nothing could be inferred — exit 0, deliberately not recorded as `pass`.
 */
export interface CheckRunRow {
  id: number;
  /** null for bare CLI runs. */
  taskId: string | null;
  phase: CheckRunPhase;
  /** Absolute path of the worktree the run executed in, when known. Lets the
   *  next run in the same worktree find its own last failure (#0655). */
  worktree: string | null;
  /** Short hostname of the machine that executed the run, or null when the
   *  run never reached a machine (dispatch failed before a host was chosen). */
  machine: string | null;
  /** True when the run executed on a remote validation host. */
  remote: boolean;
  /** 'full' or 'changed:<ref>'. */
  scope: string;
  /** Set for remote rows when the bundle SHA is known (#0694). */
  candidateSha: string | null;
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
  /**
   * Informational isolation re-run label (#0655), e.g. `passed 3/3 alone` or
   * `failed 3/3 alone` for each failing file. Never changes the run outcome.
   */
  isolationNote: string | null;
}

export interface RecordCheckRunInput {
  taskId?: string | null;
  phase: CheckRunPhase;
  worktree?: string | null;
  /** `git rev-parse HEAD` the remote bundle was built from (#0694 reuse). */
  candidateSha?: string | null;
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
  isolationNote?: string | null;
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
  private dbPath: string;

  constructor(repoRoot: string, cacheDir = ".repoos") {
    this.available = false;
    this.dbPath = join(repoRoot, cacheDir, "checks.db");
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
        `[repoos] check-run history unavailable (${this.dbPath}): ` + `${(e as Error).message}`,
      );
    }
  }

  /** Add columns introduced after a checks.db was first created. */
  private migrate(): void {
    const cols = this.db.prepare("PRAGMA table_info(check_runs)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "failed_tests")) {
      this.db.exec("ALTER TABLE check_runs ADD COLUMN failed_tests TEXT");
    }
    if (!cols.some((c) => c.name === "isolation_note")) {
      this.db.exec("ALTER TABLE check_runs ADD COLUMN isolation_note TEXT");
    }
    if (!cols.some((c) => c.name === "worktree")) {
      this.db.exec("ALTER TABLE check_runs ADD COLUMN worktree TEXT");
    }
    if (!cols.some((c) => c.name === "candidate_sha")) {
      this.db.exec("ALTER TABLE check_runs ADD COLUMN candidate_sha TEXT");
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
             (task_id, phase, worktree, candidate_sha, machine, remote, scope, started_at, duration_ms,
              outcome, failed_step, skipped_steps, detail, failed_tests, isolation_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.taskId ?? null,
          input.phase,
          input.worktree ?? null,
          input.candidateSha ?? null,
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
          input.isolationNote?.trim() || null,
        );
      // Retention: delete everything older than the newest MAX_ROWS rows.
      this.db
        .prepare(
          `DELETE FROM check_runs WHERE id NOT IN
             (SELECT id FROM check_runs ORDER BY id DESC LIMIT ${MAX_ROWS})`,
        )
        .run();
    } catch (e) {
      // Visibility only — never fail the gate on a store write. But say so,
      // once per process: silent history loss made #0607 hard to diagnose
      // (fixture rows vanishing into a gate's live store with no trace).
      if (!warnedRecordFailed) {
        warnedRecordFailed = true;
        console.error(
          `[repoos] check-run history write failed (${this.dbPath}): ` +
            `${(e as Error)?.message ?? String(e)}`,
        );
      }
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
      worktree: r.worktree ?? null,
      candidateSha: r.candidate_sha ?? null,
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
      isolationNote: r.isolation_note ?? null,
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

/** Reset the singleton (for tests). Also resets the once-per-process write-failure warning so tests asserting it stay isolated. */
export function resetCheckStore(): void {
  instances.clear();
  warnedRecordFailed = false;
}

function frontmatterScalar(fm: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))\\s*$`, "m");
  const m = fm.match(re);
  if (!m) return null;
  const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  return v || null;
}

/**
 * Numeric task id for an active task branch checked out in `repoRoot`, when the
 * engineer shell has no `REPOOS_TASK_ID` (#0695).
 */
export function taskIdFromWorktreeBranch(repoRoot: string, workDir = "work"): string | null {
  const branch = currentBranch(repoRoot);
  if (!branch) return null;
  const dir = join(repoRoot, workDir);
  let match: string | null = null;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const raw = readFileSync(join(dir, name), "utf8");
      const end = raw.indexOf("\n---", 4);
      if (!raw.startsWith("---") || end === -1) continue;
      const fm = raw.slice(4, end);
      if (frontmatterScalar(fm, "branch") !== branch) continue;
      const id = frontmatterScalar(fm, "id");
      if (!id || !/^\d+$/.test(id)) continue;
      if (match !== null && match !== id) return null;
      match = id;
    }
  } catch {
    /* missing work dir */
  }
  return match;
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
  const explicit = env.REPOOS_CHECK_TASK_ID?.trim();
  const managed = env.REPOOS_AGENT === "1" ? env.REPOOS_TASK_ID?.trim() : undefined;
  const callerTaskId = explicit || managed || null;
  const raw = env.REPOOS_CHECK_PHASE?.trim();
  const phase: CheckRunPhase =
    raw === "pre-review" || raw === "close-out" || raw === "release"
      ? raw
      : callerTaskId
        ? "pre-review"
        : "cli";
  return { taskId: callerTaskId, phase };
}

/** Task + phase for a check-run row, including branch attribution in a task worktree (#0695). */
export function resolveCheckRunAttribution(
  env: NodeJS.ProcessEnv,
  repoRoot: string,
): { taskId: string | null; phase: CheckRunPhase } {
  const { taskId: callerTaskId, phase } = envToRunContext(env);
  if (callerTaskId) return { taskId: callerTaskId, phase };
  const branchTaskId = taskIdFromWorktreeBranch(repoRoot);
  if (!branchTaskId) return { taskId: null, phase };
  return { taskId: branchTaskId, phase: "cli" };
}
