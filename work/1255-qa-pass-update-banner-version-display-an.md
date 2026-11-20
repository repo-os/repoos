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
updated_at: "2026-11-20T00:00:41Z"
review_rounds: 1
review_passes: 1
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
