---
id: "1257"
title: "QA pass: Work board search, saved filters and sort persistence across reloads"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-search-saved-filters-
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:07:29Z"
updated_at: "2026-11-20T00:49:35Z"
---
## Problem
Search text, filters and sort on the Work board may not persist or reset correctly across reloads, tabs and projects.
## Desired UX
Filters and sort persist per project, a clear-all control always works, and the active filters are visible at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser.
- Cover reload, project switch and clear-all; fix issues with tests.
- Commit docs/qa/2026-11-filter-persistence-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-20T00:07:29Z · created · t@t
- 2026-11-20T00:07:38Z · status inbox→ready
- 2026-11-20T00:07:41Z · cli_override, model_override
- 2026-11-20T00:07:43Z · status ready→active, branch
- 2026-11-20T00:49:35Z · status active→review
