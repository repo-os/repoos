---
id: "1247"
title: "QA pass: Checks page live run view and cancel/retry controls"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T21:07:03Z"
updated_at: "2026-11-19T21:07:03Z"
---
## Problem
The live check run view, cancel and retry controls have not been checked for running, queued, stalled and failed runs at phone widths.
## Desired UX
Each run state is clear in plain English, cancel and retry work and confirm what they did, and output stays inside its own box at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or start a real check run.
- Fix issues with tests; commit docs/qa/2026-11-checks-live-run-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T21:07:03Z · created · t@t
