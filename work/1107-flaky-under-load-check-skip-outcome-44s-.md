---
id: "1107"
title: "Flaky under load: check-skip-outcome (44s) and engineer-resources heavySlots fail full release checks"
type: feature
status: done
priority: p2
area: [core, tests]
merged_commit: 09b5007b62a4dca3d67cf1ec36b2e11488466d05
assigned_to: ai
created_by: t@t
branch: feat/flaky-under-load-check-skip-outcome-44s-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T07:26:27Z"
updated_at: "2026-11-14T09:05:34Z"
last_close_out_gate_ms: 1154664
last_close_out_gate_at: "2026-11-14T08:51:33.112Z"
review_passes: 1
---
## Problem
Two tests failed the full check during the v0.5.83 release (2026-11-14) only because the machine was loaded, and both pass alone:
1. `src/ui-app/tests/engineer-resources.test.ts` > "shares heavySlots across five engineers from two checkouts" took 2.6s and failed in the first release attempt; it passes in 1.5s alone.
2. `src/ui-app/tests/check-skip-outcome.test.ts` > "cmdCheck — the skipped outcome (#0592) > records a failed release-profile run and its failed step" took 44s under load and was recorded as failed.
Each failure cost a release attempt (about 15 minutes) and forced a rerun.

## Desired UX
The full check is deterministic regardless of machine load. A test that spawns processes or waits on real time uses event-based waits and fixtures with no tight wall-clock assertions, or a justified, bounded timeout, so a release gate does not flip with load.

## Acceptance criteria
1. Reproduce each failure under load (for example with the suite running in parallel, or `REPOOS_STRICT_TIMING` unset with a CPU hog) and record the cause in the task report.
2. Remove the race or the wall-clock dependence in each test; do not simply raise a timeout without saying why that is safe.
3. Both tests pass 20 times in a row under load and alone.
4. No change to production behaviour unless the test exposed a real bug (then say so).

## Notes for AI
Read docs/debugging-check-failures.md first. Precedents: #1101 and #1102 (flaky tests filed from load-related failures). Prefer removing the race over reconciling environments.

## Activity

- 2026-11-14T07:26:27Z · created · t@t
- 2026-11-14T07:53:55Z · cli_override, model_override
- 2026-11-14T07:53:57Z · status inbox→ready
- 2026-11-14T07:53:58Z · status ready→active, branch
- 2026-11-14T07:57:57Z · body
- 2026-11-14T07:59:40Z · status active→review
- 2026-11-14T07:59:41Z · message_queued at 2026-11-14T07:59:41.035Z
- 2026-11-14T07:59:41Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-14T08:01:27Z · note: review pass 1: good to go
- 2026-11-14T08:51:33Z · close-out gate completed in 1155s
- 2026-11-14T08:51:48Z · status done→done, release:success
- 2026-11-14T09:05:34Z · message_dropped: 1 queued message(s) discarded — task is done
