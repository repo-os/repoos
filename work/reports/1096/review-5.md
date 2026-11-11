---
task: "1096"
pass: 5
at: "2026-11-11T23:16:00.742Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "a95e5549b:"
---
## Verdict
needs some work — secret scan misses gzip with trailing bytes; allowlist still fails above 5 MiB; refusals leave build output staged

## Relevance
still relevant — main has no branch-artifact guard, and #1095 covers only the history purge.

## Evidence
None

## Bugs
Repros ran in scratch repos under `/tmp`, outside the worktree. Pass-4 items 1, 3, 4 and 5 are verified fixed. Item 2 is not fixed (bug 2). Item 6 is still open (bug 4).

1. **Decode failure falls back silently (fail-open scan).** `scanBuffersForSecrets` (`src/core/branch-artifact-guard.ts:319, 352, 371, 385`) pushes the compressed bytes with no `incomplete` when gunzip, zlib or zstd throws. Repro: a feature-branch commit of `gzip(sk_live_…) + 2 KB of non-zero bytes` yields no violation. Node and Bun both throw on trailing data. Fix: keep partial output (`inflateRawSync(buf.subarray(10), {finishFlush: Z_SYNC_FLUSH})` recovers the key in my probe), and report `incomplete` for anything still undecodable.

2. **Read cap defeats the allowlist.** `evaluateAddedPaths` (`:641`) reads at most 5 MiB and reports `scan-incomplete` for any truncated blob, allowlisted or not. A 6 MiB file on `largeFileAllowlist` still fails the gate. `branch-artifact-guard.test.ts:329` checks only that two other messages are absent, so it passes anyway. Fix: stream the whole blob in chunks with overlap, and assert zero violations.

3. **Refusals leave files staged.** On every planner error, `planCheckpointStaging` returns `allowed: []` (`:882, :902`), and `expandCheckpointPaths` stops at 500 (`:763`). `commitWipCheckpointForRemoteGate` (`src/server/engineer-remote-self-check.ts:164-169`) unstages only the refused paths and the reported build output. Repro: 600 `.derived-data-verify` objects plus `src.ts` staged gives 500 reported, and 101 still staged afterwards. Secret and incomplete refusals leave clean paths staged too. The hook then blocks bookkeeping-only commits. Fix: on any error, unstage all of `pathsToScan` and report every build-output path.

4. **Stale Hub path (regression).** `repoos.toml:745` still execs `macos/.derived-data/…/RepoOS Hub.app`, but `just macos-build` now writes to `~/Library/Caches/RepoOS`, so the dev target launches nothing. This is human-owned config; the one-line fix belongs at sign-off.

## Edge cases
- The scan reads the index, but `git commit -- paths` commits worktree bytes, so an edit in between slips through (open from pass 4).
- `ensureDeclaredCrossCuttingBuiltins` (`src/core/check-plan.ts`) adds the branch step only when a declared plan includes `task-assets`.
- With Bun missing, the pre-commit hook warns and passes.

## Suggestions (non-blocking)
- Batch the per-file `git add` loop in `engineer-remote-self-check.ts`.
- Scan every added or modified blob in `ref..HEAD`. A secret added mid-branch and removed later passes today.
- Remove the dead `MAX_COMPRESSION_EXPANSION_RATIO` and the unreachable `secrets`/`incomplete` lines in `planCheckpointStaging`.
- Make the zstd "no decompressor" test assert something; it passes vacuously when zstd is present.
- Soften `docs/macos-hub-snapshots.md:107`: "default XCTest / Xcode behaviour" is stated as fact while the flag is unverified.

## Verdict
needs some work — secret scan misses gzip with trailing bytes; allowlist still fails above 5 MiB; refusals leave build output staged

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

