---
id: "1244"
title: "QA pass: Control dashboard live updates and reconnect behavior"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T20:07:32Z"
updated_at: "2026-11-19T20:07:32Z"
---
## Problem
The Control dashboard and Work board use live updates; behavior after a dropped connection, a server restart or a long idle tab has not been checked.
## Desired UX
After the server restarts or the connection drops, pages show a short plain-English reconnecting state and catch up on their own without a manual reload, at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and simulated disconnects; never open a visible browser.
- Fix stale-data and stuck-banner problems with tests; commit docs/qa/2026-11-live-reconnect-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T20:07:32Z · created · t@t
