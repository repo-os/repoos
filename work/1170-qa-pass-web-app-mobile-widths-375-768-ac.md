---
id: "1170"
title: "QA pass: web app mobile widths (375/768) across Work, Releases, Settings, Agents, Checks"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T02:19:49Z"
updated_at: "2026-11-18T02:20:25Z"
---
## Problem
Mobile-width layout regressions are likely after recent UI changes.
## Desired UX
No horizontal scroll, clipped buttons, unreachable controls or overlapping drawers at 375px and 768px.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) at 375 and 768 widths on the main pages.
- Fix issues found with tests; skip what #1157 already fixed.
- Commit docs/qa/2026-11-web-mobile-widths.md with findings.
## Notes for AI
Do not touch repoos.toml. Pages use full .main width.

## Activity

- 2026-11-18T02:19:49Z · created · t@t
- 2026-11-18T02:20:25Z · status inbox→ready
