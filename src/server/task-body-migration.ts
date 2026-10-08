/**
 * One-time body normalization for PM-written tasks (#0702).
 *
 * Duplicate `## Activity` headings and a common leading indent break section-
 * aware tools. Every normal write already runs `normalizeTaskBody` inside
 * `serializeTask`; this pass rewrites existing files that still carry the old
 * shapes, without bumping `updated_at` or appending activity entries.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { parseTask, serializeTask, taskBodyNeedsNormalize } from "../core/task.js";

export interface MigrateTaskBodiesResult {
  updated: string[];
  scanned: number;
  rewrittenAbsPaths: string[];
}

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
        continue;
      }
      if (est.isDirectory()) visit(full);
      else if (exts.includes(extname(entry))) out.push(full);
    }
  };
  visit(dir);
  return out;
}

export function migrateTaskBodies(config: RepoOSConfig): MigrateTaskBodiesResult {
  const files = walkTaskFiles(join(config.root, config.workDir), config.taskExtensions);
  const updated: string[] = [];
  const rewrittenAbsPaths: string[] = [];

  for (const absPath of files) {
    try {
      const content = readFileSync(absPath, "utf8");
      const task = parseTask({
        content,
        absPath,
        root: config.root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
      });
      if (!taskBodyNeedsNormalize(task.body)) continue;
      writeFileSync(absPath, serializeTask(task));
      rewrittenAbsPaths.push(absPath);
      updated.push(relative(config.root, absPath));
    } catch {
      /* one unreadable/mid-edit file must not stop the migration */
    }
  }
  return { updated, scanned: files.length, rewrittenAbsPaths };
}

const PENDING_MARKER = "task-body-migration-pending.json";

export function taskBodyMigrationPendingPath(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): string {
  return join(config.root, config.cacheDir, PENDING_MARKER);
}

export function readTaskBodyMigrationPending(
  config: Pick<RepoOSConfig, "root" | "cacheDir">,
): string[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(taskBodyMigrationPendingPath(config), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}

export function writeTaskBodyMigrationPending(
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
    const marker = taskBodyMigrationPendingPath(config);
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, JSON.stringify(rels, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

export function clearTaskBodyMigrationPending(config: Pick<RepoOSConfig, "root" | "cacheDir">): void {
  try {
    rmSync(taskBodyMigrationPendingPath(config), { force: true });
  } catch {
    /* best-effort */
  }
}

export interface TaskBodyMigrationPassResult {
  rewritten: number;
  attempted: boolean;
  retried: boolean;
  committed: boolean;
}

export function runTaskBodyMigrationPass(
  config: RepoOSConfig,
  commit: (absPaths: string[]) => boolean,
): TaskBodyMigrationPassResult {
  let committed = true;
  let retried = false;

  const pending = readTaskBodyMigrationPending(config);
  let pendingFailed = false;
  if (pending.length > 0) {
    retried = true;
    if (!commit(pending.map((p) => join(config.root, p)))) {
      committed = false;
      pendingFailed = true;
    }
  }

  const result = migrateTaskBodies(config);
  let freshFailed = false;
  if (result.rewrittenAbsPaths.length > 0) {
    if (!commit(result.rewrittenAbsPaths)) {
      committed = false;
      freshFailed = true;
    }
  }

  if (!committed) {
    if (freshFailed) {
      writeTaskBodyMigrationPending(config, [
        ...(pendingFailed ? pending.map((p) => join(config.root, p)) : []),
        ...result.rewrittenAbsPaths,
      ]);
    }
  } else {
    clearTaskBodyMigrationPending(config);
  }

  return {
    rewritten: result.updated.length,
    attempted: result.updated.length > 0 || retried,
    retried,
    committed,
  };
}
