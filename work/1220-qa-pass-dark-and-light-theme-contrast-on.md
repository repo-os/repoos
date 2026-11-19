---
id: "1220"
title: "QA pass: dark and light theme contrast on every main page"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T06:17:41Z"
updated_at: "2026-11-19T06:17:44Z"
---
## Problem
Theme contrast on newer pages and dialogs has not been re-checked since recent UI changes.
## Desired UX
Text, borders, focus rings and status colors are readable in both light and dark themes on every main page and dialog.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Run the rendered contrast audit across main pages and dialogs in both themes; fix real failures with tests, using theme tokens not hard-coded colors.
- Commit docs/qa/2026-11-theme-contrast-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T06:17:41Z · created · t@t
- 2026-11-19T06:17:44Z · status inbox→ready
