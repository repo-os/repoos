---
id: "1196"
title: "QA pass: update and restart flow end to end on service-managed and hand-run servers (follow-up to #1185)"
type: bug
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-update-and-restart-flow-end-to-e
created_at: "2026-11-18T19:23:55Z"
updated_at: "2026-11-18T19:45:11Z"
---
## Problem
#1185 fixed supervisor detection; the whole update, restart and reconnect flow still needs an end to end check using fixtures.
## Desired UX
Update notice, Restart now and Restart when idle behave correctly for hand-run, systemd, launchd and uncertain servers, including failures.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-restart-flow-e2e.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T19:23:55Z · created · t@t
- 2026-11-18T19:23:58Z · status inbox→ready
- 2026-11-18T19:24:00Z · status ready→active, branch
- 2026-11-18T19:45:11Z · status active→review
