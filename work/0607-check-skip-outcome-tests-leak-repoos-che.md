---
id: "0607"
title: check-skip-outcome tests leak REPOOS_CHECK_STORE_ROOT and fail inside release/close-out gates
type: bug
status: inbox
priority: p1
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-30T13:49:15Z"
updated_at: "2026-09-30T13:49:15Z"
---
## Problem
A release cut failed its test step on `src/ui-app/tests/check-skip-outcome.test.ts` > 'records the skipped run in the SQL history for the Runs tab' (`expected 0 to be greater than 0`). It is NOT a flake: it fails deterministically whenever the suite runs inside a server-spawned gate.

Cause: release (`src/server/release.ts:507`), handoff (`handoff.ts:191`) and the integration orchestrator (`integration-orchestrator.ts:1751`) export `REPOOS_CHECK_STORE_ROOT=<real repo root>`. `resolveCheckStoreRoot` in `src/commands/check.ts` honours it, so the test's `runCheck([], fixtureRoot)` writes its skipped row into the REAL `.repoos/checks.db`, and `getCheckStore(fixtureRoot).list()` finds nothing. Reproduced: `REPOOS_CHECK_STORE_ROOT=<repo> bunx vitest run tests/check-skip-outcome.test.ts` fails; without it, 7/7 pass. It passes by hand, so it looks flaky.

Side effect: the test pollutes the real history with fake 'skipped / No check plan configured' rows (e.g. release-phase rows 481/482 at 2026-09-30T13:23:14Z).

## Change
- In check-skip-outcome tests (and audit other tests that call runCheck/cmdCheck), delete or override `REPOOS_CHECK_STORE_ROOT` and the phase/task env vars in beforeEach and restore after; ideally a shared test setup that scrubs all REPOOS_CHECK_* env so no test can write to the real store.
- Also stop the store swallowing write failures silently where feasible (log once), since silent failure made this hard to diagnose.
- Delete the polluted skipped rows from the real checks.db (human authorization needed; do not do it blindly).

## Tests
The test passes with `REPOOS_CHECK_STORE_ROOT` set to another directory and leaves that directory's checks.db untouched.

## Activity

- 2026-09-30T13:49:15Z · created · unknown
