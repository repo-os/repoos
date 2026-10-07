/**
 * How much of the merge gate a close-out re-runs (#0724).
 *
 * The candidate a Move-to-done validates is the feature branch MERGED with
 * current main. The identical commit already passed the full gate at handoff
 * (the pre-review remote gate), so re-running the whole suite at close-out is
 * only justified when main's advance made the tested tree stale. This module
 * decides which of three modes applies:
 *
 *   reused  — the candidate tree is byte-identical to what the handoff gate
 *             tested (`check_runs.candidate_sha`), or main advanced with
 *             bookkeeping only (work/, inputs/, stories/, dist/ — see
 *             `mainDriftIsBookkeepingOnly`). Only the cheap steps run.
 *   scoped  — main advanced with real changes: run `repoos check --changed
 *             <tested base>` (the task's own diff plus main's advance).
 *   full    — the setting says so, a machinery path (`[[check.fullSuitePaths]]`)
 *             is touched, or this is a release.
 *
 * Pure: no fs, no subprocess. The caller supplies the tree comparison and the
 * changed paths, so every branch is unit-testable.
 */

import type { RepoOSConfig } from "./types.js";

/** The `closeOut.gate` values. */
export type CloseOutGateMode = "full" | "scoped" | "reuse";

/** Default when `[closeOut] gate` is unset (#0724). */
export const DEFAULT_CLOSE_OUT_GATE: CloseOutGateMode = "scoped";

/** How a close-out gate decision resolved, plus the reason to record. */
export interface CloseOutGatePlan {
  /** Which parts of the plan to run. */
  mode: CloseOutGateMode;
  /**
   * True when the test step may be skipped entirely (reused). The cheap
   * build/lint/static guards still run.
   */
  reuseTests: boolean;
  /** True when the test step should run scoped to `changedRef`. */
  scoped: boolean;
  /**
   * Git ref for `repoos check --changed`, when `scoped` — the tested base the
   * candidate's diff is measured against.
   */
  changedRef?: string;
  /** Human-readable record of why this mode was chosen (Checks tab detail). */
  reason: string;
}

/** Read the configured gate mode, defaulting to `scoped`. */
export function resolveCloseOutGateMode(config: RepoOSConfig): CloseOutGateMode {
  const gate = config.closeOut?.gate;
  if (gate === "full" || gate === "scoped" || gate === "reuse") return gate;
  return DEFAULT_CLOSE_OUT_GATE;
}

/** `[check] fullSuitePaths` — prefixes that always force the full suite. */
export function fullSuitePaths(config: RepoOSConfig): string[] {
  const paths = config.check?.fullSuitePaths;
  if (!Array.isArray(paths)) return [];
  return paths.filter((p): p is string => typeof p === "string" && p.trim() !== "");
}

/**
 * The first declared full-suite path touched by `changedPaths`, or null.
 * A prefix matches when a changed path equals it or starts with it as a
 * directory (`hooks/` matches `hooks/ci.sh`; `repoos.toml` matches exactly).
 */
export function touchedFullSuitePath(
  changedPaths: readonly string[],
  paths: readonly string[],
): string | null {
  for (const path of paths) {
    const norm = path.replace(/\/+$/, "");
    if (!norm) continue;
    for (const changed of changedPaths) {
      if (changed === norm || changed.startsWith(`${norm}/`)) return path;
    }
  }
  return null;
}

export interface CloseOutGateInput {
  /** The `closeOut.gate` setting, already resolved. */
  setting: CloseOutGateMode;
  /** True for a release gate — always full. */
  release?: boolean;
  /** Declared `[[check.fullSuitePaths]]`. */
  fullSuitePaths?: readonly string[];
  /**
   * Paths the candidate changes relative to the tested base — the task's own
   * diff plus whatever main added since. Used for the machinery check.
   */
  candidateChangedPaths?: readonly string[] | null;
  /**
   * True when `git diff --quiet <tested tree> HEAD` reports no difference — the
   * candidate is byte-identical to what the handoff gate validated, so nothing
   * needs re-testing. `undefined` means "could not determine" (no tested tree
   * recorded, or a git error): never reuse on unknown.
   */
  treesIdentical?: boolean;
  /**
   * True when main advanced between the tested base and now with real code
   * (not bookkeeping-only). The caller computes this from git; it is the
   * signal that the tested tree may be stale. `undefined` when no tested base.
   */
  mainAdvancedWithCode?: boolean;
  /**
   * A ref to scope against when the tree differs and main advanced with code —
   * normally the tested base SHA. Falls back to the full suite when absent.
   */
  scopeRef?: string | null;
}

/**
 * Decide the close-out gate mode. Order of precedence, each fails safe to a
 * larger run:
 *   1. release, or a setting of `full` → full
 *   2. a touched machinery path → full
 *   3. the candidate tree equals the tested tree, or main advanced with
 *      bookkeeping only → reuse (cheap steps, no test step)
 *   4. otherwise scoped to the tested base (`setting` of `reuse` degrades to
 *      scoped when reuse is unsafe: we never skip the suite on an untested tree)
 */
export function planCloseOutGate(input: CloseOutGateInput): CloseOutGatePlan {
  const fullSuitePaths = input.fullSuitePaths ?? [];
  const changed = input.candidateChangedPaths ?? null;

  if (input.release) {
    return {
      mode: "full",
      reuseTests: false,
      scoped: false,
      reason: "release gate always runs the full suite",
    };
  }

  if (input.setting === "full") {
    return {
      mode: "full",
      reuseTests: false,
      scoped: false,
      reason: "closeOut.gate = full",
    };
  }

  if (changed && changed.length > 0) {
    const touched = touchedFullSuitePath(changed, fullSuitePaths);
    if (touched) {
      return {
        mode: "full",
        reuseTests: false,
        scoped: false,
        reason: `touches machinery path "${touched}" ([check] fullSuitePaths)`,
      };
    }
  }

  if (input.treesIdentical === true) {
    return {
      mode: "reuse",
      reuseTests: true,
      scoped: false,
      reason: "candidate tree is identical to the handoff-tested tree — full suite reused",
    };
  }
  if (input.mainAdvancedWithCode === false) {
    return {
      mode: "reuse",
      reuseTests: true,
      scoped: false,
      reason: "main advanced with bookkeeping only — full suite reused from the handoff-tested tree",
    };
  }

  const scopeRef = input.scopeRef?.trim() || undefined;
  if (!scopeRef) {
    return {
      mode: "full",
      reuseTests: false,
      scoped: false,
      reason: "no tested base to scope against — running the full suite",
    };
  }
  const count = changed ? changed.length : undefined;
  return {
    mode: "scoped",
    reuseTests: false,
    scoped: true,
    changedRef: scopeRef,
    reason:
      `main advanced with code changes — scoped to changed vs ${short(scopeRef)}` +
      (count !== undefined ? ` (${count} path(s))` : ""),
  };
}

function short(sha: string | null): string {
  return sha ? sha.slice(0, 12) : "?";
}
