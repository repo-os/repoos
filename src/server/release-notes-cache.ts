/**
 * Disk cache for AI-drafted release notes (#0590).
 *
 * A draft costs one to two minutes of agent time, so retrying a release cut
 * that failed its checks should not pay for the same notes twice. Successful
 * drafts are stored under the repo's derived cache dir (`config.cacheDir`,
 * `.repoos/` by default) — gitignored runtime state, safe to delete, never
 * committed and never a task file.
 *
 * ## Key: the commit context the draft was made from
 *
 * `releaseNotesCacheKey` compounds the two facts that decide what the notes
 * can say:
 *
 * - **HEAD's full SHA** — the primary key. No new commits means the same
 *   content to summarize, which is the common retry case.
 * - **`sinceTag`** — kept because it can move while HEAD does not: tagging an
 *   ancestor reachable from HEAD changes `git describe`, i.e. the start of the
 *   `sinceTag..HEAD` range, without a new commit anywhere. Notes for the new
 *   (shorter) range would differ, so they must not hit the old entry. The
 *   converse — a tag landing *on* HEAD — empties the range, and that path
 *   returns empty notes before the cache is consulted.
 *
 * The requested version string is deliberately not part of the key: the draft
 * prompt asks for user-facing notes with no version heading, so the same
 * commit context yields the same notes, and a version typo should not force a
 * two-minute regeneration. The textarea stays freely editable either way —
 * this cache only avoids redundant generation, it never locks content.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Newest entries kept; older ones are dropped so the file stays small. */
const MAX_ENTRIES = 25;

export interface ReleaseNotesCacheEntry {
  notes: string;
  head: string;
  sinceTag: string | null;
  /** ISO timestamp of when the draft was generated. */
  createdAt: string;
}

interface ReleaseNotesCacheFile {
  version: 1;
  entries: Record<string, ReleaseNotesCacheEntry>;
}

/** The cache key for a draft made from this commit context. */
export function releaseNotesCacheKey(head: string, sinceTag: string | null): string {
  return `${head}::${sinceTag ?? ""}`;
}

function cachePath(root: string, cacheDir: string): string {
  return join(root, cacheDir, "release-notes.json");
}

/** Tolerates a missing or corrupt file — both simply mean "nothing cached". */
function readCache(root: string, cacheDir: string): ReleaseNotesCacheFile | null {
  try {
    const parsed = JSON.parse(
      readFileSync(cachePath(root, cacheDir), "utf8"),
    ) as Partial<ReleaseNotesCacheFile> | null;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object") return null;
    return { version: 1, entries: parsed.entries ?? {} };
  } catch {
    return null;
  }
}

/**
 * The stored draft for this commit context, or null on a miss. Never throws:
 * a cache problem must degrade to "generate again", not to a failed cut.
 */
export function readCachedReleaseNotes(
  root: string,
  cacheDir: string,
  key: string,
): { notes: string; createdAt: string } | null {
  const entry = readCache(root, cacheDir)?.entries[key];
  if (!entry || typeof entry.notes !== "string" || !entry.notes.trim()) return null;
  return {
    notes: entry.notes,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
  };
}

/**
 * Persist a successfully generated draft. Called only on the success path, so
 * a failed or empty agent run can never overwrite a good entry. Write failures
 * are swallowed — the worst outcome is regenerating next time.
 */
export function writeCachedReleaseNotes(
  root: string,
  cacheDir: string,
  key: string,
  notes: string,
  meta: { head: string; sinceTag: string | null },
): void {
  if (!notes.trim()) return;
  try {
    const path = cachePath(root, cacheDir);
    const entries = readCache(root, cacheDir)?.entries ?? {};
    entries[key] = {
      notes,
      head: meta.head,
      sinceTag: meta.sinceTag,
      createdAt: new Date().toISOString(),
    };
    const kept = Object.fromEntries(
      Object.entries(entries)
        .sort(([, a], [, b]) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, MAX_ENTRIES),
    );
    const payload: ReleaseNotesCacheFile = { version: 1, entries: kept };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Non-fatal: an unwritable cache only costs a regeneration.
  }
}
