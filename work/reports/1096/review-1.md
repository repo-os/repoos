---
task: "1096"
pass: 1
at: "2026-11-11T18:38:22.034Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "d3123d4cc:"
---
## Verdict
needs some work — secret scan fails open on bounds and offsets, checkpoint early-return leaves build output staged, hook exemptions

## Relevance
still relevant — no branch-artifact guard exists on main, and #1095 covers only the history purge.

## Evidence
None

## Bugs
Each class is listed once with every instance I found. I reproduced the first and third with scratch repos under /tmp.

**Fail-open scanner (bounds and offsets)**
- `branch-artifact-guard.ts` `scanBuffersForSecrets`: a payload that inflates past `maxDecompressBytes` returns null and is silently unscanned. Reproduced: a 5 MiB zero-padded gzip with a `sk_test_` key gives 0 hits.
- Same function: compressed blobs are tried only at offset 0 and about 24 sampled offsets. Reproduced: a gzip blob at offset 700 KB inside a binary gives 0 hits. Embedded blobs are the real xcresult threat.
- Same function: Node without `zlib.zstdDecompressSync` returns null, so zstd is silently unscanned.
- `evaluateAddedPaths`: files past `maxScanFiles` are skipped silently, and the step still reports "passed".

**Checkpoint lifecycle ordering**
- `commitWipCheckpointForRemoteGate` returns on `staging.error` (secret, or "nothing left") before the build-output/oversize unstage and before the #1076 foreign-bookkeeping unstage. Pre-staged build output and foreign `work/` files stay in the index for the next bare commit.
- Unstaged build output and oversize paths are never reported. The spec requires reporting; success just returns null.

**Directory entries not expanded**
- `dirtyFiles` runs `git status --porcelain` without `-uall`, so an untracked `dump/` arrives as `dump/`. `planCheckpointStaging` stats a directory, so it gets no size or scan. Reproduced: `dump/` (3 MB plus a secret) is allowed.

**Unbounded read**
- `readPathBytes` calls `readFileSync(abs)` and then `subarray`, so it loads the whole file before capping. It runs before the size cap in both `planCheckpointStaging` and `evaluateAddedPaths`.

**Pre-commit hook**
- `.githooks/pre-commit` exempts the whole guard when every staged path is under `docs/`, `user-docs/` or `inputs/`. Reproduced: a docs-only stage skips it.
- `scripts/staged-artifact-pre-commit.mjs` calls `evaluateStagedForPreCommit(top, {})`, so `[check]` thresholds, patterns and allowlist are ignored.
- Fallbacks hard-fail: no bun exits 1 on every non-bookkeeping commit, and a stale `dist/` missing the export throws and blocks.

**Net diff, not history**
- `gitAddedPathsVsRef` uses `--diff-filter=A main...HEAD`, and the scan reads the worktree. A file added then deleted on the branch stays in history unscanned. An unresolvable ref returns `skipped`, which passes.

**Acceptance criteria not met**
- The zstd test is `skipIf(!Bun.zstdCompressSync)`, and vitest runs on Node, so no zstd path runs in the gate. The "random base64" test uses one fixed string.
- No tests for checkpoint secret refusal, cap unstaging, hook blocking (the hook test change only copies files), the `branch-artifacts` step wiring, or embedded blobs.
- The cause of the machine-wide diagnostics is neither identified nor disabled; the docs describe only the symptom.

## Edge cases
- Landing checklist: task scope FAIL because `repoos.toml` is on the branch. Move the step to main before landing.
- The secret scan reads the worktree, not the staged blob, so a file can change between scan and `git add`.
- On a checkpoint refusal the remote gate is skipped, and the local gate does not scan the dirty secret file.
- Only build output dirty makes the self-check fail. This matches "fail loudly", but it should be stated.

## Suggestions
- Revert the unrelated 271-line `matrix.json` reformat.
- Scan the staged blobs (`git cat-file`) instead of the worktree.
- `planCheckpointStaging` receives `CheckConfig` while `evaluateAddedPaths` takes option objects. It works by accident, so use one shape.

## Verdict
needs some work — secret scan fails open on bounds and offsets, checkpoint early-return leaves build output staged, hook exemptions

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

