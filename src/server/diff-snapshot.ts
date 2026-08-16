/**
 * Durable task-diff snapshots.
 *
 * A task worktree and branch are intentionally removed after a successful
 * close-out. Keep the reviewed diff in `.repoos/` first so the Changes tab
 * remains useful for completed tasks without retaining Git resources forever.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiffResult, DiffStats } from "../core/git.js";

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_DIR = "diffs";

export interface DiffSnapshot {
  version: typeof SNAPSHOT_VERSION;
  capturedAt: string;
  stats: DiffStats;
  diff: DiffResult;
}

function snapshotPath(root: string, cacheDir: string, taskId: string): string | null {
  // Task IDs are normally numeric, but never let an unexpected ID influence a
  // filesystem path outside RepoOS's cache directory.
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) return null;
  return join(root, cacheDir, SNAPSHOT_DIR, `${taskId}.json`);
}

/** Persist a complete task diff atomically. Best-effort: close-out must not fail solely because history cannot be cached. */
export function saveDiffSnapshot(
  root: string,
  cacheDir: string,
  taskId: string,
  stats: DiffStats,
  diff: DiffResult,
): void {
  const file = snapshotPath(root, cacheDir, taskId);
  if (!file) return;
  let temp: string | null = null;
  try {
    mkdirSync(join(root, cacheDir, SNAPSHOT_DIR), { recursive: true });
    temp = `${file}.${process.pid}.tmp`;
    const snapshot: DiffSnapshot = {
      version: SNAPSHOT_VERSION,
      capturedAt: new Date().toISOString(),
      stats,
      diff,
    };
    writeFileSync(temp, JSON.stringify(snapshot), "utf8");
    renameSync(temp, file);
  } catch {
    /* History is a convenience; never block a successfully validated release. */
  } finally {
    if (temp && existsSync(temp)) {
      try { unlinkSync(temp); } catch { /* best-effort */ }
    }
  }
}

/** Load the captured completed-task diff, or null if this task predates snapshots. */
export function loadDiffSnapshot(root: string, cacheDir: string, taskId: string): DiffSnapshot | null {
  const file = snapshotPath(root, cacheDir, taskId);
  if (!file || !existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<DiffSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      typeof parsed.capturedAt !== "string" ||
      !parsed.stats ||
      !parsed.diff ||
      typeof parsed.stats.filesChanged !== "number" ||
      typeof parsed.stats.additions !== "number" ||
      typeof parsed.stats.deletions !== "number" ||
      typeof parsed.diff.patch !== "string" ||
      typeof parsed.diff.truncated !== "boolean"
    ) return null;
    return parsed as DiffSnapshot;
  } catch {
    return null;
  }
}
