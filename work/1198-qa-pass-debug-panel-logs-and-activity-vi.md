---
id: "1198"
title: "QA pass: Debug panel, logs and activity views – large outputs, long lines, empty and error states"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-debug-panel-logs-and-activity-vi
created_at: "2026-11-18T19:24:11Z"
updated_at: "2026-11-18T19:49:07Z"
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

## Activity

- 2026-11-18T19:24:11Z · created · t@t
- 2026-11-18T19:24:15Z · status inbox→ready
- 2026-11-18T19:24:17Z · status ready→active, branch
- 2026-11-18T19:49:07Z · status active→review
