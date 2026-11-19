---
id: "1223"
title: "QA pass: Agents page, model providers and routing tab at all screen sizes"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T07:47:39Z"
updated_at: "2026-11-19T07:47:39Z"
---
## Problem
The Agents page (agent list, Model providers, Model routing tab) has not been QA-checked since the routing provider changed to Jev, including the missing-API-key state.
## Desired UX
Every tab explains a missing key or failed provider in plain English and stays usable at 375, 768 and 1280 px. Key fields stay masked (Saved / Not set only).
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never use or print real keys.
- Check missing-key, provider-failure and recent-decisions states; fix issues with tests.
- Commit docs/qa/2026-11-agents-routing-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:47:39Z · created · t@t
