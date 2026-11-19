---
id: "1226"
title: "QA pass: slow network and offline behavior in the web app and Hub"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T09:47:34Z"
updated_at: "2026-11-19T09:47:34Z"
---
## Problem
The web app and Hub have not been checked for slow, failing or dropped connections.
## Desired UX
When the server is slow, unreachable or reconnecting, pages show a plain-English status, never a blank screen or endless spinner, recover on their own when the server returns, and stay usable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and request interception; never open a visible browser or steal focus.
- Check Work, task drawer, Agents and Settings under slow, 500 and offline responses; fix issues with tests.
- Commit docs/qa/2026-11-offline-slow-network-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T09:47:34Z · created · t@t
