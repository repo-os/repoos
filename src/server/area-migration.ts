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
 * NOT migration work ("Out of scope" in the task). Every patch goes through
 * `patchTaskFile` — the same writer the PATCH route uses, with re-read-before-
 * write and the common activity entry — so the migration never stomps a
 * concurrent task edit and never bypasses the formatting the API produces.
 * Committing is the caller's decision: the boot path commits the whole
 * rewrite in ONE `commitFiles` pass so board files never leave `main` dirty;
 * tests and dry runs skip it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { patchTaskFile } from "./write.js";
import { parseDocument } from "../core/frontmatter.js";
import { formatTaskAreas, parseTaskAreas } from "../core/areas.js";

export interface MigrateAreasResult {
  /** Task files whose `area` frontmatter was rewritten (repo-relative paths). */
  updated: string[];
  /** Files read, for the summary line. */
  scanned: number;
  /** Absolute paths actually rewritten — for the caller's single git commit. */
  rewrittenAbsPaths?: string[];
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

/** Task file extensions, mirroring the indexer's walk. */
function walkTaskFiles(dir: string, exts: string[]): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkTaskFiles(full, exts));
    else if (exts.includes(extname(entry))) out.push(full);
  }
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
      // Via the same safe writer every API patch uses: the on-disk truth is
      // re-read inside patchTaskFile, so a file change landing in between is
      // respected rather than stomped, and serializeTask emits the canonical
      // scalar-or-list form.
      const next = patchTaskFile(config, absPath, { area: canonicalDisplay(raw) });
      rewrittenAbsPaths.push(next.absPath);
      updated.push(relative(config.root, next.absPath));
    } catch {
      /* one unreadable/mid-edit file must not stop the migration */
    }
  }
  return { updated, scanned: files.length, rewrittenAbsPaths };
}
