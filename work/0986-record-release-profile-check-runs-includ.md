---
handoff_signal_retry_count: 2
id: "0986"
title: "Record release-profile check runs, including failures, in the checks history"
type: bug
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/record-release-profile-check-runs-includ
created_at: "2026-10-31T00:59:20Z"
updated_at: "2026-10-31T03:08:48Z"
---
## Problem

A release attempt (v0.5.74, 2026-10-30) failed during the release check and rolled back the version-bump commit, but the Checks history (`GET /api/check-runs`, `.repoos/checks.db`) has no record of that run. Runs from 14:24Z (close-out #0984) and 15:25Z (pre-review #0985) are present; nothing sits between them for the release. The only output was whatever scrolled past in the terminal, and the pasted tail showed passing tests only, so the failing step could not be identified afterwards.

## Desired UX

Every release-profile check run, passing or failing, is a row in the Checks history with phase `release`, its failed step and its failed tests, the same as pre-review and close-out runs. A release that rolls back keeps its row.

## Acceptance criteria

- [ ] A release-profile check (via `just release` and via the UI release action) writes a `phase: release` row to the check store when it starts and finishes.
- [ ] A failed or killed run records `outcome`, `failedStep` and `failedTests`; a run killed mid-way is marked as such, not left absent.
- [ ] The row survives the release rollback.
- [ ] A test covers a failing release-profile run being recorded.

## Notes for AI

Start from `src/core/check-store.ts` and where the release path invokes the check; find why that path skips recording before changing anything. Do not change the release script's rollback behaviour.

## Activity

- 2026-10-31T00:59:20Z · created · njachowski@gmail.com
- 2026-10-31T03:08:30Z · status inbox→ready
- 2026-10-31T03:08:48Z · status ready→active, branch


