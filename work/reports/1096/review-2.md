---
task: "1096"
pass: 2
at: "2026-11-11T21:20:04.173Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "179cccdfa:"
---
## Verdict
needs some work — secret scan reads the worktree and index, not the committed blobs; scanner fails open on probes and truncation; config thresholds are ignored; unbounded Bun zstd inflation

## Relevance
still relevant — `main` has no branch-artifact guard, and #1095 covers only the history purge.

## Evidence
None

## Bugs
Probed with scratch repos in /tmp under Bun (outside the worktree). Every item is class-grouped and blocks.

**1. Scan reads a different object than gets committed (secret bypass).** `readBranchAddedBytes` (`src/core/branch-artifact-guard.ts`) reads the worktree first, and `planCheckpointStaging` uses `readStagedPathBytes` (the index blob). Reproduced: a tracked file with a clean index blob and a fake `sk_test_` key in the worktree gives `allowed: ["f.txt"]`, and `git add`/`commit -- path` then commits the worktree bytes. `fileSizeAt` has the same index-first mismatch.

**2. Guard inspects the tree, not the branch history.** `evaluateAddedPaths` (check gate) reads worktree first, and `fileSizeAt` falls back to `stat`. Reproduced: secret committed then overwritten clean → 0 violations; 2 MiB committed then `git rm` → 0 violations. The existing "added then deleted" test passes only because it removes the file rather than rewriting it. Fix: read and size the blob at the adding commit.

**3. Unbounded zstd inflation (Bun path).** `zstdDecompress` and `decompressZstd` call `Bun.zstdDecompressSync(buf)` with no output cap and check size afterwards. Reproduced: an 8 KB zstd frame expands to 256 MiB (RSS 709 MB). Input is capped at ~5 MB, so the expansion ratio can exhaust memory in the gate or hook. Also inflates twice.

**4. Silent drop of unscanned data (fail-open).**
- `scanBuffersForSecrets`: `sorted.slice(0, maxOffsets)` drops gzip/zstd magic offsets beyond the first 512 after `0x78` padding. Reproduced: gzip secret at 700 KB after 0x78 bytes → 0 hits, no `incomplete`.
- `readPathBytes`, `readBranchAddedBytes`, `readStagedPathBytes` truncate at 5 MiB with no `incomplete`. Allowlisted large files are only partly scanned.
- `expandCheckpointPaths` stops at 500 with no violation.

**5. Config-shape mismatch (keys silently ignored).** `resolveBranchArtifactGuardOptions` detects `CheckConfig` only via `"branchArtifactsMaxFileBytes" in check`, but `loadConfig` sets keys individually. Reproduced: with only `branchArtifactsAllowlist` and `checkpointMaxStagedFiles` set, the allowlist is `[]` and the cap is 200. Other keys (`maxScanFiles`, `maxDecompressBytes`, `checkpointMaxBytes`) are read by names that differ from the TOML keys, so they are always defaults. Affects the checkpoint and the hook (both call this path).

**6. Hook exemptions by path (`.githooks/pre-commit` line 20).** `grep -qvE '^(work/reports/|work/[^/]+\.md$|inputs/)'` exempts every file under `inputs/` and `work/reports/`, including binaries, on any branch. AGENTS forbids binaries there.

**7. Fallback handling (`scripts/staged-artifact-pre-commit.mjs`).** If `dist/core/branch-artifact-guard.js` exists but lacks `evaluateStagedForPreCommit`, `loadGuard` returns `undefined` without throwing, and the call at the bottom sits outside the `try`. Result: an uncaught TypeError blocks every non-bookkeeping commit.

**8. Tests that never assert (test-coverage).** The zstd positive test is `skipIf(!Bun.zstdCompressSync)`, and vitest runs on Node 24, which has `zlib.zstdCompressSync`, so it never runs in the gate. "flags zstd when no decompressor" returns early whenever zstd exists, so it asserts nothing. The base64 test uses three fixed strings.

Prior-pass status: fixed (too-large, zstd-missing, scan-limit, early-return unstage, dir expansion, fstat read cap, docs-only exemption, matrix reformat). Still open: items 1, 2, 4 (offsets), 8, and the net-diff note. Engineer report is stale (source `713a75b5`, HEAD `179cccdfa`), so its claims are not evidence.

## Edge cases
- Landing checklist: merge conflicts only in this task's own `work/1096-*.md` (close-out takes main's copy). `git merge-tree` shows no source conflicts.
- Pathspec commit with pre-staged excess paths: the hook scans the whole index, so unrelated staged build output can block a checkpoint.
- Bun missing: the hook warns and passes. That matches "warns or blocks", but the bypass is silent to CI.

## Suggestions
- Docs (`docs/macos-hub-snapshots.md`) assert that no `xcodebuild` flag disables machine-wide diagnostics. This is unverified here; confirm or soften before merge.
- Scan the commit's blob (`git show <adding-commit>:<path>`), not the worktree, for items 1 and 2.
- Use `zlib.zstdCompressSync` when present so the zstd test runs under Node.

## Automated verification
Not evaluated by reviewer.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

