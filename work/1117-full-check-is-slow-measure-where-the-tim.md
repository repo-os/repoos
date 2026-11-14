---
updated_at: "2026-11-14T15:09:33Z"
review_passes: 1
id: "1117"
title: "Full check is slow: measure where the time goes and speed it up without weakening the gate"
type: feature
status: review
priority: p2
area: [core, tests]
assigned_to: ai
created_by: t@t
branch: feat/full-check-is-slow-measure-where-the-tim
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T12:33:14Z"
handoff_signal_retry_count: 1
---
## Problem
The full `repoos check` and the close-out gate take 15 to 20 minutes, and the board has reported "checks are slow lately: 9 of the last 10" for hours on 2026-11-14. Slow checks also fail more often under load: they cost three release attempts, a flaky-test task (#1107) and a failed handoff (#1108) in one day. Known heavy files from the release run: `src/ui-app/tests/dev-targets.test.ts` 145s, `remote-host-pool.test.ts` 59s, `agent-review.test.ts` 35s, `handoff.test.ts` 25s, `agent-contract.test.ts` 22s, `task-watchdog.test.ts` 20s. Close-out gates took 987s (#1109) and 1155s (#1107).

## Desired UX
A full check and a close-out gate finish noticeably faster on the same machine, with the same coverage and the same pass/fail meaning. The report says exactly where the time went and what changed.

## Acceptance criteria
1. Measure first: record wall-clock per phase of `repoos check --profile full` (build, lint, tests, smoke, contrast) and the slowest 15 test files and cases, on an otherwise idle machine, in the engineering report.
2. Propose and implement only safe speedups, for example: real sleeps or timeouts replaced by fake timers or event waits, shared fixtures instead of per-test git repos, no duplicate work between phases, better worker splitting for the heaviest files (`vitest.maxWorkers` already 6; do not just raise it).
3. Do not remove, skip or weaken any test, step or guard, and do not change what the close-out gate runs; every speedup keeps the same assertions. Say for each change why it is behaviour-preserving.
4. Before and after numbers in the report for the full check and for the 6 slowest files; the target is a clear reduction (aim for at least 25% on the tests step) or a written explanation of why not.
5. `repoos check` passes; run the full suite twice to show it is not flaky after the changes.

## Notes for AI
Read docs/debugging-check-failures.md and the [[check.steps]] plan in repoos.toml. Edit the plan in repoos.toml, not src/commands/check.ts. Related: #1107 (load-flaky tests), #1101 (remote-host-pool flake). Do not touch release or close-out logic.

## Activity

- 2026-11-14T12:33:14Z · created · t@t
- 2026-11-14T12:33:20Z · cli_override, model_override
- 2026-11-14T12:33:22Z · status inbox→ready
- 2026-11-14T12:33:23Z · status ready→active, branch
- 2026-11-14T12:33:32Z · message_queued at 2026-11-14T12:33:32.380Z
- 2026-11-14T12:36:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T12:47:25Z · body
- 2026-11-14T13:34:24Z · message_overdue: still queued after 60m without being delivered
- 2026-11-14T13:34:26Z · message_queued at 2026-11-14T13:34:26.247Z
- 2026-11-14T14:03:02Z · body
- 2026-11-14T14:30:58Z · body
- 2026-11-14T14:37:52Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-14T14:37:52Z · message_queued at 2026-11-14T14:37:52.392Z
- 2026-11-14T14:37:52Z · ↻ resuming engineer to read queued message
- 2026-11-14T14:37:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The report draft now includes before/after full-check phases, all six named files, the baseline top 15 files and cases, test outcomes, and the reason the test phase improved 21.3% rather than 25%. I’m cleaning out the temporary timing logs… · stderr: Reading additional input from stdin... 2026-11-14T14:36:56.874377Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\"`/bin/zsh -lc 'rm -f .repoos/task1117-working.patch .repoos/task1117-suite1.log .repoos/task1117-suite2.log .repoos/task1117-suite3.log .repoos/task1117-su…
- 2026-11-14T14:37:52Z · message_delivered: 3 message(s)
- 2026-11-14T15:00:33Z · body
- 2026-11-14T15:08:26Z · CTO nudge: held — handoff gate is running
- 2026-11-14T15:08:53Z · status active→review
- 2026-11-14T15:08:53Z · message_queued at 2026-11-14T15:08:53.470Z
- 2026-11-14T15:08:53Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-14T15:09:33Z · note: review pass 1: needs some work

