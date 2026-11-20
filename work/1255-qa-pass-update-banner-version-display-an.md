---
id: "1255"
title: "QA pass: update banner, version display and release notes modal at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-update-banner-version-display-an
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T23:27:47Z"
updated_at: "2026-11-20T02:02:50Z"
review_passes: 4
review_rounds: 2
deferred_handoff_resume_count: 1
---
## Problem
The update-available banner, version display and release notes modal have not been checked since the restart fix.
## Desired UX
The banner and modal explain what is new in plain English, restart or dismiss works, and everything fits at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never restart a real server.
- Cover supervised, hand-run, failure and dismissed states; fix issues with tests.
- Commit docs/qa/2026-11-update-banner-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Release notes modal with bullet markers",
"target": "default",
"route": "/work",
"highlight": ".release-update-modal",
"state": "release:updateAvailable"
},
{
"label": "Installed restart notice (systemd)",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"installed-restart-notice\"]",
"state": "release:restartPendingDark"
},
{
"label": "Restart failure names the command to run",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"installed-restart-notice\"] [role=\"alert\"]",
"state": "release:restartError"
}
]
```

## Activity

- 2026-11-19T23:27:47Z · created · t@t
- 2026-11-19T23:27:55Z · status inbox→ready
- 2026-11-19T23:27:59Z · cli_override, model_override
- 2026-11-19T23:28:01Z · status ready→active, branch
- 2026-11-19T23:41:42Z · body
- 2026-11-19T23:43:30Z · body
- 2026-11-19T23:46:56Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-19T23:46:58Z · status active→review
- 2026-11-19T23:46:59Z · message_queued at 2026-11-19T23:46:59.129Z
- 2026-11-19T23:50:24Z · note: review pass 1: needs some work
- 2026-11-19T23:50:25Z · message_delivered: 1 message(s)
- 2026-11-19T23:50:25Z · status review→active
- 2026-11-19T23:58:35Z · note: adopted orphaned engineer pid 71438
- 2026-11-20T00:00:41Z · body
- 2026-11-20T00:01:35Z · status active→review
- 2026-11-20T00:16:12Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-20T00:16:14Z · note: review pass 2: needs some work
- 2026-11-20T00:16:15Z · message_queued at 2026-11-20T00:16:15.353Z
- 2026-11-20T00:16:15Z · status review→active
- 2026-11-20T00:16:16Z · status active→review
- 2026-11-20T00:16:16Z · message_queued at 2026-11-20T00:16:16.871Z
- 2026-11-20T00:18:25Z · note: review pass 3: needs some work
- 2026-11-20T00:18:25Z · needs_input
- 2026-11-20T00:27:04Z · status review→active
- 2026-11-20T00:27:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T00:27:07Z · needs_input
- 2026-11-20T00:27:12Z · message_delivered: 2 message(s)
- 2026-11-20T00:27:13Z · message_queued at 2026-11-20T00:27:13.160Z
- 2026-11-20T00:32:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T00:35:06Z · body
- 2026-11-20T00:47:45Z · queued message undelivered for 21m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T00:47:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The full test suite is still running in the background, and a monitor will notify me when it finishes. I'll hold the handoff until that result is in. **Where #1255 stands (round 3):** - **Chat list markers fixed.** `.td-markdown` (task deb… · stderr: (empty)
- 2026-11-20T00:47:50Z · note: handoff requested (cli)
- 2026-11-20T00:48:06Z · message_delivered: 1 message(s)
- 2026-11-20T00:49:37Z · CTO nudge: held — handoff gate is running
- 2026-11-20T00:55:44Z · body
- 2026-11-20T00:56:30Z · status active→review
- 2026-11-20T01:04:14Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-20T01:04:17Z · message_queued at 2026-11-20T01:04:17.775Z
- 2026-11-20T01:04:18Z · note: review pass 4: needs some work
- 2026-11-20T01:04:18Z · needs_input
- 2026-11-20T01:27:15Z · status review→active
- 2026-11-20T01:27:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T01:27:20Z · needs_input
- 2026-11-20T01:27:28Z · message_delivered: 1 message(s)
- 2026-11-20T01:27:31Z · message_queued at 2026-11-20T01:27:31.445Z
- 2026-11-20T02:01:11Z · body
- 2026-11-20T02:02:50Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-20T02:02:50Z · message_queued at 2026-11-20T02:02:50.577Z
- 2026-11-20T02:02:50Z · ↻ resuming engineer to read queued message
- 2026-11-20T02:02:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The draft is written. Before I hand off, I'll correct one sentence that claims more than I observed. I saw a live `claude -p` process from another task, but I don't know it held the lock. Then I'll check the word count against the 1,200-wo… · stderr: (empty)
