---
id: "1253"
title: "QA pass: Settings model providers and API key screens (masked values, save, errors)"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T23:27:11Z"
updated_at: "2026-11-19T23:27:18Z"
---
## Problem
The model providers and API key screens have not had a recent check for masked values, saving, wrong keys and offline errors.
## Desired UX
Keys are never shown, only Saved / Not set; wrong or failing keys give plain-English errors with a next step; works at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures with fake values; never use or print real keys; never write to the real .env.
- Fix issues with tests; commit docs/qa/2026-11-api-key-screens-qa.md.
## Notes for AI
Do not touch repoos.toml. Follow docs/api-keys.md.

## Activity

- 2026-11-19T23:27:11Z · created · t@t
- 2026-11-19T23:27:18Z · status inbox→ready
