---
task: "1096"
pass: 9
at: "2026-11-12T00:49:12.722Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "d08e8ad74:"
---
## Verdict
good to go — pass 8's zlib fail-open is fixed; the only open item is the human-owned repoos.toml Hub path

Repeated review classes: (1) decode fallbacks that failed open, passes 5–8. Gzip was fixed in pass 6, and round 8 now recovers truncated zlib streams and reports unrecoverable zlib-shaped files, so this class is closed. (2) Scan size and window bounds, passes 2–6: still bounded and fixed. (3) The in-repo DerivedData path, passes 3–8: the release DMG step is now fixed, and only the repoos.toml:745 Hub dev command still points at the old path, which the human applies on main at sign-off. A human should look at the pattern, since each pass found the next instance in a sibling path.

## Relevance
still relevant — main still has no branch-artifact guard, checkpoint filter or secret scan, and #1095 covers only the history purge.

## Evidence
None

## Bugs
None found

I checked the round 8 fix at `src/core/branch-artifact-guard.ts`. `tryZlibInflate` (about line 288) now treats only a non-empty result as decoded and falls back to raw inflate with `Z_SYNC_FLUSH`. The offset-0 branch (about line 455) reports `incomplete` only when the whole buffer has a valid zlib header. The new tests in `src/ui-app/tests/branch-artifact-guard.test.ts` cover a 60% truncated stream and an unrecoverable one. Zstd and gzip keep their `incomplete` paths. The branch still has no source-file conflict with main.

## Edge cases
- `git merge-tree --write-tree main HEAD` conflicts only in `work/1096-guard-against-huge-build-output-files-in.md`, which close-out resolves from main's copy.
- `repoos.toml:745` still runs `macos/.derived-data/Build/Products/Debug/...`, which this diff moved out of the repo. The branch cannot carry the edit, so it should be applied on main at sign-off.
- Raw zlib recovery also runs on speculative mid-file candidates. Random data can yield a few partial bytes, which are scanned but cannot produce a false positive unless they match a secret pattern. The cost is bounded by the 4,096-candidate cap.

## Suggestions (non-blocking)
- Carried from passes 7–8: the early returns in `commitWipCheckpointForRemoteGate` (`src/server/engineer-remote-self-check.ts`) leave paths staged on a "could not stage" error. Unstage there too.
- Carried from pass 8: the `for f in $staged_artifact` loop in `.githooks/pre-commit` splits on whitespace. Use `-z`.
- Carried from pass 7: `checkpointMaxStagedFiles` says "skip staging", but a breach refuses the whole checkpoint. Reword it.

## Verdict
good to go — pass 8's zlib fail-open is fixed; the only open item is the human-owned repoos.toml Hub path

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

