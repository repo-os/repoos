/**
 * Integration-conflict resolution without restarting the full engineering /
 * review cycle (#0692).
 *
 * A task that already passed handoff and review can still fail Move to done
 * because ANOTHER task landed on `main` first and the feature branch now
 * conflicts. Today that failure restarts the whole lifecycle: the close-out
 * job goes `failed`, the task is bounced `review → active`, the engineer
 * re-runs the full handoff, the full gate re-runs, and a whole new feature
 * review is performed — even though the only new information is a handful of
 * conflict hunks. Users read that as "failed development".
 *
 * This module is the deterministic core of the exception. It is deliberately
 * pure and git-free so the classification is testable without a worktree:
 *
 *   1. {@link classifyConflictResolution} decides whether a conflict set is
 *      eligible for the narrow, reviewed *resolution* path, or must fall back
 *      to the full engineering/review cycle. The allowlist is explicit and
 *      narrow (acceptance criteria 2 and 4): staying inside conflict hunks is
 *      NOT proof of semantic safety, so anything whose resolution could change
 *      behavior, expand scope, or cannot be classified confidently returns
 *      `full-handoff-required`.
 *   2. {@link IntegrationResolutionProvenance} / the store record exactly what
 *      was approved, what `main` base it conflicted with, what the resolution
 *      touched, and the reviewer verdict + gate result — so a resolution can
 *      never be published on the strength of a whole-feature review, and the
 *      original review stays tied to its immutable commit (acceptance
 *      criterion 3).
 *   3. {@link canResumeAuthorizedCloseOut} is the single gate that decides
 *      whether the previously-authorized Move to done may resume against the
 *      exact validated tree, or whether main's advance / a dirty tree / a
 *      cancellation / a stale generation has invalidated it (acceptance
 *      criteria 3 and 2).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runGit } from "../core/git.js";

const DEFAULT_CACHE_DIR = ".repoos";

/**
 * The only integration conflicts eligible for the narrow resolution path.
 *
 * Each entry names a *semantic* class, not a file glob, because "the change
 * looks append-only" is exactly the assumption this feature refuses to make
 * (acceptance criterion 4). A class qualifies only when resolving the conflict
 * cannot change any behavior a test could observe:
 *
 *   - `task-bookkeeping` — the closing task's own `work/<id>-*.md` file. Its
 *     branch copy is already authoritative (the merge's `autoResolve`), so this
 *     is a rename of an existing behavior, kept here only so the classifier can
 *     name it and refuse to invent new semantics on top of it.
 *   - `generated-output` — build products under the configured generated dirs
 *     (`dist/`, lockfile-only conflicts). Deterministically regenerable; the
 *     resolution is a rebuild, not a hand edit.
 *   - `disjoint-declarations` — a conflict where every hunk on both sides is a
 *     pure addition of *distinct* lines at distinct positions (a CLI command
 *     registration table, a list of imports, an enum, a test-file registration
 *     list) such that keeping both sides preserves both features and neither
 *     side edits or removes the other's lines. This is the #0728/#0730 shape:
 *     watch + decisions/attention CLI additions. It is allowlisted ONLY when
 *     the classifier can prove the union is a strict superset of each side.
 *   - `lockfile-regenerated` — a package-manager lockfile conflict resolved by
 *     re-running the installer rather than hand-editing.
 */
export type ConflictResolutionClass =
  | "task-bookkeeping"
  | "generated-output"
  | "disjoint-declarations"
  | "lockfile-regenerated";

/**
 * Why a conflict set was classified as it was. Kept as a discriminated tag so
 * callers (and tests) can assert the *reason*, not just the verdict — a failure
 * to classify must be visible, never silently treated as safe.
 */
export type ConflictResolutionReason =
  | "empty-conflict-set"
  | "only-bookkeeping"
  | "only-generated-output"
  | "all-disjoint-declarations"
  | "lockfile-regenerated"
  | "no-prior-feature-approval"
  | "edits-outside-conflict-scope"
  | "overlapping-hunks"
  | "content-edited-not-appended"
  | "unclassifiable-path"
  | "unresolvable-conflict"
  | "resolution-changes-behavior";

