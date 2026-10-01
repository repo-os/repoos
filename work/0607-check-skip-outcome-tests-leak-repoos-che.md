---
id: "0607"
title: check-skip-outcome tests leak REPOOS_CHECK_STORE_ROOT and fail inside release/close-out gates
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/check-skip-outcome-tests-leak-repoos-che
model_override: opencode/muse-spark-1.3-contributor-free
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-30T13:49:15Z"
updated_at: "2026-10-01T07:51:12Z"
---
## Status
The root cause is fixed: `df084118` makes `src/ui-app/tests/setup/check-env.ts` drop `REPOOS_CHECK_STORE_ROOT`, `REPOOS_CHECK_PHASE` and `REPOOS_TASK_ID` from every test worker. Background: `check-skip-outcome.test.ts` failed deterministically inside server-spawned gates (release, handoff, close-out) because those export `REPOOS_CHECK_STORE_ROOT=<real repo>`, so the test's `runCheck(fixtureRoot)` wrote its row to the real `.repoos/checks.db` and found its own store empty. It passed by hand, which made it look flaky.

## Remaining
- Make the check store (`src/core/check-store.ts`) log once when a history write fails instead of swallowing it silently; that silence made this hard to diagnose.
- Audit other tests that call `runCheck`/`cmdCheck` or spawn `repoos check` to confirm none still write to a real store (pre-review rows appeared in the real history at 2026-09-30T13:52:48Z).
- Clean the polluted rows from the real checks.db (being done by hand in the session that filed this; drop this bullet once done).

## Tests
A test that sets `REPOOS_CHECK_STORE_ROOT` to another directory and asserts that directory's checks.db is untouched, plus one for the logged write failure.

## Activity

- 2026-09-30T13:49:15Z · created · unknown
- 2026-09-30T17:57:01Z · body
- 2026-10-01T06:58:35Z · cli_override, model_override
- 2026-10-01T06:58:37Z · cli_override, model_override
- 2026-10-01T06:58:38Z · cli_override, model_override
- 2026-10-01T06:58:41Z · cli_override, model_override
- 2026-10-01T06:58:44Z · model_override
- 2026-10-01T06:58:47Z · review_cli_override, review_model_override
- 2026-10-01T06:58:48Z · review_model_override
- 2026-10-01T06:58:58Z · status inbox→ready
- 2026-10-01T06:59:08Z · status ready→active, branch
- 2026-10-01T07:51:12Z · status active→review
