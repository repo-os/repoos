---
id: "1063"
title: Close-out resolves wrong default branch when init.defaultBranch names a missing branch
type: bug
status: done
paths: [src/server/integration-orchestrator.ts, src/core/repo-log.ts]
priority: p1
area: core
merged_commit: fa78573bf52b6d9c9620d396fbfb8a1313187ca5
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-resolves-wrong-default-branch-
created_at: "2026-11-08T12:38:05Z"
updated_at: "2026-11-08T13:48:59Z"
last_close_out_gate_ms: 559631
last_close_out_gate_at: "2026-11-08T13:48:42.577Z"
review_passes: 1
---
## Problem
Reported from the "tiao" project (local-only repo, no remote): `repoos done` fails every time with `could not get main SHA` (integration-orchestrator.ts, sync phase). Confirmed cause: `git config --get init.defaultBranch` is `master` on that host, but the repo's branch is `main`.

The private `resolveDefaultBranch` in `src/server/integration-orchestrator.ts` returns `init.defaultBranch` without checking the branch exists. With no `origin/HEAD` (local-only repo) it returns `master`, and `git rev-parse master^{commit}` fails. Reviewed tasks can't land.

## Acceptance criteria
- One shared default-branch resolver; the private copy in integration-orchestrator.ts is removed.
- Every candidate (origin/HEAD target, `init.defaultBranch`, current branch) is verified as an existing `refs/heads/<name>` before being returned; otherwise fall through to `main`, then `master`, then the checked-out branch.
- The `could not get main SHA` reason includes branch tried, root, exit status, timedOut flag and stderr.
- Tests: `main` branch + `init.defaultBranch=master` + no remote resolves `main`; remote-less repo on `trunk` resolves `trunk`; origin/HEAD with no local ref falls through; failure reason contains stderr/status.
- docs/close-out-pipeline.md row for `could not get main SHA` updated.

## Notes for AI
Verified resolver already exists in `src/core/repo-log.ts` (`resolveDefaultBranch`, checks refs/heads/main then master then HEAD). Other call sites in integration-orchestrator.ts: ~2330, 2650, 3663, 3855. The tiao agent's "needs origin/main" theory is wrong; origin/HEAD falls through correctly. Separate issue, not in scope: review report files shown as inbox tasks.

## Activity

- 2026-11-08T12:38:05Z · created · njachowski@gmail.com
- 2026-11-08T12:38:07Z · needs_input
- 2026-11-08T12:38:16Z · body: Problem (added 1, removed 1); Acceptance criteria (added); Notes for AI (added); Fix (removed); Tests (removed); Separate (not in this task) (removed)
- 2026-11-08T12:43:39Z · needs_input
- 2026-11-08T12:44:57Z · status inbox→ready
- 2026-11-08T12:45:03Z · status ready→active, branch
- 2026-11-08T13:00:43Z · body
- 2026-11-08T13:02:16Z · status active→review
- 2026-11-08T13:02:17Z · message_queued at 2026-11-08T13:02:17.040Z
- 2026-11-08T13:02:17Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T13:04:21Z · note: review pass 1: good to go
- 2026-11-08T13:48:42Z · close-out gate completed in 560s
- 2026-11-08T13:48:59Z · status done→done, release:success
