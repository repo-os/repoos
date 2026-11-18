---
id: "1200"
title: "QA pass: Agents page Build Your Team, Scheduled Tasks, Reminders and Detected Coding Agents tabs"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-build-your-team-sche
created_at: "2026-11-18T19:47:54Z"
updated_at: "2026-11-18T20:16:40Z"
handoff_signal_retry_count: 2
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
- 2026-11-18T19:48:01Z · status ready→active, branch
- 2026-11-18T19:49:52Z · note: adopted orphaned engineer pid 2419
- 2026-11-18T19:57:10Z · body
- 2026-11-18T19:57:17Z · note: adopted orphaned engineer pid 2419
- 2026-11-18T19:58:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: The QA pass and fixes are in place, but the task remains **active** because persistence could not be verified. The required `just serve-noauth` preview rejects every write with HTTP 405 (`preview servers are read-only`), so saves cannot be… · stderr: Reading additional input from stdin... 2026-11-18T19:48:34.329520Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\"Failed to create unified exec process: No such file or directory (os error 2)\")" }
- 2026-11-18T20:04:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The worktree is clean, and `REPOOS_CHECK_CHANGED=main repoos check` passed on the current checkpoint. Handoff has not been requested. Persistence verification is still incomplete: `just serve-noauth` runs with `REPOOS_PREVIEW_CHILD=1`, and… · stderr: (empty)
- 2026-11-18T20:16:40Z · body
