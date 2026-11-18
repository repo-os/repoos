---
id: "1198"
title: "QA pass: Debug panel, logs and activity views – large outputs, long lines, empty and error states"
type: bug
status: done
priority: p2
area: web
merged_commit: dec9e8d1956d46343b81bd19f1d106daa32dbcc7
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-debug-panel-logs-and-activity-vi
created_at: "2026-11-18T19:24:11Z"
updated_at: "2026-11-18T20:03:35Z"
last_close_out_gate_ms: 157533
last_close_out_gate_at: "2026-11-18T19:56:55.271Z"
review_passes: 1
---
## Problem
Log and debug views with large or odd output may overflow or freeze.
## Desired UX
Large logs, very long lines, empty and error states render without overflow or lag at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-debug-logs.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "Debug logs and activity with long messages",
"target": "default",
"route": "/work?task=1198&tab=changes",
"highlight": ".debug-events",
"steps": [
{
"click": "button.tab-btn:nth-child(7)"
},
{
"click": ".debug-tab:nth-child(2)"
}
],
"state": "drawer:debugLogs"
}
]
```

## Activity

- 2026-11-18T19:24:11Z · created · t@t
- 2026-11-18T19:24:15Z · status inbox→ready
- 2026-11-18T19:24:17Z · status ready→active, branch
- 2026-11-18T19:29:45Z · body
- 2026-11-18T19:31:27Z · body
- 2026-11-18T19:33:08Z · body
- 2026-11-18T19:34:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T19:49:05Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T19:49:07Z · status active→review
- 2026-11-18T19:49:07Z · message_queued at 2026-11-18T19:49:07.577Z
- 2026-11-18T19:49:41Z · note: review pass 1: good to go
- 2026-11-18T19:56:55Z · close-out gate completed in 158s
- 2026-11-18T19:57:14Z · status done→done, release:success
- 2026-11-18T20:03:35Z · message_dropped: 1 queued message(s) discarded — task is done
