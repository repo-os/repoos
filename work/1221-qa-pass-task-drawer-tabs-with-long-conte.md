---
id: "1221"
title: "QA pass: task drawer tabs with long content at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-drawer-tabs-with-long-conte
created_at: "2026-11-19T06:47:59Z"
updated_at: "2026-11-19T07:07:55Z"
---
## Problem
The task drawer tabs (Overview, Changes, Reviews, Activity, Shots) have not been QA-checked at phone, tablet and desktop widths with long content.
## Desired UX
Every tab renders long diffs, long activity logs and many shots without overflow or dead controls at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Use fixtures with long content; fix truncation, overflow and dead controls with tests.
- Commit docs/qa/2026-11-task-drawer-tabs-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T06:47:59Z · created · t@t
- 2026-11-19T06:48:13Z · status inbox→ready
- 2026-11-19T06:48:18Z · status ready→active, branch
- 2026-11-19T06:54:49Z · body
- 2026-11-19T06:58:55Z · body
- 2026-11-19T07:05:30Z · body
- 2026-11-19T07:07:55Z · CTO nudge: held — handoff gate is running
