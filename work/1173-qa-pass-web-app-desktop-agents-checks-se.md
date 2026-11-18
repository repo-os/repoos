---
id: "1173"
title: "QA pass: web app desktop – Agents, Checks, Settings, Releases pages end to end"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T03:57:22Z"
updated_at: "2026-11-18T03:57:22Z"
---
## Problem
Desktop web pages beyond Work may hide regressions after many recent UI changes.
## Desired UX
Agents, Checks, Settings and Releases pages load without console errors and every control works.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) at desktop width on those four pages; skip issues #1157 and #1168 already covered.
- Fix bugs found with tests.
- Commit docs/qa/2026-11-web-desktop-pages.md with findings.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T03:57:22Z · created · t@t
