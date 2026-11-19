---
id: "1218"
title: "QA pass: keyboard and screen-reader access on Settings, Agents and Releases"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T04:18:15Z"
updated_at: "2026-11-19T04:18:15Z"
---
## Problem
The Settings, Agents and Releases pages have not been checked for keyboard and screen-reader access (focus order, labels, dialogs, contrast).
## Desired UX
Every control is reachable by keyboard, has an accessible name, and dialogs trap and restore focus.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Check focus order, aria labels, dialog focus trap/restore and tooltips on those pages; fix issues with tests.
- Commit docs/qa/2026-11-accessibility-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T04:18:15Z · created · t@t
