/**
 * Disk cache for AI-drafted release notes (#0590).
 *
 * A draft costs one to two minutes of agent time, so retrying a release cut
 * that failed its checks should not pay for the same notes twice. Successful
 * drafts are stored under the repo's derived cache dir (`config.cacheDir`,
 * `.repoos/` by default) — gitignored runtime state, safe to delete, never
 * committed and never a task file.
 *
 * ## Key: the release-relevant commit context the draft was made from
 *
 * `releaseNotesCacheKey` sands off everything that cannot change what the
 * notes can say, so routine churn between clicks doesn't invalidate a draft:
 *
 * - **The relevant commit SHAs** — hashed (`#0605`). Commits whose file
 *   changes all sit under the work dir are RepoOS's own task bookkeeping
 *   (`docs(NNNN): add task`, status flips, checkpoints); they carry no
 *   release content and land on main constantly, so keying on HEAD alone
 *   (the #0590 scheme) re-ran the agent after every task move. The key is
 *   now the hash of the non-bookkeeping SHAs in the range, so a
 *   bookkeeping-only commit keeps the key — and the draft — while any
 *   source commit makes a new one.
 * - **`sinceTag`** — compounded outside the hash because it can move while
 *   no commit does: tagging an ancestor reachable from HEAD changes `git
 *   describe`, i.e. the start of the `sinceTag..HEAD` range. Notes for the
 *   new (shorter) range would differ, so they must not hit the old entry.
 *   The converse — a tag landing *on* HEAD — empties the range, and that
 *   path returns empty notes before the cache is consulted.
 *
 * The requested version string is deliberately not part of the key: the draft
 * prompt asks for user-facing notes with no version heading, so the same
 * commit context yields the same notes, and a version typo should not force a
 * two-minute regeneration. The textarea stays freely editable either way —
 * this cache only avoids redundant generation, it never locks content.
 */
import { createHash } from "node:crypto";
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
  /** 2: the key moved from `head::sinceTag` to the hashed relevant SHA list (#0605). */
  version: 2;
  entries: Record<string, ReleaseNotesCacheEntry>;
}

/**
 * The cache key for a draft made from these commits: a digest of the
 * release-relevant SHAs (newest first; an empty list has its own stable
 * digest, though callers never cache or consult that case) compounded with
 * `sinceTag`.
 */
export function releaseNotesCacheKey(relevantShas: string[], sinceTag: string | null): string {
  const digest = createHash("sha256").update(relevantShas.join("\n"), "utf8").digest("hex");
  return `${digest}::${sinceTag ?? ""}`;
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
    if (!parsed || parsed.version !== 2 || typeof parsed.entries !== "object") return null;
    return { version: 2, entries: parsed.entries ?? {} };
  } catch {
    return null;
  }
}

/**
 * Every stored draft, newest first. Used by the release panel to surface a
 * draft that was generated but never made it out with a release. Never
 * throws: a missing or corrupt file simply means no entries.
 */
export function listCachedReleaseNotes(
  root: string,
  cacheDir: string,
): Array<ReleaseNotesCacheEntry & { key: string }> {
  const cache = readCache(root, cacheDir);
  if (!cache) return [];
  return Object.entries(cache.entries)
    .map(([key, entry]) => ({
      key,
      notes: typeof entry.notes === "string" ? entry.notes : "",
      head: typeof entry.head === "string" ? entry.head : "",
      sinceTag: typeof entry.sinceTag === "string" ? entry.sinceTag : null,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
    }))
    .filter((entry) => entry.notes.trim() !== "")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
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
    const payload: ReleaseNotesCacheFile = { version: 2, entries: kept };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Non-fatal: an unwritable cache only costs a regeneration.
  }
}
