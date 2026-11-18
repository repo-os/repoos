---
id: "1197"
title: "QA pass: Settings tabs on phone widths – every tab, control and dialog at 375px"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T19:24:03Z"
updated_at: "2026-11-18T19:24:06Z"
---
## Problem
Settings has many tabs and dialogs that are hard to use on a phone.
## Desired UX
Every Settings tab and dialog is usable at 375px without clipping or horizontal scroll.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-settings-mobile.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T19:24:03Z · created · t@t
- 2026-11-18T19:24:06Z · status inbox→ready
