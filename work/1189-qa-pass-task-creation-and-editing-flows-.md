---
id: "1189"
title: "QA pass: task creation and editing flows (new task, update, attach screenshot, dependencies)"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T16:17:39Z"
updated_at: "2026-11-18T16:17:48Z"
---
## Problem
Creating and editing tasks in the UI has changed a lot and has no recent hands-on pass.
## Desired UX
Creating, editing, attaching images and setting dependencies works with clear validation at 1280 and 375 widths.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) with headless Playwright only; never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-task-creation.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T16:17:39Z · created · t@t
- 2026-11-18T16:17:48Z · status inbox→ready
