---
id: 1002
title: Record and report per-test timings in check history
type: feature
status: active
priority: p2
area: [core, cli, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/record-and-report-per-test-timings-in-ch
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-01T14:20:03Z"
updated_at: "2026-11-01T17:06:26Z"
---
## Problem
RepoOS stores per-test-file durations and repoos checks timings reports the ten slowest files, but individual Vitest case timings are only visible in detailed raw output. There is no structured per-test history to answer which cases are slow, whether one case regressed, or how test and hook time differ. Raw output may be truncated and is inconvenient to compare across runs.

## Desired UX
After checks, Nick can query the slowest individual tests for a run or across recent runs, with file, test name, duration, outcome, and run context. Local and remote checks use the same report, without requiring a full output log.

## Acceptance criteria
- Capture structured per-test duration and outcome data from Vitest for local, remote validation, handoff, and close-out checks; do not infer individual timings by parsing human-formatted console output.
- Persist test case records with their check-run identity, test file, stable full test name, duration, and result; handle retries/parameterized tests without collapsing distinct cases.
- Add a documented repoos checks timings interface to list slow test cases for a selected run or recent runs, with stable JSON output and sensible bounds/pagination.
- Make per-test detail available in the Checks UI for a selected run if that page already exposes check history; preserve current file-level timing summary and avoid loading every case into the board view.
- Test local and remote ingestion, output truncation independence, repeated case names in different files, retries, skipped cases, and bounded history cleanup.
- Document how individual test timing differs from file total (including setup/hooks) and how to compare recent runs.

## Notes for AI
Read src/core/test-file-timings.ts, src/core/check-store.ts, src/core/check-results-store.ts, src/commands/checks.ts, src/server/remote-validation.ts, and the Checks page. Prefer a structured Vitest reporter or equivalent source event; keep current per-file records and output compatibility.

## Activity

- 2026-11-01T14:20:03Z · created · njachowski@gmail.com
- 2026-11-01T14:20:24Z · status inbox→ready
- 2026-11-01T14:20:24Z · note: Nick requested structured per-test timing records and a report.
- 2026-11-01T17:05:01Z · status ready→active, branch
- 2026-11-01T17:05:45Z · engineer stopped by request
- 2026-11-01T17:05:56Z · cli_override, model_override
- 2026-11-01T17:06:26Z · note: adopted orphaned engineer pid 31403
