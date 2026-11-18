---
id: "1200"
title: "QA pass: Agents page Build Your Team, Scheduled Tasks, Reminders and Detected Coding Agents tabs"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T19:47:54Z"
updated_at: "2026-11-18T19:47:58Z"
---
## Problem
The Agents page has several tabs beyond the main list that have not been exercised.
## Desired UX
Each tab loads, empty and error states are clear, and edits persist at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-agents-tabs.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T19:47:54Z · created · t@t
- 2026-11-18T19:47:58Z · status inbox→ready
