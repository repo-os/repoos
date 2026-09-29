/**
 * One-time frontmatter migration for the area format (#0583).
 *
 * `area` used to be a free-text string with `+` as the ad-hoc multi-value
 * separator (`server + ui-app`). The canonical form is now comma-separated —
 * scalar for one value, inline list for several (`area: [web, core]`) — and
 * the reader accepts every legacy shape forever (`parseTaskAreas` in
 * `areas.ts`). This pass REWRITES the files that still need it, so boards
 * stop carrying the legacy spellings.
 *
 * Scope, deliberately narrow: only tasks whose parsed `area` value differs
 * from its canonical written form change. Renaming or reordering values is
 * NOT migration work ("Out of scope" in the task). Every revision is a
 * mechanical parse → serialize round trip through the SAME task engine every
 * normal write uses (`parseTask` → `serializeTask`), so formatting and
 * unknown frontmatter behave exactly like any planned update — but:
 *
 * - NO `updated_at` stamp and NO activity entry: the migration is a storage
 *   format rewrite, not a task edit; nothing about the task is "newer".
 * - NO per-file git commit: the CALLER owns the git step and commits the
 *   whole rewrite in ONE pass (`commitFiles`, from server.ts), so a migrated
 *   board lands as a single reviewable migration commit and `main` never
 *   sits dirty — rather than one `docs(<id>): update task` commit per file
 *   with the caller's pass a no-op.
 * - If that commit FAILS, the rewritten paths are recorded in a cache-dir
 *   marker (`runAreaMigrationPass`) and retried on the next boot (#0587):
 *   once the files are canonical a later scan rewrites nothing, so without the
 *   marker the failed commit could never be re-attempted and `main` would stay
 *   dirty forever.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { parseTask, serializeTask } from "../core/task.js";
import { parseDocument } from "../core/frontmatter.js";
import { formatTaskAreas, parseTaskAreas } from "../core/areas.js";

export interface MigrateAreasResult {
  /** Task files whose `area` frontmatter was rewritten (repo-relative paths). */
  updated: string[];
  /** Files read, for the summary line. */
  scanned: number;
  /** Absolute paths actually rewritten — for the caller's single git commit. */
  rewrittenAbsPaths: string[];
}

/**
 * True when the raw `area` frontmatter value is not already in its canonical
 * written shape: a scalar when one value, an inline list when several.
 * `area: web`, `area: [web, core]` are canonical; `area: web, core`,
 * `area: [web]`, `area: a + b` (and other legacy spellings) rewrite.
 */
export function areaValueNeedsRewrite(raw: unknown): boolean {
  const areas = parseTaskAreas(raw);
  if (areas.length === 0) return false; // unset/blank — nothing to fix
  const canonical = areas.length > 1 ? areas : areas[0];
  if (Array.isArray(raw)) return JSON.stringify(raw) !== JSON.stringify(canonical);
  if (typeof raw !== "string") return true;
  return raw !== canonical;
}

/** Canonical comma-joined display form for a raw frontmatter area value. */
function canonicalDisplay(raw: unknown): string {
  return formatTaskAreas(parseTaskAreas(raw));
}

/**
 * Task file extensions, mirroring the indexer's walk. Per-entry try: a file
 * vanishing between readdir and stat is a best-effort skip, not a reason to
 * abort the whole pass.
 */
function walkTaskFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    let st;
    try {
      st = statSync(dir, { throwIfNoEntry: false });
    } catch {
      return;
    }
    if (!st?.isDirectory()) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let est;
      try {
        est = statSync(full);
      } catch {
        continue; // vanished mid-walk — skip, don't abort
      }
      if (est.isDirectory()) visit(full);
      else if (exts.includes(extname(entry))) out.push(full);
    }
  };
  visit(dir);
  return out;
}

/**
 * Rewrite legacy area values across every task file under `workDir`.
 * Idempotent by construction: a second run finds every value already
 * canonical and writes nothing. Per-file failures are skipped (best-effort);
 * the migration never fails the whole pass — the reader tolerates every
 * legacy shape anyway, so a skipped file stays working until the next write.
 */
