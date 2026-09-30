---
id: "0589"
title: Record failing test names for remote check runs
type: feature
status: inbox
priority: p2
area: [server, web]
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: default
created_at: "2026-09-29T22:14:45Z"
updated_at: "2026-09-30T00:26:57Z"
---
## Problem

#28b2bec2 added a `failed_tests` column to `.repoos/checks.db` and fills it for local `repoos check` runs. Runs executed on a remote validation host (the mini, etc.) do not get it: `recordRemoteRunHistory` in `src/server/remote-validation.ts` records `failedStep: "remote-validation"` and a clipped `detail`, never `failedTests`. Pre-review and close-out gates usually run remotely, so the gap covers exactly the runs where "which test failed?" comes up most.

Motivating case: a release check failed on one of 3,949 tests. The stored detail was a ~1.5KB log tail that had lost the test's name, so diagnosing it meant re-running the suite. Separately, release run 285 failed at step `remote-validation` with nothing more specific recorded.

## Goal

Every failed check run in the history says which tests failed, whether it ran locally or remotely.

## Acceptance criteria

- [ ] A failed remote run records `failedTests`, using `extractFailedTests` (`src/core/check-failure-summary.ts`) on the remote output, or a structured result the remote runner already returns if there is one.
- [ ] `failedStep` for a remote failure names the real failing step (e.g. `tests`) when it is known, not only `remote-validation`; `remote-validation` stays for dispatch or transport failures.
- [ ] The Runs tab shows the same count and hover list for remote rows.
- [ ] Test covering a remote failure that yields test names, and one where output has none.
- [ ] `user-docs/check.md` no longer says remote runs lack test names.

## Activity

- 2026-09-29T22:14:45Z · created · unknown
- 2026-09-30T00:26:57Z · cli_override, model_override
