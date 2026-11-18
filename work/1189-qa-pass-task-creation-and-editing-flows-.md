---
handoff_signal_retry_count: 1
id: "1189"
title: "QA pass: task creation and editing flows (new task, update, attach screenshot, dependencies)"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-creation-and-editing-flows-
created_at: "2026-11-18T16:17:39Z"
updated_at: "2026-11-18T16:27:13Z"
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
- 2026-11-18T16:17:53Z · status ready→active, branch
- 2026-11-18T16:27:13Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I did not complete the QA pass or request handoff. In the disposable scratch preview, clicking **Create** left the manual task form open, and I couldn’t confirm whether the task was saved. Dependency editing also remains untested, so I can… · stderr: Reading additional input from stdin... 2026-11-18T16:23:48.895845Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\"`/bin/zsh -lc 'git worktree remove --force /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-task-creation-and-editing-flows-/.qa-scratch && rm -f /Users…