export type ConflictResolutionVerdict =
  | {
      eligible: true;
      /** The semantic classes the conflict set maps to. */
      classes: ConflictResolutionClass[];
      reason: ConflictResolutionReason;
    }
  | {
      eligible: false;
      /** The full engineering/review cycle is required. */
      reason: ConflictResolutionReason;
    };

/**
 * One conflicted file, reduced to the minimum the classifier needs. The caller
 * (the close-out orchestrator) reads these from the real merge stage; keeping
 * the shape small means the classifier stays pure and cheap to test.
 */
export interface ConflictedFileSummary {
  /** Repo-relative path (POSIX separators). */
  path: string;
  /**
   * Old-side line ranges that conflicted, per hunk. Each is inclusive
   * `[start, end]`. An empty array means the conflict is whole-file.
   */
  hunks: Array<[number, number]>;
  /**
   * Per hunk, whether BOTH sides are pure *insertions* of distinct new lines
   * (neither side edits or deletes a line the other side kept). Computed by the
   * caller from the merge stage's `diff3` view. A `false` anywhere means the
   * conflict is a genuine edit — never auto-resolvable.
   */
  insertionsOnly: boolean[];
  /** True for the closing task's own `work/<id>-*.md` file. */
  isOwnTaskFile?: boolean;
  /** True for a path under a configured generated-output directory. */
  isGeneratedOutput?: boolean;
  /** True for a package-manager lockfile. */
  isLockfile?: boolean;
  /** True when the two sides touch disjoint line ranges (no overlap). */
  disjoint?: boolean;
}

export interface ClassifyConflictResolutionInput {
  files: ConflictedFileSummary[];
  /**
   * Whether the task already has a recorded, successful feature review for the
   * approved commit. Without one there is NOTHING to shortcut — a resolution
   * built on no prior review has to go through the full cycle (criterion 2).
   */
  hasPriorFeatureApproval: boolean;
  /**
   * True when the proposed resolution edited anything OUTSIDE the conflicted
   * hunks. A resolution that reaches beyond the conflict is a new change, not a
   * resolution, and must go back through engineering/review.
   */
  editsOutsideConflictScope?: boolean;
}

/**
 * Classify a conflict set into "resolution-eligible" vs "full handoff required".
 *
 * Fails closed: any condition the classifier cannot prove safe — an unfamiliar
 * path, an overlapping hunk, a genuine edit rather than an append, no prior
 * approval, edits beyond the conflict — yields `eligible: false` with a
 * reason. The caller must treat `eligible: false` as "run the full cycle".
 */
export function classifyConflictResolution(
  input: ClassifyConflictResolutionInput,
): ConflictResolutionVerdict {
  const { files } = input;

  if (!input.hasPriorFeatureApproval) {
    // The headline rule of the task: no prior approval, no shortcut.
    return { eligible: false, reason: "no-prior-feature-approval" };
  }

  if (input.editsOutsideConflictScope) {
    // A resolution that touches files/hunks other than the conflict is a scope
    // expansion and must be reviewed as ordinary development.
    return { eligible: false, reason: "edits-outside-conflict-scope" };
  }

  if (files.length === 0) {
    // Defensive: an "empty conflict" is not a conflict. Caller probably lost
    // the conflict set; fail closed rather than guessing "nothing to do".
    return { eligible: false, reason: "empty-conflict-set" };
  }

  // Every file must map to exactly one known-safe class. A single unknown or
  // unsafe file makes the WHOLE set ineligible — there is no partial credit,
  // because publishing any of the files publishes all of them.
  const classes = new Set<ConflictResolutionClass>();
  for (const file of files) {
    const classified = classifyFile(file);
    if (!classified.ok) return { eligible: false, reason: classified.reason };
    classes.add(classified.class);
  }

  // Lockfile regeneration is the only class whose full-set resolution is a
  // single deterministic installer run; if ANY non-lockfile class is also
  // present, the reason should name the set that actually determined safety.
  const reason: ConflictResolutionReason = classes.has("disjoint-declarations")
    ? "all-disjoint-declarations"
    : classes.has("lockfile-regenerated")
      ? "lockfile-regenerated"
      : classes.has("generated-output")
        ? "only-generated-output"
        : "only-bookkeeping";

  return { eligible: true, classes: [...classes], reason };
}

