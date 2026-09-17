/**
 * Deterministic auto-fix verification gate.
 *
 * Before any AI-proposed fix is allowed to skip human review and auto-commit
 * to `main`, it must clear this gate. The gate independently re-checks the
 * AI's claims against the real repo state — no model call inside, pure file
 * I/O. If the gate rejects a fix, the fix goes into the findings/report
 * bundle for a human; the agent never gets to skip review by being confident.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * A fix proposed by an AI agent that claims to correct a doc or source file.
 * The gate verifies each field independently before authorizing an auto-commit.
 */
export interface ProposedFix {
  /** Repo-relative path of the file to edit (e.g. "docs/architecture.md"). */
  doc: string;
  /** Exact text the agent claims is currently in the file. */
  oldText: string;
  /** Replacement text the agent proposes. */
  newText: string;
}

/** Read a file's contents, returning null on any I/O error. */
function safeRead(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Check that a document currently contains the exact `oldText` substring.
 * Returns false when the file is missing, unreadable, or the text is absent
 * (i.e. the AI's claim about current state is stale).
 */
export function docCurrentlyContains(doc: string, oldText: string, repoRoot: string): boolean {
  const abs = join(repoRoot, doc);
  const content = safeRead(abs);
  if (content === null) return false;
  return content.includes(oldText);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".repoos", "coverage"]);
const BINARY_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".ico",
  ".map",
  ".lock",
]);
const MAX_BYTES_PER_FILE = 512_000; // 500 KB cap per file
const MAX_TOTAL_BYTES = 5_000_000; // 5 MB total cap

/**
 * Search up to `maxFiles` files in the repo for `text`. Returns true as soon
 * as any file contains it. Skips binary-like paths (node_modules, .git,
 * dist) and caps total bytes read.
 */
export function repoSearchContains(
  repoRoot: string,
  text: string,
  maxFiles: number = 100,
): boolean {
  if (!text) return true; // empty text is trivially "contained"

  let filesChecked = 0;
  let totalBytes = 0;

  const walk = (dir: string): boolean => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (filesChecked >= maxFiles || totalBytes >= MAX_TOTAL_BYTES) return false;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        if (walk(join(dir, entry.name))) return true;
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (BINARY_EXTS.has(ext)) continue;
        filesChecked++;
        try {
          const abs = join(dir, entry.name);
          const stat = statSync(abs);
          if (stat.size > MAX_BYTES_PER_FILE) continue;
          const content = readFileSync(abs, "utf8");
          totalBytes += content.length;
          if (content.includes(text)) return true;
        } catch {
          // skip unreadable files
        }
      }
    }
    return false;
  };

  return walk(repoRoot);
}

/**
 * Check that the repo actually contains the proposed `newText` somewhere.
 * This catches the case where the AI hallucinates a replacement that doesn't
 * match any real file content — the fix would silently break things.
 *
 * Checks two things:
 * 1. Whether `newText` is an existing file path in the repo (for path renames)
 * 2. Whether `newText` appears as content in any file (for text replacements)
 */
export function repoActuallyContains(repoRoot: string, newText: string): boolean {
  // Check if the newText is a path to an existing file
  if (existsSync(join(repoRoot, newText))) return true;
  // Check if the newText appears as content in any file
  return repoSearchContains(repoRoot, newText, 100);
}

/**
 * The one verification gate every migrated built-in agent must clear before
 * a proposed fix is allowed to auto-commit. Purely deterministic — no model
 * call inside.
 *
 * Returns true only when:
 * 1. The doc currently contains the oldText (the AI's claim is not stale)
 * 2. The repo actually contains the newText (the AI's replacement is real)
 *
 * If either check fails, the fix must be routed to a human for review.
 */
export function isSafeToAutoCommit(fix: ProposedFix, repoRoot: string): boolean {
  if (!docCurrentlyContains(fix.doc, fix.oldText, repoRoot)) return false;
  if (!repoActuallyContains(repoRoot, fix.newText)) return false;
  return true;
}
