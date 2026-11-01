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
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-01T14:20:03Z"
updated_at: "2026-11-01T20:06:18Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
handoff_signal_retry_count: 1
dev_error_count: 6
engineer_failover: "{\"cli\":\"codex\",\"model\":\"gpt-6-luna\"}"
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

## Shots
```json
[
{
"label": "Runs tab with per-test timing detail",
"target": "default",
"route": "/checks?tab=runs",
"highlight": ".cr-test-timings table",
"steps": [
{
"click": "tr.cr-expandable"
},
{
"waitMs": 400
}
],
"state": "checks:timings"
}
]
```

## Activity

- 2026-11-01T14:20:03Z · created · njachowski@gmail.com
- 2026-11-01T14:20:24Z · status inbox→ready
- 2026-11-01T14:20:24Z · note: Nick requested structured per-test timing records and a report.
- 2026-11-01T17:05:01Z · status ready→active, branch
- 2026-11-01T17:05:45Z · engineer stopped by request
- 2026-11-01T17:05:56Z · cli_override, model_override
- 2026-11-01T17:06:26Z · note: adopted orphaned engineer pid 31403
- 2026-11-01T17:31:22Z · message_queued at 2026-11-01T17:31:22.849Z
- 2026-11-01T17:31:23Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T17:33:41Z · body
- 2026-11-01T17:36:12Z · body
- 2026-11-01T17:36:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T17:42:39Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T17:42:39Z · engineer crash recovery: switched cursor + composer-2.5 → codex + gpt-6-luna after 1/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T17:42:42Z · needs_input
- 2026-11-01T17:42:42Z · message_delivered: 1 message(s)
- 2026-11-01T17:54:37Z · body
- 2026-11-01T18:06:58Z · body
- 2026-11-01T18:10:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T18:15:40Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T18:15:40Z · engineer crash recovery: switched cursor + composer-2.5 → codex + gpt-6-luna after 1/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T18:16:26Z · needs_input
- 2026-11-01T18:16:37Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T18:16:37Z · engineer crash recovery: switched cursor + composer-2.5 → codex + gpt-6-luna after 2/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T18:16:54Z · cli_override, model_override
- 2026-11-01T18:17:09Z · needs_input
- 2026-11-01T18:17:59Z · review_cli_override
- 2026-11-01T18:18:01Z · review_model_override
- 2026-11-01T18:18:15Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T18:18:15Z · engineer crash recovery: switched cursor + composer-2.5 → codex + gpt-6-luna after 3/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T18:18:18Z · needs_input
- 2026-11-01T18:18:19Z · agent exited with an error (copilot) · error: --no-remote was removed. Use /remote off in a session; manage incoming connections in /environments.
- 2026-11-01T18:18:19Z · engineer crash recovery: surfaced instead of switching — a human-set task override (github copilot + default) is pinned, so RepoOS did not replace it (1/3 crashes in 30m)
- 2026-11-01T18:18:27Z · needs_input
- 2026-11-01T18:19:14Z · agent exited with an error (copilot) · error: --no-remote was removed. Use /remote off in a session; manage incoming connections in /environments.
- 2026-11-01T18:19:14Z · engineer crash recovery: surfaced instead of switching — a human-set task override (github copilot + default) is pinned, so RepoOS did not replace it (2/3 crashes in 30m)
- 2026-11-01T18:24:54Z · cli_override
- 2026-11-01T18:24:55Z · model_override
- 2026-11-01T18:25:00Z · needs_input
- 2026-11-01T18:35:45Z · body
- 2026-11-01T18:38:24Z · body
- 2026-11-01T19:37:17Z · status active→review
- 2026-11-01T19:38:24Z · note: review pass 1: needs some work
- 2026-11-01T19:38:26Z · status review→active
- 2026-11-01T19:38:28Z · CTO nudge: held — remote validation is running
- 2026-11-01T19:50:02Z · body
- 2026-11-01T20:00:44Z · message_queued at 2026-11-01T20:00:44.765Z
- 2026-11-01T20:00:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T20:04:25Z · body
- 2026-11-01T20:05:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T20:06:18Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T20:06:18Z · message_delivered: 1 message(s)
