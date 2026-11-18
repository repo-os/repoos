---
id: "1186"
title: "QA pass: web app Search, command palette and navigation – every route loads, deep links, back button"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-search-command-palette-a
created_at: "2026-11-18T13:47:31Z"
updated_at: "2026-11-18T14:19:22Z"
---
## Problem
Navigation, search/command palette and deep links have not had a recent pass.
## Desired UX
Every nav item and route loads, deep links (task drawer, tabs) work after reload, back/forward behaves, and the palette finds tasks and runs actions at 1280 and 375 widths.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree); fix bugs with tests.
- Commit docs/qa/2026-11-navigation-search.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T13:47:31Z · created · t@t
- 2026-11-18T13:47:34Z · status inbox→ready
- 2026-11-18T13:47:36Z · status ready→active, branch
- 2026-11-18T14:19:22Z · status active→review
