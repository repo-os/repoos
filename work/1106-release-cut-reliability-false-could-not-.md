---
id: "1106"
title: "Release cut reliability: false 'Could not push main' failure, remote-host git errors, and test time bombs"
type: feature
status: review
priority: p2
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/release-cut-reliability-false-could-not-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T05:18:12Z"
updated_at: "2026-11-14T06:01:40Z"
---
## Problem
Cutting v0.5.83 (2026-11-14) took six attempts. Four distinct causes, all in the release path:
1. Remote validation on host bee failed with "test failure: exit 128" (a git error, not a test) and failed the release.
2. A real test, `update-status.test.ts`, hardcoded "0.5.83" as a fake newer version, so it failed exactly when the release bumped to 0.5.83 (fixed in 925cc480b, but the pattern can recur).
3. After the checks passed, the run failed at `pushing_main` with "Could not push main", yet main had actually reached origin (local and origin/main identical, release commit present). The tag step never ran, so the release stopped half-done and needed another full 15-minute check run to resume.
4. Load-related flakes during the full check (`engineer-resources` heavySlots, `check-skip-outcome` 44s) failed a release gate that passed when rerun.

## Desired UX
A release either completes or fails with an accurate, actionable reason. A push that succeeded is never reported as failed, and a retry after a pushed main resumes at tagging without re-running the full checks. Failures that come from a host or git transport are labelled as such, not as test failures.

## Acceptance criteria
1. Find why `pushing_main` reported failure when the push landed (timeout, ref-update race, or output parsing). After any push error, verify origin/main equals local main before declaring failure; if equal, continue to tagging. Test with a fake remote that errors after accepting the push.
2. A resume where origin/main already holds the release commit skips the check run (or reuses the passed result for the same sha) and goes straight to tagging.
3. Remote validation reports exit 128 / transport errors as host failures with the host named and falls back or retries per the existing policy, not as "test failure".
4. A guard test (or lint) flags hardcoded literals equal to the current package version in tests that fake a newer version.
5. Document the resume behaviour in docs/releases.md.

## Notes for AI
Start from src/server/release.ts (`cutNewRelease`, phases `pushing_main`, `checking`) and src/server/remote-validation.ts. Do not change the release gate itself; only its failure reporting and resume path. Do not cut a release as part of this task.

## Activity

- 2026-11-14T05:18:12Z · created · t@t
- 2026-11-14T05:18:19Z · cli_override, model_override
- 2026-11-14T05:18:21Z · status inbox→ready
- 2026-11-14T05:18:23Z · status ready→active, branch
- 2026-11-14T05:23:01Z · note: adopted orphaned engineer pid 3425
- 2026-11-14T05:27:52Z · body
- 2026-11-14T05:49:44Z · body
- 2026-11-14T05:58:01Z · message_queued at 2026-11-14T05:58:01.299Z
- 2026-11-14T05:58:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T05:59:13Z · body
- 2026-11-14T06:01:22Z · status active→review
- 2026-11-14T06:01:22Z · message_queued at 2026-11-14T06:01:22.704Z
- 2026-11-14T06:01:22Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-14T06:01:40Z · note: review pass 1: failed — no usable report
