/**
 * Merge-conflict inspector for a task branch.
 *
 * A failed Move to done (or a failed "Sync with main") is usually a real merge
 * conflict, but the failure only names the files. This computes the conflict
 * on demand — `git merge-tree --write-tree` never touches a worktree, the
 * index or any ref — and renders each conflicted file as a unified-diff-shaped
 * patch the Changes tab's diff UI can display unchanged: `-` lines are main's
 * side of a conflict, `+` lines are the branch's side.
 *
 * Computed live rather than stored, so it always reflects the current main and
 * is empty the moment the conflict is resolved.
 */

import { runGit } from "../core/git.js";

export interface MergeConflictReport {
  /** Whether the git probe ran cleanly (false = see `error`). */
  ok: boolean;
  /** True when merging the branch into main would conflict. */
  conflicted: boolean;
  /** Per-file unified-diff-shaped patches, concatenated. */
  patch: string;
  /** Conflicted paths that made it into `patch`, in git's order. */
  files: string[];
  /** True when the patch was cut at {@link MAX_PATCH_BYTES}. */
  truncated: boolean;
  error?: string;
}

/** Same ~250 kB ceiling the Changes tab's own diff uses. */
const MAX_PATCH_BYTES = 250_000;
const CONTEXT_LINES = 3;

const START = /^<{7}(?: |$)/;
const BASE = /^\|{7}(?: |$)/;
const MID = /^={7}$/;
const END = /^>{7}(?: |$)/;

/**
 * Turn merged file content (with conflict markers) into a diff-shaped patch.
 * Exported for tests.
 */
export function conflictPatchForContent(filename: string, content: string): string {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  interface Region {
    start: number;
    end: number;
    ours: string[];
    theirs: string[];
  }
  const regions: Region[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!START.test(lines[i])) {
      i++;
      continue;
    }
    const region: Region = { start: i, end: i, ours: [], theirs: [] };
    let side: "ours" | "base" | "theirs" = "ours";
    let closed = false;
    for (i = i + 1; i < lines.length; i++) {
      const line = lines[i];
      if (END.test(line)) {
        region.end = i;
        closed = true;
        i++;
        break;
      }
      if (side === "ours" && BASE.test(line)) side = "base";
      else if (side !== "theirs" && MID.test(line)) side = "theirs";
      else if (side === "ours") region.ours.push(line);
      else if (side === "theirs") region.theirs.push(line);
    }
    if (closed) regions.push(region);
  }

  const head = `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n`;
  if (regions.length === 0 || content.includes("\u0000")) {
    return (
      head +
      "@@ conflict — no inline markers (binary file, or deleted on one side and changed on the other) @@\n"
    );
  }

  const out: string[] = [];
  let prevEnd = -1;
  regions.forEach((r, n) => {
    const ctxStart = Math.max(prevEnd + 1, r.start - CONTEXT_LINES);
    const next = regions[n + 1];
    const ctxEnd = Math.min(
      lines.length - 1,
      r.end + CONTEXT_LINES,
      next ? next.start - 1 : Number.POSITIVE_INFINITY,
    );
    out.push(
      `@@ conflict ${n + 1} of ${regions.length} · line ${r.start + 1} · main (−) vs branch (+) @@`,
    );
    for (let l = ctxStart; l < r.start; l++) out.push(` ${lines[l]}`);
    for (const l of r.ours) out.push(`-${l}`);
    for (const l of r.theirs) out.push(`+${l}`);
    for (let l = r.end + 1; l <= ctxEnd; l++) out.push(` ${lines[l]}`);
    prevEnd = ctxEnd;
  });
  return head + out.join("\n") + "\n";
}

/**
 * Probe merging `branch` into the checkout's current HEAD (main) and describe
 * every conflicted file. Paths under `ignorePrefixes` (task bookkeeping the
 * close-out auto-resolves) are left out, matching what the pipeline reports.
 */
export async function computeMergeConflict(
  root: string,
  branch: string,
  opts: { ignorePrefixes?: string[] } = {},
): Promise<MergeConflictReport> {
  const empty = { conflicted: false, patch: "", files: [], truncated: false };
  const run = await runGit(
    root,
    ["merge-tree", "--write-tree", "--name-only", "--no-messages", "HEAD", branch],
    60_000,
  );
  if (run.status === 0) return { ok: true, ...empty };
  if (run.status !== 1) {
    return {
      ok: false,
      ...empty,
      error: (run.stderr.trim() || "git merge-tree failed").slice(0, 400),
    };
  }

  // Output: the merged tree's oid, then one conflicted path per line.
  const [tree, ...paths] = run.stdout.split("\n").filter((l) => l.trim() !== "");
  const ignore = opts.ignorePrefixes ?? [];
  const wanted = [...new Set(paths)].filter((p) => !ignore.some((pre) => p.startsWith(pre)));
  if (!tree || !/^[0-9a-f]{40,64}$/.test(tree)) {
    return {
      ok: false,
      ...empty,
      error: (run.stderr.trim() || "git merge-tree produced no merged tree").slice(0, 400),
    };
  }
  if (wanted.length === 0) return { ok: true, ...empty };

  let patch = "";
  let truncated = false;
  const files: string[] = [];
  for (const path of wanted) {
    const shown = await runGit(root, ["show", `${tree}:${path}`], 10_000);
    const section = conflictPatchForContent(path, shown.status === 0 ? shown.stdout : "");
    if (patch.length + section.length > MAX_PATCH_BYTES) {
      truncated = true;
      break;
    }
    patch += section;
    files.push(path);
  }
  return { ok: true, conflicted: true, patch, files, truncated };
}
