---
id: "1217"
title: "QA pass: Work board, filters and search at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-filters-and-search-at
created_at: "2026-11-19T03:47:37Z"
updated_at: "2026-11-19T03:53:56Z"
---
## Problem
The Work board, search, filters and bulk actions have not had a QA pass at phone, tablet and desktop widths since the latest releases.
## Desired UX
Board columns, filters, search and the task cards work and are reachable at 375, 768 and 1280 px, with clear empty states.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Exercise filters, search, drag/status controls and card menus using fixtures; fix layout, wording and dead controls with tests.
- Commit docs/qa/2026-11-work-board-qa.md listing what was checked.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T03:47:37Z · created · t@t
- 2026-11-19T03:47:41Z · status inbox→ready
- 2026-11-19T03:47:43Z · status ready→active, branch
- 2026-11-19T03:51:08Z · body
- 2026-11-19T03:53:56Z · body
