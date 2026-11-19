---
id: "1243"
title: "QA pass: Agents page failure copy after the Jev routing switch and missing key"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T20:07:21Z"
updated_at: "2026-11-19T20:07:21Z"
---
## Problem
After switching model routing to Jev, the Agents page routing tab and decisions list need a check for the missing-key and provider-failure wording and a recent-decisions list that is empty or all failures.
## Desired UX
A missing key or failing provider is explained in plain English with the next step; the decisions list shows an honest empty or failure state; keys stay masked.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never use or print real keys.
- Fix issues with tests; commit docs/qa/2026-11-routing-failure-copy-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T20:07:21Z · created · t@t
