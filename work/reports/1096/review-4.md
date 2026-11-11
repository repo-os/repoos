---
task: "1096"
pass: 4
at: "2026-11-11T22:16:44.539Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "b59135b9f:"
---
## Verdict
needs some work — the branch gate misses secrets added after a file's first commit, the allowlist can't cover files over 5 MiB, and zlib payloads at non-zero offsets are not scanned

## Relevance
still relevant — `main` has no branch-artifact guard, and #1095 covers only the history purge.

## Evidence
None

## Bugs
Probes ran in scratch repos under `/tmp`. Each class lists every instance I found.

1. **Branch gate reads the adding commit, not the branch's final content.** `evaluateAddedPaths` uses `fileSizeAtBranchIntroduced` and `readBranchIntroducedBlob` (`src/core/branch-artifact-guard.ts`). Repro: `notes.txt` is added as "hello", then a later commit writes `sk_live_…`. The gate returns `[]`. A file that grows past 1 MB after its add also passes. Fix: size and scan `HEAD:path`, or every added or modified blob in `ref..HEAD`.
2. **Bounded git reads fail instead of truncating.** `readGitBlobBounded` sets `maxBuffer: toRead + 64`, so any blob over 5 MiB returns null. Instances: `readBranchIntroducedBlob`, `readStagedIndexBlob`, `readStagedPathBytes`. Repro: a 6 MiB file on `largeFileAllowlist` yields `scan-incomplete: could not read blob`. The `truncated` branches are unreachable for git reads, so the allowlist cannot cover big files. Fix: stream with a capped read, as `readBoundedWorktreeFile` does.
3. **zlib payloads are only tried at offset 0 or at gzip/zstd offsets.** `scanBuffersForSecrets` builds `prioritized` from those offsets only, and the `slice[0] === 0x78` branch never sees other offsets. Repro: `"AAAA" + deflateSync(key)` gives 0 hits. Fix: probe valid zlib headers at offsets the way gzip is probed, with a bound, and add a non-zero-offset test.
4. **Directory expansion silently truncates.** `walkDirFiles` subtracts `out.length` from the budget and also decrements `budget` locally. Repro: two 300-file directories with a 500 cap list 500 of 600 files with `capped: false`. Directory symlink cycles also recurse without decrementing the budget. Fix: one budget counter and set `capped` on any cut-off.
5. **Hook fallback blocks commits when `dist/` is stale.** In `scripts/staged-artifact-pre-commit.mjs`, `loadGuard` throws when `dist/core/branch-artifact-guard.js` exists but lacks `evaluateStagedForPreCommit`. The outer catch then exits 1 on every non-bookkeeping commit on every branch, including main, until `bun run build`. The missing-dist branch falls back to src. Fix: fall back to src on any dist load failure.
6. **Stale output path (carried from pass 3, unchanged).** `repoos.toml:745` still runs `macos/.derived-data/...`. That is human-owned config, but the preview command fails until it is updated.

Prior findings: pass 3 items 1–3 are fixed, and I confirmed Bun's `zstdDecompressSync` honours `maxOutputLength`. Pass 2 items 1–2 are only fixed for the checkpoint path (bug 1 is the branch-gate half), item 4 is partly fixed (bug 2), and items 5–6 are fixed.

## Edge cases
- The checkpoint scans the index blob and then commits with `commit -- pathspec`, which takes worktree bytes. A concurrent edit between the two slips through.
- `planCheckpointStaging` still has unreachable `secrets`/`incomplete` `continue` lines.
- Each file can trigger up to 512 inflations of up to 4 MiB each. That is bounded memory but a large CPU cost.
- With bun missing, the hook warns and passes, so the guard is silent there.

## Suggestions
- Remove the dead `MAX_COMPRESSION_EXPANSION_RATIO` constant and the unreachable lines above.
- `macos/README.md` and `hub-snapshots.sh` still default snapshots to `macos/.build/snapshots`, which the `.build` rule matches. Move them outside the tree or note it.
- `docs/macos-hub-snapshots.md` still says the diagnostics are "default XCTest / Xcode behaviour", which is unverified. Soften it.

## Verdict
needs some work — the branch gate misses secrets added after a file's first commit, the allowlist can't cover files over 5 MiB, and zlib payloads at non-zero offsets are not scanned

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