type FileClassification =
  | { ok: true; class: ConflictResolutionClass }
  | { ok: false; reason: ConflictResolutionReason };

function classifyFile(file: ConflictedFileSummary): FileClassification {
  if (file.isOwnTaskFile) return { ok: true, class: "task-bookkeeping" };

  if (file.isGeneratedOutput) {
    // A generated path with a hand edit inside it is NOT safe: the determinism
    // guarantee is what makes it regenerable. A conflict whose hunks were
    // edited rather than regenerated is unclassifiable.
    if (file.hunks.some((_, i) => file.insertionsOnly[i] === false)) {
      return { ok: false, reason: "content-edited-not-appended" };
    }
    return { ok: true, class: "generated-output" };
  }

  if (file.isLockfile) return { ok: true, class: "lockfile-regenerated" };

  // The only remaining safe class is a pure, disjoint, insertions-only
  // declaration conflict (the #0728/#0730 CLI registration shape). Anything
  // else — an edit, an overlap, an unknown path — requires the full cycle.
  if (file.hunks.length === 0) {
    // A whole-file conflict has no hunk structure to prove insertions-only.
    return { ok: false, reason: "content-edited-not-appended" };
  }
  if (file.insertionsOnly.some((v) => v !== true)) {
    return { ok: false, reason: "content-edited-not-appended" };
  }
  if (file.disjoint === false) {
    return { ok: false, reason: "overlapping-hunks" };
  }
  if (file.disjoint === undefined) {
    // Disjointness must be positively proven (the classifier is told, or the
    // hunks are trivially distinct). Absent evidence, fail closed.
    return { ok: false, reason: "unclassifiable-path" };
  }
  return { ok: true, class: "disjoint-declarations" };
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Immutable evidence trail for one integration-conflict resolution attempt.
 *
 * Its whole point is that the original feature review is NEVER rewritten: the
 * approved feature commit and its verdict live here unchanged, and the
 * resolution has its OWN separate review + gate records. There is deliberately
 * no field that merges the two — a reviewer reading this cannot mistake a
 * resolution approval for a fresh feature review (acceptance criterion 3).
 */
export interface ResolutionReviewRecord {
  /** Who/what performed the resolution-only review (e.g. "reviewer", "human"). */
  reviewer: string;
  verdict: "pass" | "fail" | "pending";
  /** Commit the resolution review verdict applies to. */
  reviewedCommit: string | null;
  /** When the verdict was recorded (ISO-8601 UTC), null while pending. */
  at: string | null;
  /** Human-readable summary; empty while pending. */
  summary: string;
}

export interface GateRecord {
  result: "pass" | "fail" | "pending";
  /** The exact tree the gate validated — the publication lock's identity. */
  validatedTree: string | null;
  at: string | null;
  /** Which gate mode ran and why (mirrors CloseOutGatePlan.reason). */
  detail: string;
}

export interface IntegrationResolutionProvenance {
  taskId: string;
  /**
   * The feature commit that already passed review. The ORIGINAL review is tied
   * to this immutable SHA and is never re-derived.
   */
  approvedFeatureSha: string;
  /** The `main` tip the feature was merged against when the conflict appeared. */
  mainBaseSha: string;
  /** Repo-relative conflicted paths, sorted for stable comparison. */
  conflictPaths: string[];
  /** The semantic classes the conflict set was classified into. */
  resolutionClasses: ConflictResolutionClass[];
  /**
   * The resolution commit created by resolving against `mainBaseSha`, and the
   * tree it produced. Null until a resolution has been committed.
   */
  resolutionCommit: string | null;
  resolutionTree: string | null;
  /** The resolution-only review, separate from the original feature review. */
  resolutionReview: ResolutionReviewRecord;
  /** The combined gate run on the exact resolved candidate. */
  gate: GateRecord;
  /**
   * Monotonic generation counter bumped every time provenance is (re)written,
   * so a stale in-memory generation can be detected and refused before it
   * publishes an untested edit (acceptance criterion 3).
   */
  generation: number;
  createdAt: string;
  updatedAt: string;
}

export interface WriteProvenanceOptions {
  /** The expected generation; a mismatch refuses the write (stale writer). */
  expectedGeneration?: number;
}

export interface ResolutionProvenanceStore {
  get(taskId: string): IntegrationResolutionProvenance | null;
  /** Create the initial record (generation 0 → 1). Idempotent per task. */
  begin(input: {
    taskId: string;
    approvedFeatureSha: string;
    mainBaseSha: string;
    conflictPaths: string[];
    resolutionClasses: ConflictResolutionClass[];
  }): IntegrationResolutionProvenance;
  /**
   * Merge an update into the record, bumping the generation. Returns null when
   * the record does not exist or the caller's generation is stale.
   */
  update(
    taskId: string,
    patch: Partial<IntegrationResolutionProvenance>,
    opts?: WriteProvenanceOptions,
  ): IntegrationResolutionProvenance | null;
  /** Drop the record once the task is no longer mid-resolution. */
  clear(taskId: string): void;
}

function provenancePath(root: string, cacheDir: string, taskId: string): string {
  return join(root, cacheDir, "integration-resolutions", `${taskId}.json`);
}

function isProvenance(v: unknown): v is IntegrationResolutionProvenance {
  if (!v || typeof v !== "object") return false;
  const p = v as IntegrationResolutionProvenance;
  return (
    typeof p.taskId === "string" &&
    typeof p.approvedFeatureSha === "string" &&
    typeof p.mainBaseSha === "string" &&
    Array.isArray(p.conflictPaths) &&
    typeof p.generation === "number" &&
    !!p.resolutionReview &&
    !!p.gate
  );
}

export function createResolutionProvenanceStore(
  root: string,
  cacheDir: string = DEFAULT_CACHE_DIR,
): ResolutionProvenanceStore {
  function read(taskId: string): IntegrationResolutionProvenance | null {
    const path = provenancePath(root, cacheDir, taskId);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      return isProvenance(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function write(record: IntegrationResolutionProvenance): void {
    const path = provenancePath(root, cacheDir, record.taskId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(record, null, 2));
  }

  return {
    get(taskId) {
      return read(taskId);
    },
    begin(input) {
      const now = new Date().toISOString();
      const existing = read(input.taskId);
      if (existing) return existing;
      const record: IntegrationResolutionProvenance = {
        taskId: input.taskId,
        approvedFeatureSha: input.approvedFeatureSha,
        mainBaseSha: input.mainBaseSha,
        conflictPaths: [...input.conflictPaths].sort(),
        resolutionClasses: [...input.resolutionClasses],
        resolutionCommit: null,
        resolutionTree: null,
        resolutionReview: {
          reviewer: "",
          verdict: "pending",
          reviewedCommit: null,
          at: null,
          summary: "",
        },
        gate: { result: "pending", validatedTree: null, at: null, detail: "" },
        generation: 1,
        createdAt: now,
        updatedAt: now,
      };
      write(record);
      return record;
    },
    update(taskId, patch, opts) {
      const existing = read(taskId);
      if (!existing) return null;
      if (
        opts?.expectedGeneration !== undefined &&
        opts.expectedGeneration !== existing.generation
      ) {
        // A stale writer (an in-flight generation whose tree another run has
        // since replaced) must never overwrite fresher evidence.
        return null;
      }
      const next: IntegrationResolutionProvenance = {
        ...existing,
        ...patch,
        taskId: existing.taskId,
        generation: existing.generation + 1,
        updatedAt: new Date().toISOString(),
      };
      write(next);
      return next;
    },
    clear(taskId) {
      const path = provenancePath(root, cacheDir, taskId);
      try {
        if (existsSync(path)) unlinkSync(path);
      } catch {
        /* best-effort */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Resume gate
// ---------------------------------------------------------------------------

export interface CanResumeInput {
  provenance: IntegrationResolutionProvenance | null;
  /**
   * Whether the ORIGINAL Move to done was already human-authorized (a task in
   * `review`/closing, not a fresh feature). No authorization, no resume.
   */
  authorized: boolean;
  /** The exact tree the gate validated (from provenance), if any. */
  validatedTree: string | null;
  /** The candidate tree about to be published. */
  candidateTree: string | null;
  /** The `main` tip right now. */
  currentMainSha: string;
  /** Main's tip the resolution was validated against. */
  validatedMainBaseSha: string;
  /** True when main's advance since validation is bookkeeping-only. */
  mainAdvanceIsBookkeepingOnly: boolean;
  /** True when the feature worktree is dirty (uncommitted edits). */
  worktreeDirty: boolean;
  /** True when the user cancelled the close-out. */
  cancelled: boolean;
  /** Generation the caller believes is current; a mismatch is stale. */
  expectedGeneration?: number;
}

export type CanResumeResult = { ok: true } | { ok: false; reason: ResumeRefusal; detail: string };

export type ResumeRefusal =
  | "not-authorized"
  | "no-provenance"
  | "resolution-review-not-passed"
  | "gate-not-passed"
  | "tree-mismatch"
  | "main-advanced-with-code"
  | "worktree-dirty"
  | "cancelled"
  | "stale-generation";

/**
 * The single decision point for "may the previously-authorized Move to done
 * resume against the resolved candidate?".
 *
 * Every refusal names why, and the caller falls back to either a bounded
 * revalidation (safe main advance) or the full engineering/review cycle
 * (everything else). It never returns `ok: true` on an unproven tree, a missing
 * review, a missing gate, a dirty worktree, a cancellation, or a stale writer.
 */
export function canResumeAuthorizedCloseOut(input: CanResumeInput): CanResumeResult {
  if (!input.authorized) {
    return { ok: false, reason: "not-authorized", detail: "no previously authorized Move to done" };
  }
  if (input.cancelled) {
    return { ok: false, reason: "cancelled", detail: "the close-out was cancelled by the user" };
  }
  const p = input.provenance;
  if (!p) {
    return {
      ok: false,
      reason: "no-provenance",
      detail: "no recorded conflict-resolution provenance for this task",
    };
  }
  if (input.expectedGeneration !== undefined && input.expectedGeneration !== p.generation) {
    return {
      ok: false,
      reason: "stale-generation",
      detail: `provenance moved from generation ${input.expectedGeneration} to ${p.generation}`,
    };
  }
  if (input.worktreeDirty) {
    return {
      ok: false,
      reason: "worktree-dirty",
      detail: "the feature worktree has uncommitted edits the resolution did not capture",
    };
  }
  if (p.resolutionReview.verdict !== "pass") {
    return {
      ok: false,
      reason: "resolution-review-not-passed",
      detail: "the resolution has not passed its own review",
    };
  }
  if (p.gate.result !== "pass") {
    return {
      ok: false,
      reason: "gate-not-passed",
      detail: "no green combined gate on the resolved candidate",
    };
  }
  // The publication lock checks the EXACT validated tree, not a SHA the job
  // happens to be holding: a rebuilt candidate at a different tree is untested.
  if (!input.validatedTree || !input.candidateTree || input.validatedTree !== input.candidateTree) {
    return {
      ok: false,
      reason: "tree-mismatch",
      detail: `candidate tree ${input.candidateTree ?? "?"} is not the validated tree ${input.validatedTree ?? "?"}`,
    };
  }
  if (input.currentMainSha !== input.validatedMainBaseSha && !input.mainAdvanceIsBookkeepingOnly) {
    return {
      ok: false,
      reason: "main-advanced-with-code",
      detail: `main advanced from ${input.validatedMainBaseSha} to ${input.currentMainSha} with code changes`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Git-level conflict analysis (drives the classifier from real conflict hunks)
// ---------------------------------------------------------------------------

const CONFLICT_START = /^<{7}(?: |$)/;
const CONFLICT_BASE = /^\|{7}(?: |$)/;
const CONFLICT_MID = /^={7}$/;
const CONFLICT_END = /^>{7}(?: |$)/;

interface ConflictRegion {
  /** 1-based line of the `<<<<<<<` marker. */
  startLine: number;
  /** Lines only on the "ours" (main) side. */
  ours: string[];
  /** Lines only on the "theirs" (feature) side. */
  theirs: string[];
  /** True when a diff3 `|||||||` base section was present. */
  hasBase: boolean;
}

/** Parse the conflict-marker regions out of merged content. Exported for tests. */
export function parseConflictRegions(content: string): ConflictRegion[] {
  const lines = content.split("\n");
  const regions: ConflictRegion[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!CONFLICT_START.test(lines[i])) {
      i++;
      continue;
    }
    const region: ConflictRegion = { startLine: i + 1, ours: [], theirs: [], hasBase: false };
    let side: "ours" | "base" | "theirs" = "ours";
    let closed = false;
    for (i = i + 1; i < lines.length; i++) {
      const line = lines[i];
      if (CONFLICT_END.test(line)) {
        closed = true;
        i++;
        break;
      }
      if (side === "ours" && CONFLICT_BASE.test(line)) {
        side = "base";
        region.hasBase = true;
      } else if (side !== "theirs" && CONFLICT_MID.test(line)) side = "theirs";
      else if (side === "ours") region.ours.push(line);
      else if (side === "theirs") region.theirs.push(line);
    }
    if (closed) regions.push(region);
  }
  return regions;
}

/**
 * Whether a conflict region is a *pure inscription* on both sides: neither side
 * removed or rewrote a line the other side kept, so taking the union of (ours +
 * theirs) preserves both sides' intent and adds nothing new. In diff3 terms,
 * the base section is empty (both sides inserted, neither edited), and the two
 * sides' added lines are distinct.
 *
 * A region with any non-empty base section is an EDIT (at least one side
 * changed existing content), which is never behavior-preserving by inspection.
 */
export function regionIsInsertionsOnly(region: ConflictRegion): boolean {
  // diff3 base is present but empty → both sides purely added. If the base
  // section had content we would need it to compare; our parser drops base
  // lines, so we conservatively read "hasBase" as "not provably insertions".
  if (region.hasBase) return false;
  // Whitespace-only / empty sides mean a deletion or an add-only side; either
  // way "insertions only on BOTH sides" is not proven.
  if (region.ours.length === 0 || region.theirs.length === 0) return false;
  // Distinct lines: an identical line on both sides is a re-add/duplicate, not
  // two independent features.
  const ours = new Set(region.ours.map((l) => l.trim()));
  return region.theirs.every((l) => !ours.has(l.trim()));
}

/**
 * Whether the conflicted regions of a file touch disjoint line ranges (no two
 * regions closer than one line apart), so resolving each independently cannot
 * interact.
 */
export function regionsAreDisjoint(regions: ConflictRegion[]): boolean {
  for (let i = 1; i < regions.length; i++) {
    if (regions[i].startLine <= regions[i - 1].startLine + 1) return false;
  }
  return true;
}

export interface AnalyzeConflictOptions {
  /** The closing task's own repo-relative file path, if known. */
  ownTaskFile?: string | null;
  /** Generated-output directory prefixes (e.g. `["dist/"]`). */
  generatedPrefixes?: string[];
  /** Package-manager lockfile basenames. */
  lockfiles?: string[];
}

/** The handful of lockfiles that are safe to resolve by re-running the installer. */
const DEFAULT_LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

/**
 * Analyze the conflict between `branch` and the checkout's `HEAD` (main) using
 * `git merge-tree --write-tree` — which never touches a worktree, the index or
 * any ref — and return a {@link ConflictedFileSummary} per conflicted file.
 *
 * Read-only by construction: the close-out context this feeds must never mutate
 * the feature branch while deciding whether a resolution is eligible.
 */
export async function analyzeConflictForResolution(
  root: string,
  branch: string,
  opts: AnalyzeConflictOptions = {},
): Promise<{ ok: boolean; files: ConflictedFileSummary[]; error?: string }> {
  const run = await runGit(
    root,
    ["merge-tree", "--write-tree", "--name-only", "--no-messages", "HEAD", branch],
    60_000,
  );
  if (run.status === 0) return { ok: true, files: [] };
  if (run.status !== 1) {
    return {
      ok: false,
      files: [],
      error: (run.stderr.trim() || "git merge-tree failed").slice(0, 400),
    };
  }
  const [tree, ...paths] = run.stdout.split("\n").filter((l) => l.trim() !== "");
  if (!tree || !/^[0-9a-f]{40,64}$/.test(tree)) {
    return { ok: false, files: [], error: "git merge-tree produced no merged tree" };
  }
  const generated = opts.generatedPrefixes ?? ["dist/"];
  const lockfiles = opts.lockfiles ?? DEFAULT_LOCKFILES;

  const files: ConflictedFileSummary[] = [];
  for (const path of [...new Set(paths)]) {
    const shown = await runGit(root, ["show", `${tree}:${path}`], 10_000);
    const content = shown.status === 0 ? shown.stdout : "";
    const regions = parseConflictRegions(content);
    const isLockfile = lockfiles.includes(path.split("/").pop() ?? "");
    const isGeneratedOutput = generated.some((p) => path.startsWith(p.endsWith("/") ? p : p + "/"));
    files.push({
      path,
      hunks: regions.map((r) => [r.startLine, r.startLine] as [number, number]),
      insertionsOnly: regions.map(regionIsInsertionsOnly),
      disjoint: regions.length > 0 ? regionsAreDisjoint(regions) : false,
      isOwnTaskFile: opts.ownTaskFile === path,
      isGeneratedOutput,
      isLockfile,
    });
  }
  return { ok: true, files };
}

/**
 * Resolve a file's conflict regions by taking BOTH sides (the union), which is
 * safe ONLY when every region is {@link regionIsInsertionsOnly} — proven by the
 * classifier before this is ever called. Returns the resolved content and how
 * many regions were resolved; a region that is not insertions-only returns
 * `null` so the caller falls back to the full cycle rather than guessing.
 *
 * Pure over the merged content (markers included): no git, no I/O.
 */
export function resolveConflictByUnion(
  content: string,
): { ok: true; content: string; resolved: number } | { ok: false } {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;
  let resolved = 0;
  while (i < lines.length) {
    if (!CONFLICT_START.test(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    // Collect the region inline so we can validate then emit the union.
    const region: ConflictRegion = { startLine: i + 1, ours: [], theirs: [], hasBase: false };
    let side: "ours" | "base" | "theirs" = "ours";
    let closed = false;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (CONFLICT_END.test(line)) {
        closed = true;
        j++;
        break;
      }
      if (side === "ours" && CONFLICT_BASE.test(line)) {
        side = "base";
        region.hasBase = true;
      } else if (side !== "theirs" && CONFLICT_MID.test(line)) side = "theirs";
      else if (side === "ours") region.ours.push(line);
      else if (side === "theirs") region.theirs.push(line);
    }
    if (!closed || !regionIsInsertionsOnly(region)) return { ok: false };
    out.push(...region.ours, ...region.theirs);
    resolved++;
    i = j;
  }
  return { ok: true, content: out.join("\n"), resolved };
}

/**
 * Classify against the real repository state: analyze the branch-vs-main
 * conflict, then run the pure classifier. Returns `eligible: false` (never
 * throws) on any git/analysis failure — the safe default is the full cycle.
 */
export async function classifyConflictForTask(
  root: string,
  branch: string,
  opts: AnalyzeConflictOptions & {
    hasPriorFeatureApproval: boolean;
    editsOutsideConflictScope?: boolean;
  },
): Promise<ConflictResolutionVerdict> {
  const analysis = await analyzeConflictForResolution(root, branch, opts);
  if (!analysis.ok) return { eligible: false, reason: "unresolvable-conflict" };
  return classifyConflictResolution({
    files: analysis.files,
    hasPriorFeatureApproval: opts.hasPriorFeatureApproval,
    ...(opts.editsOutsideConflictScope !== undefined
      ? { editsOutsideConflictScope: opts.editsOutsideConflictScope }
      : {}),
  });
}
