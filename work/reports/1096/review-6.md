---
task: "1096"
pass: 6
at: "2026-11-11T23:49:39.303Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "e805352b2:"
---
Repeated review classes: (1) the scanner's decode and window bounds, passes 2–5. The gzip, zlib and zstd fixes landed, but the new 4 MiB raw-scan cap shows the bounds still leak. (2) Refusal paths leaving content staged, passes 3 and 5: mostly fixed, two early returns remain. (3) The stale macOS Hub path, passes 3–5: still open and deferred to sign-off. A human should look at the pattern: each pass finds the next edge of the same bounds.

## Relevance
still relevant — the branch adds the guard main lacks, and #1095 covers only the history purge.

## Evidence
None

## Bugs
1. **Raw scan stops at 4 MiB.** `scanBuffersForSecrets` (`src/core/branch-artifact-guard.ts`) runs `pushHits(buf.slice(0, maxDecompressBytes))`, but the windows and checkpoint blobs run to 5 MiB, so bytes 4–5 MiB are never raw-scanned. Probe: a `sk_live_…` key at 1.0 MB and 4.0 MB hits; at 4.3 MB and 4.9 MB it gives zero hits. An allowlisted 4.3 MiB file holding a key passes `stepBranchArtifacts`, and a checkpoint stages it. Class: decompression limit applied to raw scanning. One raw site, two callers. Fix: raw-scan the whole bounded buffer and cap only inflation output.
2. **Checkpoint ignores the allowlist.** `planCheckpointStaging` never calls `isAllowlistedLargePath`. A dirty file over 5 MiB returns `allowed: []`, so a deliberately allowlisted file blocks every WIP checkpoint on the branch, clean edits included, until someone commits it by hand. Class: allowlist consulted in one path but not its sibling. Fix: share one allowlist-aware scan between both callers.
3. **Hook exempts by filename.** `.githooks/pre-commit` skips the whole artifact guard when every staged path matches `work/[0-9]*-*.md` or `work/reports/*.{md,json}`. A 50 MB or secret-bearing `work/1-x.md` therefore commits on any branch with no warning. The branch gate still catches it at check time. Class: exemption broader than the guard. Fix: exempt only paths that also pass the size and secret checks.
4. **Stale Hub command (regression, repeated).** `repoos.toml:745` still runs `macos/.derived-data/…`, so the dev target launches nothing. This is a one-line human fix at sign-off, not a defect in the diff.

## Edge cases
- Two early returns in `commitWipCheckpointForRemoteGate` (`src/server/engineer-remote-self-check.ts`, "could not stage" and "could not unstage build output") leave paths staged. The hook now blocks a bare commit of build output, which limits the damage.
- The checkpoint scans index blobs but commits worktree bytes (`commit -- paths`), so an edit in between slips through (carried).
- Without Bun, the hook warns and passes.
- The zlib probe inflates up to 4096 candidates to 4 MiB each; a crafted file costs seconds of CPU.

## Suggestions (non-blocking)
- `branch-artifacts` is auto-added only when a declared plan has `task-assets` (`ensureDeclaredCrossCuttingBuiltins`), so other repos get no gate.
- Confirm the new `check.*` schema entries appear in a Settings tab under test; the diff shows none.
- `checkpointMaxStagedFiles` says "skip staging", but hitting it refuses the whole checkpoint. Reword.
- Remove the dead `secrets`/`incomplete` `continue` lines in `planCheckpointStaging` and the unused `MAX_COMPRESSION_EXPANSION_RATIO`.

## Verdict
needs some work — plaintext secrets at 4–5 MiB escape the scan, the checkpoint ignores the allowlist, and the hook exempts work/ files by name

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

