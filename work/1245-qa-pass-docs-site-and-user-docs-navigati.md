---
id: "1245"
title: "QA pass: docs site and user-docs navigation, search and links at all screen sizes"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-docs-site-and-user-docs-navigati
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T20:07:43Z"
updated_at: "2026-11-19T21:00:37Z"
---
## Problem
The docs site pages, navigation and search have not been checked on phone widths since the latest docs changes.
## Desired UX
Navigation, search and code blocks work at 375, 768 and 1280 px and every internal link resolves.
## Acceptance criteria
- Headless Playwright only against the local docs build; never open a visible browser.
- Run a link check and fix broken links, overflowing code blocks and nav issues with tests.
- Commit docs/qa/2026-11-docs-site-nav-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T20:07:43Z · created · t@t
- 2026-11-19T20:07:49Z · status inbox→ready
- 2026-11-19T20:07:51Z · cli_override, model_override
- 2026-11-19T20:07:52Z · status ready→active, branch
- 2026-11-19T21:00:37Z · status active→review
