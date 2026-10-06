/**
 * Detect when a branch introduces a buildable project (package manifest, Go/Rust
 * module, Gradle wrapper) without a configured check plan — #0697.
 *
 * Markers are matched by basename so nested `apps/web/package.json` counts, not
 * only a root manifest (detectRepoMarkers only reads the repo root).
 */

import { addedPathsVsBase } from "./git.js";

/** Basenames that signal the branch is introducing something buildable. */
export const BUILDABLE_PROJECT_MARKER_NAMES = new Set([
  "package.json",
  "go.mod",
  "Cargo.toml",
  "gradlew",
  "gradlew.bat",
]);

export function pathEndsWithBuildableMarker(repoRelativePath: string): boolean {
  const base = repoRelativePath.split("/").pop() ?? "";
  return BUILDABLE_PROJECT_MARKER_NAMES.has(base);
}

/** True when any path in a changed-path list ends with a buildable marker. */
export function diffTouchesBuildableProjectMarker(paths: readonly string[]): boolean {
  return paths.some(pathEndsWithBuildableMarker);
}

/** True when the branch newly adds a buildable project marker file. */
export function branchAddsBuildableProjectMarker(worktree: string, baseBranch: string): boolean {
  const added = addedPathsVsBase(worktree, baseBranch);
  if (added === null) return false;
  return diffTouchesBuildableProjectMarker(added);
}

/** Actionable handoff/close-out failure when a skipped gate meets a new project. */
export const BRANCH_ADDS_PROJECT_NO_CHECK_PLAN =
  "this branch adds a project but repoos.toml declares no [[check.steps]]; " +
  "run `repoos check --print-plan`, commit the steps, and re-run `repoos check` before handoff";
