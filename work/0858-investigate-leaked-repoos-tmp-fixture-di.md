---
id: "0858"
title: "Investigate leaked repoos-* tmp fixture dirs ([global-reap] warning)"
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: the agent process exited with an error — open the task to see the full output
priority: p3
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/investigate-leaked-repoos-tmp-fixture-di
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-19T19:04:41Z"
updated_at: "2026-10-19T20:53:40Z"
review_rounds: 2
review_passes: 2
dev_error_count: 1
---
## Problem
During a full local `bun run test` bulk pass (2026-10-20, task #0843 session), the test harness printed:

`[global-reap] removed 74 stale repoos-* fixture dirs from the tmpdir — a test is likely leaking.`

The wrapper reaped them, but 74 leaked dirs means at least one suite creates fixture dirs it never cleans up (mkdtemp without afterEach rm, or a crashed worker mid-suite). Under pool contention a leaking fixture can also break a later run that assumes a clean tmpdir.

## Desired UX
The full suite leaves ~zero stale repoos-* fixture dirs behind; the [global-reap] warning either never fires or fires on a handful of dirs after a crashed worker.

## Acceptance criteria
- Identify which suite(s) leak (the warning's advice: `ls "$TMPDIR" | grep '^repoos-' | sed 's/-[A-Za-z0-9]\{6\}.*//' | sort | uniq -c | sort -rn`).
- Fix the leaking fixture cleanup (afterEach/afterAll rm or try/finally around the worker body).
- A full bulk pass completes without the [global-reap] warning (or documents the expected residual).

## Notes for AI
Repro: run `bun run test` on a loaded machine; the warning prints after the bulk pass. Suspects: suites using mkdtempSync under src/ui-app/tests (remote-host-pool, remote-validation) — both are subprocess-heavy and run long.

## Findings
Measured with an isolated TMPDIR on a full `bun run test` (539 files, 6,628 tests): roughly 200 `repoos-*` dirs were left per pass.

Dominant sources:
- `built-in-agents.test.ts` — 46 `repoos-techdebt-*` (one per test, never cleaned)
- `auto-fix-gate.test.ts` — 23 `repoos-gate-*`
- `built-in-agent-runner.test.ts` — 17 `repoos-runner-*`
- ~20 more files that never cleaned a fixture root, plus `-worktrees` siblings orphaned by a bare `rmSync(root)`.

Separate source outside the test suite: `repoos check`'s UI smoke and contrast steps recreated their fixture dir after cleanup because `server.close()` was not awaited — async dev-target state persistence wrote `.repoos/` after `rmSync`.

Fix: each test file now gets its own tmpdir under a per-run root (`tests/setup/tmp-isolation.ts`); the file's `afterAll` removes it, and `global-reap`'s teardown removes the run root after all workers exit (covering late writes and crashed workers). Smoke/contrast now `await server.close()` before deleting the fixture, and `reapStaleFixtures` scans one nested level for `spawns.log` so nested fixtures' child processes are still killed.

Verification: a full pass now leaves 0 dirs in an isolated TMPDIR; a follow-up run prints no `[global-reap]` warning; smoke and contrast each leave 0 new dirs in the real tmpdir. Residual: a SIGKILLed vitest process can leave one `repoos-vitest-*` run root, reaped by the next run's global sweep once it is 10 minutes old.

## Activity

- 2026-10-19T19:04:41Z · created · njachowski@gmail.com
- 2026-10-19T19:18:47Z · status inbox→ready
- 2026-10-19T19:18:50Z · status ready→active, branch
- 2026-10-19T19:25:29Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-19T19:46:35Z · cli_override, model_override
- 2026-10-19T19:46:36Z · model_override
- 2026-10-19T19:47:39Z · body
- 2026-10-19T20:02:25Z · body
- 2026-10-19T20:04:56Z · body: Findings (added)
- 2026-10-19T20:10:29Z · message_queued at 2026-10-19T20:10:29.924Z
- 2026-10-19T20:10:30Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T20:23:47Z · body
- 2026-10-19T20:25:09Z · body
- 2026-10-19T20:32:37Z · status active→review
- 2026-10-19T20:34:34Z · note: review pass 1: needs some work
- 2026-10-19T20:34:34Z · message_delivered: 1 message(s)
- 2026-10-19T20:34:34Z · status review→active
- 2026-10-19T20:36:04Z · body
- 2026-10-19T20:37:26Z · body
- 2026-10-19T20:38:16Z · body
- 2026-10-19T20:45:44Z · status active→review
- 2026-10-19T20:45:44Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (becf875fb) during finalization (#0734)
- 2026-10-19T20:45:44Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (becf875fb) during finalization (#0734)
- 2026-10-19T20:49:52Z · note: review pass 2: needs some work
- 2026-10-19T20:49:52Z · status review→active
- 2026-10-19T20:51:31Z · body
- 2026-10-19T20:52:19Z · body
- 2026-10-19T20:53:40Z · body
