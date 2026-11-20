---
id: "1257"
title: "QA pass: Work board search, saved filters and sort persistence across reloads"
type: bug
status: done
priority: p2
area: web
merged_commit: 769eb05151fa7ee1b392864747740c165120ec16
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-search-saved-filters-
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:07:29Z"
updated_at: "2026-11-20T03:33:05Z"
last_close_out_gate_ms: 883769
last_close_out_gate_at: "2026-11-20T03:31:57.180Z"
review_passes: 3
review_rounds: 2
last_check_failure: "repoos check at 2026-11-20T01:32:09.378Z: repoos check failed: ui verification failed (1 issue(s)): [missing-target] Pipeline with filter chip bar and the not-applied note (target \"default\"): highlight .board-queue-filter-note matched nothing on /work?tab=pipeline&q=login (http://127.0.0.1:45181/work?tab=pipeline&q=login)"
handoff_signal_retry_count: 1
---
## Problem
Search text, filters and sort on the Work board may not persist or reset correctly across reloads, tabs and projects.
## Desired UX
Filters and sort persist per project, a clear-all control always works, and the active filters are visible at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser.
- Cover reload, project switch and clear-all; fix issues with tests.
- Commit docs/qa/2026-11-filter-persistence-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Board with search and priority chips and Clear filters",
"target": "default",
"route": "/work?q=login&priority=p1",
"highlight": ".board-queue-filters"
},
{
"label": "Board with an unusable priority shown as an ignored chip",
"target": "default",
"route": "/work?priority=p9",
"highlight": ".filter-chip-ignored"
}
]
```

## Activity

- 2026-11-20T00:07:29Z · created · t@t
- 2026-11-20T00:07:38Z · status inbox→ready
- 2026-11-20T00:07:41Z · cli_override, model_override
- 2026-11-20T00:07:43Z · status ready→active, branch
- 2026-11-20T00:17:11Z · note: adopted orphaned engineer pid 46470
- 2026-11-20T00:29:19Z · body
- 2026-11-20T00:32:09Z · CTO nudge: held — handoff gate is running
- 2026-11-20T00:49:33Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T00:49:35Z · status active→review
- 2026-11-20T00:49:36Z · message_queued at 2026-11-20T00:49:36.194Z
- 2026-11-20T00:51:06Z · note: review pass 1: needs some work
- 2026-11-20T00:51:06Z · status review→active
- 2026-11-20T00:51:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T00:56:18Z · message_queued at 2026-11-20T00:56:18.444Z
- 2026-11-20T00:56:30Z · message_delivered: 1 message(s)
- 2026-11-20T00:57:58Z · body
- 2026-11-20T01:18:24Z · queued message undelivered for 22m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T01:18:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The UI smoke run is still going in the background, and a monitor will notify me when it exits. Once it finishes I'll decide whether the failure is environmental or needs a code change. Until then, the round 2 fixes and scoped tests are don… · stderr: (empty)
- 2026-11-20T01:20:36Z · message_delivered: 1 message(s)
- 2026-11-20T01:26:56Z · body
- 2026-11-20T01:32:05Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Pipeline with filter chip bar and the not-applied note (target "default"): highlight .board-queue-filter-note matched nothing on /work?tab=pipeline&q=login (http://127.0.0.1:45181/work?tab=pipeline&q=login)
- 2026-11-20T01:32:06Z · message_queued at 2026-11-20T01:32:06.072Z
- 2026-11-20T01:32:09Z · message_delivered: 1 message(s)
- 2026-11-20T01:32:22Z · body
- 2026-11-20T01:36:16Z · body
- 2026-11-20T01:40:33Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-20T01:40:37Z · status active→review
- 2026-11-20T01:40:38Z · message_queued at 2026-11-20T01:40:38.890Z
- 2026-11-20T01:41:37Z · note: review pass 2: needs some work
- 2026-11-20T01:41:39Z · message_delivered: 1 message(s)
- 2026-11-20T01:41:40Z · status review→active
- 2026-11-20T01:41:44Z · CTO nudge: held — remote validation is running
- 2026-11-20T01:51:26Z · body
- 2026-11-20T01:57:09Z · CTO nudge: held — handoff gate is running
- 2026-11-20T01:57:13Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-20T01:57:15Z · message_queued at 2026-11-20T01:57:15.670Z
- 2026-11-20T02:00:21Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T02:00:23Z · message_delivered: 1 message(s)
- 2026-11-20T02:07:57Z · body
- 2026-11-20T02:12:09Z · CTO nudge: held — handoff gate is running
- 2026-11-20T02:14:07Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-20T02:14:08Z · status active→review
- 2026-11-20T02:14:08Z · message_queued at 2026-11-20T02:14:08.903Z
- 2026-11-20T02:16:16Z · note: review pass 3: good to go
- 2026-11-20T03:19:26Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T03:31:57Z · close-out gate completed in 884s
- 2026-11-20T03:33:05Z · status done→done, release:success
