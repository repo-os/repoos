---
id: "1231"
title: "QA pass: keyboard shortcuts and command palette across pages"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T13:47:53Z"
updated_at: "2026-11-19T13:47:53Z"
---
## Problem
Keyboard shortcuts and any command palette or search shortcut have not been checked for conflicts, discoverability or touch/small-screen behavior.
## Desired UX
Shortcuts work on every main page without clashing with text fields, are listed somewhere findable, and nothing breaks at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Inventory the shortcuts, test them with focus in inputs, dialogs and drawers; fix conflicts and dead shortcuts with tests.
- Commit docs/qa/2026-11-keyboard-shortcuts-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T13:47:53Z · created · t@t
