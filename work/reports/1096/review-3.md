---
task: "1096"
pass: 3
at: "2026-11-11T21:51:28.320Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "e240a999d:"
---
## Verdict
needs some work — staged deletions block hook and checkpoints; renames bypass the branch guard; 128 KiB+ binaries fail closed

## Relevance
still relevant — no branch-artifact guard exists on main, and #1095 covers only the history purge.

## Evidence
None

## Bugs
Reproduced in a scratch repo under `/tmp` (removed afterwards) using Bun 1.4.4. Each class lists every instance I found.

**1. Staged deletions treated as missing blobs.** The hook blocks any commit that deletes a tracked file, on every branch.
- `gitStagedPaths` (`src/core/branch-artifact-guard.ts:925`) has no `ACMR` filter. `evaluateAddedPaths` then reports "no staged index blob to scan". Reproduced: `git rm` → `ok: false`.
- Checkpoint: `engineer-remote-self-check.ts` passes deleted dirty paths to `git add`, then `planCheckpointStaging` refuses the whole checkpoint. Reproduced.
- Fix: filter to `--diff-filter=ACMR` in both places. Add a deletion test; none exists.

**2. Compressed-probe pre-check measures the file tail.** `decompressZstd`, `tryGunzip` and `tryZlibInflate` (lines 214–256) call `compressionWouldExceedCap(slice.length)`. The slice is the rest of the file, not the compressed frame. Any `1f 8b` pair in a file over about 128 KiB trips `scan-incomplete`. Reproduced: a 300 KB random binary gives three violations on the branch check. The checkpoint path refuses the whole commit on the same condition.
- Node 24 and Bun 1.4.4 both honour `maxOutputLength` (Bun raised `ERR_BUFFER_TOO_LARGE`), so the pre-check can go.
- Fix: remove it and add a random-binary test.

**3. Renames and copies hidden by `--diff-filter=A`.** `gitAddedPathsOnBranch` (line 523).
- Reproduced: `git mv` of a 300 KB file into `x.xcresult/` is reported as `R100`. The branch list is empty, so the build-output rule never fires.
- Reproduced: a rename commit that adds a `sk_live_` key to the new path never lists that path, so the blob is never scanned.
- Fix: `--no-renames`, or include `R`/`C`. Add tests for both cases.

**4. Stale macOS path.** `just macos-build` now writes to `~/Library/Caches/RepoOS/...`, but `repoos.toml:745` still runs `macos/.derived-data/Build/Products/Debug/RepoOS Hub.app`. That preview command will fail. The file is human-owned, so the human should update it in the same change.

## Edge cases
- Reviewed HEAD is `e240a999d` and the worktree is clean. The landing checklist cites `fcb1d8aba` and its "worktree dirty" FAIL is stale. `git merge-tree` shows source files auto-merge; only this task's own `work/1096-*.md` conflicts.
- No engineer report exists for `e240a999d`. The on-disk report is for round 2 (`179cccdfa`), so its claims are not evidence.
- Prior findings: 1 and 5–7 are fixed. 2 is only partly fixed because of bug 3. 3 is fixed but introduced bug 2. 4 fails closed, which is correct but over-triggers (bug 2). 8 is partly fixed: zstd now runs under Node 24, but there are still no regression tests for deletions, renames or random binaries.
- An allowlisted file over 5 MiB always fails `scan-incomplete`, so the allowlist cannot cover it.
- The checkpoint scans the index blob but `commit -- pathspec` commits worktree bytes. A concurrent edit in that window slips past the scan.
- Declared plans without `task-assets` get no `branch-artifacts` step, because injection is keyed on `task-assets`.
- More than 500 added files fails `scan-limit` even when every file is small.
- Modified tracked files are not checked on the branch gate (the spec says "adds"; the hook does check staged modifications).

## Suggestions
- `docs/macos-hub-snapshots.md` states as fact that the diagnostics are "default XCTest / Xcode behaviour", while also saying no disabling flag was verified. Soften it, since the cause is not identified.
- `planCheckpointStaging` lines 795–796 are unreachable; remove them.
- The base64 test uses fixed strings. Generate random ones.

## Automated verification
Not evaluated by reviewer.

## Verdict
needs some work — staged deletions block hook and checkpoints; renames bypass the branch guard; 128 KiB+ binaries fail closed

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

