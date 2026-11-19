---
id: "1235"
title: "QA pass: Work board drag, status moves and bulk actions with failures"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T16:17:45Z"
updated_at: "2026-11-19T16:17:49Z"
---
## Problem
Status changes, drag/drop and bulk actions on the Work board have not been tested when the server rejects them (blocked move, dirty main, conflict).
## Desired UX
A rejected move snaps back and shows a plain-English reason with the next step; nothing is left half-moved at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and mocked rejections; never open a visible browser or steal focus.
- Cover blocked, failed and slow moves, and keyboard/touch alternatives to drag; fix issues with tests.
- Commit docs/qa/2026-11-board-moves-failures-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T16:17:45Z · created · t@t
- 2026-11-19T16:17:49Z · status inbox→ready
