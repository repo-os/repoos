---
id: "1117"
title: "Full check is slow: measure where the time goes and speed it up without weakening the gate"
type: feature
status: active
priority: p2
area: [core, tests]
assigned_to: ai
created_by: t@t
branch: feat/full-check-is-slow-measure-where-the-tim
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T12:33:14Z"
updated_at: "2026-11-14T12:36:49Z"
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
