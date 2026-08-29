/**
 * Close-out failure messaging (0215).
 *
 * A failed close-out records the integration job's `phase` and `reason`; the
 * error card used to render one fixed conflict-resolution message for every
 * failure, sending users hunting for conflicts that don't exist (e.g. a
 * `check failed:` reason from the validation gate, with no conflicting files
 * anywhere). This module maps a (phase, reason) pair to the message, the
 * conflicting files, and the guidance the inline error card shows.
 */

/** ANSI SGR escape sequences (colors/styles) — unreadable in a card. */
const ANSI_RE = /\u001b\[[0-9;]*m/g;

/** Strip ANSI SGR escapes so stored reasons render as plain text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * Pull the conflicting file names out of a close-out failure reason. Handles
 * both the orchestrator's `merge conflict in <files> — guidance` form and the
 * legacy `merge conflict: <files>` form; the file list ends where the
 * em-dash/following text begins.
 */
export function extractConflicts(message: string): string[] {
  const forms = [
    "merge conflict in ",
    "merge conflict: ",
    "unresolved conflict markers in ",
  ] as const;
  let hit: { form: string; idx: number } | null = null;
  for (const form of forms) {
    const idx = message.indexOf(form);
    if (idx !== -1 && (hit === null || idx < hit.idx)) hit = { form, idx };
  }
  if (!hit) return [];
  let list = message.slice(hit.idx + hit.form.length);
  const cut = list.search(/—| – |\n/);
  if (cut !== -1) list = list.slice(0, cut);
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Collapse newlines to a single run so a message fits a clamped card line. */
function flatten(s: string): string {
  return s.replace(/\s*\n\s*/g, " · ").trim();
}

/** Longest a headline may run before the full text has to live in `detail`
 *  instead — a raw failure reason (a merge-conflict listing, a build log tail)
 *  can be thousands of characters, and the headline renders unclamped in the
 *  task panel, so an uncapped one turns into an unscrollable wall of text. */
const MAX_HEADLINE = 240;

/** Flatten + cap `s` for use as a headline; the untruncated text belongs in `detail`. */
function headline(s: string): string {
  const flat = flatten(s);
  return flat.length > MAX_HEADLINE ? flat.slice(0, MAX_HEADLINE - 1) + "…" : flat;
}

/** What the failure actually was, derived from phase + reason. */
export type CloseOutFailureKind =
  | "conflict" // a genuine merge conflict: list files + resolve-then-retry
  | "validating" // build/check gate failed: show output, offer retry, no conflicts
  | "dirty" // publish blocked by a dirty tree: name files, commit/stash
  | "syncing" // branch could not be brought up to date with main
  | "publishing" // any other publish-time failure
  | "other";

export function classifyFailure(
  phase: string | undefined,
  reason: string,
  conflicts = extractConflicts(reason),
): CloseOutFailureKind {
  if (conflicts.length > 0 || /merge conflict|unresolved conflict markers/i.test(reason))
    return "conflict";
  if (/^(?:repoos\s+)?(?:check|build) failed:/i.test(reason) || phase === "validating")
    return "validating";
  if (/uncommitted|dirty|would be overwritten|clean at publish|not merged/i.test(reason))
    return "dirty";
  if (phase === "syncing" || /could not.*(?:sync|up to date|bring)/i.test(reason)) return "syncing";
  if (phase === "publishing" || (!phase && reason)) return "publishing";
  return "other";
}

/** The message, conflicting files, step, and guidance shown for a failure. */
export interface CloseOutFailure {
  /** Headline text shown (and clamped) on the error card. */
  message: string;
  /** Files that conflicted (empty for non-conflict failures). */
  conflicts: string[];
  /** Which close-out stage failed, shown as "at <step>". */
  step: string;
  /** Newline-preserving output excerpt for the expanded detail panel. */
  detail?: string;
  /** Guidance paragraph; replaces the default conflict hint when set. */
  hint?: string;
}

const CONFLICT_HINT =
  "RepoOS couldn't sync this branch with main automatically — resolve the conflicting files in the worktree, then retry.";

/**
 * Turn a failed close-out's recorded `phase` + `reason` into what the error
 * card should show. ANSI escapes are stripped here as well as at capture time
 * so previously-persisted reasons (0211-era jobs) render cleanly too.
 */
export function describeCloseOutFailure(
  phase: string | undefined,
  reason: string,
): CloseOutFailure {
  const clean = stripAnsi(reason ?? "").trim();
  const conflicts = extractConflicts(clean);
  const kind = classifyFailure(phase, clean, conflicts);

  switch (kind) {
    case "conflict": {
      const summary = conflicts.length
        ? `Merge conflict in ${conflicts.length} file${conflicts.length === 1 ? "" : "s"}.`
        : clean
          ? headline(clean)
          : CONFLICT_HINT;
      return {
        message: summary,
        conflicts,
        step: "merge",
        detail: clean || undefined,
        hint: CONFLICT_HINT,
      };
    }
    case "validating": {
      // `check failed: <tail>` / `build failed: <tail>` — the tail IS the
      // readable excerpt. Flatten+cap it for the headline; the expanded
      // panel shows the full newline-preserving version.
      const excerpt = clean.replace(/^(?:repoos\s+)?(?:check|build) failed:\s*/i, "").trim();
      return {
        message: `The validation check failed${excerpt ? ` — ${headline(excerpt)}` : "."}`,
        conflicts: [],
        step: "check",
        detail: excerpt || undefined,
        hint: "The build or check gate failed on the merged branch. Fix the failure in the feature branch's worktree, commit, and retry the close-out.",
      };
    }
    case "dirty":
      return {
        message: clean ? headline(clean) : "Main's working tree has uncommitted changes.",
        conflicts: [],
        step: "publish",
        detail: clean || undefined,
        hint: "Main's working tree has uncommitted changes that the merge would overwrite. Commit or stash them on main, then retry.",
      };
    case "syncing":
      return {
        message: clean
          ? `The branch could not be brought up to date with main — ${headline(clean)}`
          : "The branch could not be brought up to date with main.",
        conflicts: [],
        step: "sync",
        detail: clean || undefined,
        hint: "The branch could not be brought up to date with main. Fix the issue in the feature branch's worktree, then retry.",
      };
    case "publishing":
      return {
        message: clean ? headline(clean) : "The merge to main failed at publish time.",
        conflicts: [],
        step: "publish",
        detail: clean || undefined,
        hint: "The merge to main failed at publish time. Retry the close-out.",
      };
    default:
      return {
        message: clean ? headline(clean) : "The close-out failed.",
        conflicts,
        step: "merge",
        detail: clean || undefined,
        hint: "Retry the close-out. If it keeps failing, check the feature branch's worktree for issues.",
      };
  }
}
