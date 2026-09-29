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
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
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
