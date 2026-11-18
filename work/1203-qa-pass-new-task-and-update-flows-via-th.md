---
id: "1203"
title: "QA pass: new-task and update flows via the CLI and UI agree – body sections, validation messages and needs-input handling"
type: bug
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-new-task-and-update-flows-via-th
created_at: "2026-11-18T20:47:36Z"
updated_at: "2026-11-18T20:52:48Z"
---
## Problem
UI and CLI task creation have different validation (needs input, required sections) and may give confusing messages.
## Desired UX
The same invalid task gets the same clear message in UI and CLI, and needs-input states are understandable.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-task-validation.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T20:47:36Z · created · t@t
- 2026-11-18T20:47:39Z · status inbox→ready
- 2026-11-18T20:47:40Z · status ready→active, branch
- 2026-11-18T20:52:48Z · body
