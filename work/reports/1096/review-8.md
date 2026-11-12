---
task: "1096"
pass: 8
at: "2026-11-12T00:23:11.185Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/guard-against-huge-build-output-files-in
state: ok
tree_identity: "5cd1da2ac:"
---
Repeated review classes: (1) decode failures that fall through silently, passes 5–7. Gzip was fixed in pass 6, but the zlib branch was never checked and still fails open. This pass found it. (2) Scan size and window bounds, passes 2–6: fixed. (3) The stale in-repo DerivedData path, passes 3–7: the release DMG step is now fixed. Only the repoos.toml Hub command is left, and it is human-owned config. A human should look at the pattern: each pass has found the next instance of the same decode-fallback class in a sibling branch.

## Verdict
needs some work — undecodable zlib payloads pass silently, so a truncated zlib blob can hide a key

## Relevance
still relevant — main has no branch-artifact guard, no checkpoint filter and no secret scan, and #1095 covers only the history purge.

## Evidence
None

## Bugs
1. **Undecodable zlib payloads fail open.** `scanBuffersForSecrets` (`src/core/branch-artifact-guard.ts`, the zlib candidate loop near lines 351–361 and the offset-0 / `slice[0] === 0x78` branch near lines 429–436) runs `tryZlibInflate`, which returns `null` on any error. The `null` is dropped with no `incomplete` entry. Gzip got the raw-inflate recovery and an `incomplete` report in passes 5–6; zlib did not. Probe on the real function: a zlib blob of a 3 KB payload holding a `sk_live_…` key scores `stripe_secret`, but the same blob truncated to 60% scores zero hits and zero `incomplete`, even though the key is still recoverable with raw inflate and `Z_SYNC_FLUSH`. Fix: after the 2-byte header check, recover with raw inflate and `Z_SYNC_FLUSH`, as `tryGunzip` does, and report `incomplete` for a top-level header that stays undecodable. Keep the speculative candidate probes silent, or random binaries will fail the gate. Both zlib instances need the change, and a test should cover the truncated case.
2. **Hub dev command still uses the old path (config, not branch code).** `repoos.toml:745` runs `macos/.derived-data/Build/Products/Debug/…`, which this diff moved out of the repo. This is a regression of the dev target, but the branch cannot carry the edit. Apply it on main at sign-off, as in pass 7.

## Edge cases
- Pass 7's DMG item is fixed. `.github/workflows/macos-hub.yml` now uses `$REPOOS_MACOS_DERIVED_DATA` in the build, verify and package steps, and `-resultBundlePath` for the CI test run. The workflow change cannot be run locally.
- `git merge-tree --write-tree main HEAD` conflicts only in `work/1096-guard-against-huge-build-output-files-in.md`, which the landing checklist already covers. No source file conflicts.
- Without Bun, the pre-commit hook warns and passes. This is documented.

## Suggestions (non-blocking)
- The early returns in `commitWipCheckpointForRemoteGate` (`src/server/engineer-remote-self-check.ts`) leave paths staged on a "could not stage" error. Unstage there too.
- The `for f in $staged_artifact` loop in `.githooks/pre-commit` splits on whitespace. Use `-z` to be correct.
- The zlib probe can run up to 4,096 inflations of up to 4 MiB each. That is bounded but slow.
- Make the `checkpointMaxStagedFiles` description say that a breach refuses the whole checkpoint, not "skip staging".

## Could not verify (environment)
- The `xcodebuild -resultBundlePath` parent directory is not confirmed to exist before the CI run.

## Verdict
needs some work — undecodable zlib payloads pass silently, so a truncated zlib blob can hide a key

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard `lockfile-sync`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.
- Guard `zero-runtime-deps`: **passed** — Negative guard test evidence in changed test(s): src/ui-app/tests/check-plan.test.ts.

