---
id: "1197"
title: "QA pass: Settings tabs on phone widths – every tab, control and dialog at 375px"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-tabs-on-phone-widths-ev
created_at: "2026-11-18T19:24:03Z"
updated_at: "2026-11-18T19:43:17Z"
---
## Problem
Settings has many tabs and dialogs that are hard to use on a phone.
## Desired UX
Every Settings tab and dialog is usable at 375px without clipping or horizontal scroll.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-settings-mobile.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "Support actions wrap at phone width",
"target": "default",
"route": "/settings?tab=support",
"highlight": ".bug-report-actions",
"viewportWidth": 375,
"viewportHeight": 844
}
]
```

## Activity

- 2026-11-18T19:24:03Z · created · t@t
- 2026-11-18T19:24:06Z · status inbox→ready
- 2026-11-18T19:24:08Z · status ready→active, branch
- 2026-11-18T19:32:21Z · body
- 2026-11-18T19:35:02Z · body
- 2026-11-18T19:39:26Z · body
- 2026-11-18T19:43:16Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T19:43:17Z · status active→review
- 2026-11-18T19:43:17Z · message_queued at 2026-11-18T19:43:17.896Z
