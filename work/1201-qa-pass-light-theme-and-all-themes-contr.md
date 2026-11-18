---
id: "1201"
title: "QA pass: light theme and all themes – contrast, readability and hard-coded colors on main pages"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-light-theme-and-all-themes-contr
created_at: "2026-11-18T20:17:30Z"
updated_at: "2026-11-18T20:17:37Z"
---
## Problem
Dark theme gets most attention; light and other themes may have unreadable or inconsistent areas.
## Desired UX
Work, Releases, Settings, Agents, Checks and drawers are readable and consistent in every theme at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-themes.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T20:17:30Z · created · t@t
- 2026-11-18T20:17:34Z · status inbox→ready
- 2026-11-18T20:17:37Z · status ready→active, branch
