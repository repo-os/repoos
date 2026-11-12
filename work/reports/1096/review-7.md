---
id: review-7
title: review-7
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/guard-against-huge-build-output-files-in
task: "1096"
pass: 7
at: "2026-11-12T00:07:03.988Z"
agent: reviewer
cli: claude code
model: haiku
state: ok
tree_identity: "e084fc7c5:"
---
Repeated review classes: (1) the secret-scanner size and window bounds, passes 2–6. The pass-6 raw-scan, checkpoint-allowlist and hook-exemption fixes are verified in the code. (2) Refusal paths that leave content staged, passes 3–6. Two early returns in `engineer-remote-self-check.ts` remain, now edge-only. (3) The stale in-repo DerivedData path, passes 3–6. It is still open and has spread to the release workflow. A human should look at the pattern: each pass has found the next instance of the same bounds or path class.

## Verdict
needs some work — DerivedData moved out of the repo, but the release DMG step and the repoos.toml Hub dev command still point at the old in-repo path

## Relevance
still relevant — the guard, checkpoint filter and secret scan are absent on main, and #1095 covers only the history purge.

## Evidence
None

## Bugs
1. **Release DMG packaging uses the old path.** `.github/workflows/macos-hub.yml:102` sets `APP="macos/.derived-data/Build/Products/Release/RepoOS Hub.app"`. The release build at about line 74 now writes to `$REPOOS_MACOS_DERIVED_DATA` (under `runner.temp`), so the Package DMG step fails on every tag release. Fix: use the env var.
Same class, second instance: `repoos.toml:745` runs `just macos-build && exec … 'macos/.derived-data/Build/Products/Debug/RepoOS Hub.app/…'`. That binary no longer exists, so the dev target fails. The repoos.toml edit is one line, and the branch cannot carry it, so apply it on main at sign-off. The engineer's deferral doesn't cover the workflow line, which this diff touched.

## Edge cases
- The incident shape (more than 500 dirty files, e.g. 4,763 build-output files) makes `expandCheckpointPaths` cap out before build-output paths are classified. The whole checkpoint is refused with "Could not fully scan staged content", and the real edits don't commit. The AC allows "fails loudly", so this is not blocking, but it is a usability gap.
- The checkpoint scans index blobs, then re-runs `git add` and `commit -- paths` on worktree bytes. A change in that window goes unscanned. Carried; low risk.
- With no Bun on PATH, the hook warns and passes all non-bookkeeping files. This is documented.
- The zlib probe can run up to 4,096 inflations of up to 4 MiB each. This is bounded, but slow.
- The CI `-resultBundlePath "$REPOOS_MACOS_XCRESULT_DIR/ci.xcresult"` assumes the parent directory exists. I could not verify whether xcodebuild creates it.

## Suggestions (non-blocking)
- In `commitWipCheckpointForRemoteGate`, the "could not stage" and "could not unstage build output" early returns leave paths staged. Unstage there too, and batch the per-file `git add` calls.
- `evaluateAddedPaths` spawns up to three `git log --diff-filter=A` calls per file. Reuse the adding commit from `gitAddedPathsOnBranch`.
- The `flags zstd payloads when no decompressor` test has an `else` branch asserting `>= 0`, which always passes. Tighten it.
- No test asserts that the new `check.*` keys reach Settings → Advanced (tier `guarded`). Add one.
- `hub-snapshots.sh` defaults to `macos/.build/snapshots`, inside the repo and matching the `.build` pattern. It is gitignored, but moving it out would be consistent.
- The hook splits staged names on whitespace (`for f in $staged_artifact`). It fails safe, but `-z` would be correct.
- `checkpointMaxStagedFiles` says "skip staging", but a breach refuses the whole checkpoint. Reword it.
- Remove the dead `continue` lines in `planCheckpointStaging` and the unused `MAX_COMPRESSION_EXPANSION_RATIO`.

## Verdict
needs some work — DerivedData moved out of the repo, but the release DMG step and the repoos.toml Hub dev command still point at the old in-repo path

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

