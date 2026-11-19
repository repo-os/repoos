---
updated_at: "2026-11-19T05:21:35Z"
review_passes: 1
id: "1218"
title: "QA pass: keyboard and screen-reader access on Settings, Agents and Releases"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-keyboard-and-screen-reader-acces
created_at: "2026-11-19T04:18:15Z"
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T05:06:49.249Z\",\"reason\":\"handoff-deferred\"}]"
---
## Problem
The Settings, Agents and Releases pages have not been checked for keyboard and screen-reader access (focus order, labels, dialogs, contrast).
## Desired UX
Every control is reachable by keyboard, has an accessible name, and dialogs trap and restore focus.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Check focus order, aria labels, dialog focus trap/restore and tooltips on those pages; fix issues with tests.
- Commit docs/qa/2026-11-accessibility-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Agents semantic tab navigation",
"target": "default",
"route": "/agents?tab=default",
"highlight": ".agent-tabs"
},
{
"label": "Settings keyboard navigation",
"target": "default",
"route": "/settings?tab=general",
"highlight": "[role=tablist]"
}
]
```

## Activity

- 2026-11-19T04:18:15Z · created · t@t
- 2026-11-19T04:18:23Z · status inbox→ready
- 2026-11-19T04:18:28Z · status ready→active, branch
- 2026-11-19T04:28:13Z · body
- 2026-11-19T04:31:48Z · body
- 2026-11-19T04:35:19Z · body
- 2026-11-19T04:57:51Z · CTO nudge: held — handoff gate is running
- 2026-11-19T05:06:48Z · handoff failed · remote validation failed: test failure: tests/settings-restart-badge-layout.test.ts > Settings restart badge layout (#0911) > places each restart hint before its control and keeps its accessible explanation on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-19T05:06:48Z · message_queued at 2026-11-19T05:06:48.967Z
- 2026-11-19T05:06:49Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 1/3
- 2026-11-19T05:06:51Z · message_delivered: 1 message(s)
- 2026-11-19T05:15:54Z · body
- 2026-11-19T05:17:51Z · CTO nudge: held — handoff gate is running
- 2026-11-19T05:20:55Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-19T05:20:57Z · status active→review
- 2026-11-19T05:20:57Z · message_queued at 2026-11-19T05:20:57.413Z
- 2026-11-19T05:21:34Z · note: review pass 1: good to go

