/**
 * One-time layout migration for engineering reports (#1013).
 *
 * Engineering rounds used to be written to
 * `<workDir>/engineering-reports/<task-id>/round-<n>.json`. They now live next
 * to the review passes under `<workDir>/reports/<task-id>/round-<n>.json`. The
 * reader accepts both locations forever (`loadEngineeringReports`), but the old
 * directory should not linger — and moving another task's report files from a
 * *feature branch* would be exactly the cross-task bookkeeping the landable and
 * close-out guards reject. So the migration runs once on the control plane,
 * after the index has populated, and commits the moves on `main` in one pass —
 * the same pattern as the area (#0583), task-body (#0702) and done-hold (#0993)
 * migrations.
 *
 * The pass is idempotent and best-effort: a file that cannot be moved stays in
 * the legacy directory and keeps working through the reader. When the commit
 * fails the moved/deleted paths are recorded in a cache-dir marker and retried
 * on the next boot (#0587), so a failed commit cannot leave `main` permanently
 * dirty with no way to retry.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { reportsTaskDir } from "../core/report-paths.js";

export interface ReportLayoutMigrationResult {
  /** Repo-relative canonical paths created by a move. */
  moved: string[];
  /** Repo-relative legacy paths deleted because the canonical copy existed. */
  removed: string[];
  /** Absolute paths (both sides of every move) for the caller's git commit. */
  absPaths: string[];
  /** Round files examined, for the summary line. */
  scanned: number;
}

const ROUND_FILE = /^round-(\d+)\.json$/;

const rel = (root: string, path: string): string => relative(root, path).split("\\").join("/");

function removeDirIfEmpty(dir: string): void {
  try {
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    /* missing, non-empty or unreadable — leave it alone */
  }
}

/**
 * Move every legacy engineering round into the shared reports directory.
 * When both copies exist, the canonical one wins only if the bytes are
 * identical; a differing legacy round is left untouched so nothing is silently
 * lost (the reader still loads it alongside the canonical rounds).
 */
export function migrateLegacyReportLayout(config: RepoOSConfig): ReportLayoutMigrationResult {
  const result: ReportLayoutMigrationResult = { moved: [], removed: [], absPaths: [], scanned: 0 };
  const workDir = config.workDir || "work";
  const legacyRoot = join(config.root, workDir, "engineering-reports");
  let taskDirs: string[];
  try {
    taskDirs = readdirSync(legacyRoot);
  } catch {
    return result;
  }

  for (const taskId of taskDirs) {
    const legacyDir = join(legacyRoot, taskId);
    let isDir = false;
    try {
      isDir = statSync(legacyDir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    let names: string[];
    try {
      names = readdirSync(legacyDir);
    } catch {
      continue;
    }
    const destDir = reportsTaskDir(config, taskId);
    for (const name of names) {
      if (!ROUND_FILE.test(name)) continue;
      result.scanned += 1;
      const legacyPath = join(legacyDir, name);
      const destPath = join(destDir, name);
      try {
        if (existsSync(destPath)) {
          if (readFileSync(legacyPath, "utf8") !== readFileSync(destPath, "utf8")) continue;
          unlinkSync(legacyPath);
          result.removed.push(rel(config.root, legacyPath));
          result.absPaths.push(legacyPath);
          continue;
        }
        mkdirSync(destDir, { recursive: true });
        renameSync(legacyPath, destPath);
        result.moved.push(rel(config.root, destPath));
        result.absPaths.push(destPath, legacyPath);
      } catch {
        /* one unreadable/mid-edit report must not stop the migration */
      }
    }
    removeDirIfEmpty(legacyDir);
  }
  removeDirIfEmpty(legacyRoot);
  return result;
}

/** Name of the cache-dir marker recording a migration commit that failed. */
const PENDING_MARKER = "report-layout-migration-pending.json";

export function reportLayoutMigrationPendingPath(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): string {
  return join(config.root, config.cacheDir ?? ".repoos", PENDING_MARKER);
}

/** Repo-relative paths the last pass changed but could not commit. */
export function readReportLayoutMigrationPending(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): string[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(reportLayoutMigrationPendingPath(config), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}

function writeReportLayoutMigrationPending(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
  absPaths: string[],
): void {
  const rels = [
    ...new Set(
      absPaths
        .map((p) => relative(config.root, p))
        .filter((p) => p && !p.startsWith("..") && !p.startsWith("/"))
        .map((p) => p.split("\\").join("/")),
    ),
  ];
  if (rels.length === 0) return;
  try {
    const marker = reportLayoutMigrationPendingPath(config);
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, JSON.stringify(rels, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort: a missing marker leaves a visible dirty main */
  }
}

export function clearReportLayoutMigrationPending(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): void {
  try {
    rmSync(reportLayoutMigrationPendingPath(config), { force: true });
  } catch {
    /* best-effort */
  }
}

export interface ReportLayoutMigrationPassResult {
  moved: number;
  removed: number;
  attempted: boolean;
  retried: boolean;
  committed: boolean;
}

/** Run the migration and commit it, retrying a previous failed commit first. */
export function runReportLayoutMigrationPass(
  config: RepoOSConfig,
  commit: (absPaths: string[]) => boolean,
): ReportLayoutMigrationPassResult {
  let committed = true;
  let retried = false;

  const pending = readReportLayoutMigrationPending(config);
  let pendingFailed = false;
  if (pending.length > 0) {
    retried = true;
    if (!commit(pending.map((p) => join(config.root, p)))) {
      committed = false;
      pendingFailed = true;
    }
  }

  const result = migrateLegacyReportLayout(config);
  let freshFailed = false;
  if (result.absPaths.length > 0) {
    if (!commit(result.absPaths)) {
      committed = false;
      freshFailed = true;
    }
  }

  if (!committed) {
    if (freshFailed) {
      writeReportLayoutMigrationPending(config, [
        ...(pendingFailed ? pending.map((p) => join(config.root, p)) : []),
        ...result.absPaths,
      ]);
    }
  } else {
    clearReportLayoutMigrationPending(config);
  }

  return {
    moved: result.moved.length,
    removed: result.removed.length,
    attempted: result.absPaths.length > 0 || retried,
    retried,
    committed,
  };
}