export function migrateTaskAreas(config: RepoOSConfig): MigrateAreasResult {
  const files = walkTaskFiles(join(config.root, config.workDir), config.taskExtensions);
  const updated: string[] = [];
  const rewrittenAbsPaths: string[] = [];

  for (const absPath of files) {
    try {
      const raw = parseDocument(readFileSync(absPath, "utf8")).data.area;
      if (!areaValueNeedsRewrite(raw)) continue;
      // Mechanical storage rewrite: parse whole, swap ONLY the two area
      // fields, serialize. serializeTask owns the canonical scalar-or-list
      // written form; timestamps and the body are left exactly as parsed.
      const task = parseTask({
        content: readFileSync(absPath, "utf8"),
        absPath,
        root: config.root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
      });
      task.areas = parseTaskAreas(raw);
      task.area = canonicalDisplay(raw);
      writeFileSync(absPath, serializeTask(task));
      rewrittenAbsPaths.push(absPath);
      updated.push(relative(config.root, absPath));
    } catch {
      /* one unreadable/mid-edit file must not stop the migration */
    }
  }
  return { updated, scanned: files.length, rewrittenAbsPaths };
}

/** Name of the cache-dir marker recording a migration commit that failed. */
const PENDING_MARKER = "area-migration-pending.json";

/** Absolute path of the pending-commit marker in the repo's cache dir. */
export function areaMigrationPendingPath(config: Pick<RepoOSConfig, "root" | "cacheDir">): string {
  return join(config.root, config.cacheDir, PENDING_MARKER);
}

/**
 * Repo-relative paths the last pass rewrote but could not commit. Empty when
 * no marker exists or it is unreadable/corrupt (best-effort recovery: the
 * tolerant reader keeps the files working either way).
 */
export function readAreaMigrationPending(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): string[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(areaMigrationPendingPath(config), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}

/** Record the rewritten paths whose commit failed, so the next boot retries. */
export function writeAreaMigrationPending(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
  absPaths: string[],
): void {
  const rels = [
    ...new Set(
      absPaths
        .map((p) => relative(config.root, p))
        .filter((p) => p && !p.startsWith("..") && !p.startsWith("/")),
    ),
  ];
  if (rels.length === 0) return;
  try {
    const marker = areaMigrationPendingPath(config);
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, JSON.stringify(rels, null, 2) + "\n", "utf8");
  } catch {
    /* a marker we cannot write must not break boot — the files stay dirty and
       the next pass rewrites nothing; a human sees the dirty main either way */
  }
}

/** Clear the pending marker (after a successful commit, or when absent). */
export function clearAreaMigrationPending(config: Pick<RepoOSConfig, "root" | "cacheDir">): void {
  try {
    rmSync(areaMigrationPendingPath(config), { force: true });
  } catch {
    /* best-effort */
  }
}

export interface AreaMigrationPassResult {
  /** Files rewritten by THIS scan. */
  rewritten: number;
  /** True when the pass tried to commit anything (fresh rewrites or a retry). */
  attempted: boolean;
  /** True when a pending retry was attempted on this pass. */
  retried: boolean;
  /** False when the last commit failed — the tree is still dirty. */
  committed: boolean;
}

/**
 * Run the migration and commit it, retrying a previous failed commit first
 * (#0587). `commit` receives absolute paths and returns whether the git commit
 * landed; it is injectable so the retry/ordering logic is testable without a
 * repo.
 *
 * Why the marker: once the files are rewritten they are already canonical, so
 * a later scan finds nothing to rewrite and would never re-attempt the commit
 * — the failed commit would leave `main` dirty forever. Recording the paths
 * makes "retry on the next boot" possible; a successful retry clears it.
 */
export function runAreaMigrationPass(
  config: RepoOSConfig,
  commit: (absPaths: string[]) => boolean,
): AreaMigrationPassResult {
  let committed = true;
  let retried = false;

  const pending = readAreaMigrationPending(config);
  if (pending.length > 0) {
    retried = true;
    if (commit(pending.map((p) => join(config.root, p)))) {
      clearAreaMigrationPending(config);
    } else {
      committed = false;
    }
  }

  const result = migrateTaskAreas(config);
  if (result.rewrittenAbsPaths.length > 0) {
    if (commit(result.rewrittenAbsPaths)) {
      clearAreaMigrationPending(config);
    } else {
      committed = false;
      // Union with the paths still pending from a failed retry above: a second
      // failed commit must not replace the marker and lose the earlier paths.
      writeAreaMigrationPending(config, [
        ...pending.map((p) => join(config.root, p)),
        ...result.rewrittenAbsPaths,
      ]);
    }
  }

  return {
    rewritten: result.updated.length,
    attempted: result.updated.length > 0 || retried,
    retried,
    committed,
  };
}
