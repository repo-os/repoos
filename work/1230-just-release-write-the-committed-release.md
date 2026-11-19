---
id: "1230"
title: "just release: write the committed release record (shared/release) so its checks pass, matching the Releases page flow"
type: bug
status: inbox
priority: p2
area: release
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T13:45:13Z"
updated_at: "2026-11-19T13:45:13Z"
---
## Problem
`just release 0.5.92` (run 19 Nov) failed in `repoos check`: tests/release-history.test.ts "the committed release record > matches the package version so every surface names the shipped release" expected '0.5.91' to be '0.5.92'. The recipe only bumps package.json, but releases now also need the committed release record (`CURRENT_RELEASE` in shared/release, with notes), which the Releases page flow writes ("docs(1197): record release" for v0.5.91). So `just release` can't cut a release any more. Nothing was tagged or pushed, and package.json was reverted.

## Desired outcome
`just release <version>` produces the same result as a release cut from the Releases page: package.json, the release record and release notes all updated in one release commit, then checks, tag and push. Or, if the Releases page path is now the only supported way, the recipe calls into that same code path instead of duplicating it.

## Acceptance criteria
- `just release X.Y.Z` on a clean main updates package.json and the committed release record together, so tests/release-history.test.ts passes.
- The tag annotation carries the release notes, like v0.5.91's does.
- If the checks fail, the recipe leaves main as it was (no leftover package.json bump).
- One code path writes the release record for both the recipe and the Releases page, with a test covering the recipe.

## Notes for AI
Start from the `release` recipe in justfile, shared/release.ts (CURRENT_RELEASE, releaseStamp), src/ui-app/tests/release-history.test.ts, and how #1197 recorded v0.5.91 (commit 809a004e9). Don't push or tag while working on this task.

## Activity

- 2026-11-19T13:45:13Z · created · t@t
