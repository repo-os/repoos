---
id: "1173"
title: "QA pass: web app desktop – Agents, Checks, Settings, Releases pages end to end"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-desktop-agents-checks-se
created_at: "2026-11-18T03:57:22Z"
updated_at: "2026-11-18T04:29:14Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-18T04:29:14.766Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
Desktop web pages beyond Work may hide regressions after many recent UI changes.
## Desired UX
Agents, Checks, Settings and Releases pages load without console errors and every control works.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) at desktop width on those four pages; skip issues #1157 and #1168 already covered.
- Fix bugs found with tests.
- Commit docs/qa/2026-11-web-desktop-pages.md with findings.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T03:57:22Z · created · t@t
- 2026-11-18T03:57:29Z · status inbox→ready
- 2026-11-18T03:57:32Z · status ready→active, branch
- 2026-11-18T03:59:58Z · body
- 2026-11-18T04:00:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The live QA pass is blocked: the browser host exposed no tabs, and the runner instructions prohibit starting the long-lived local server the task requires. I did not verify the pages or console, so I made no code changes and did not create… · stderr: Reading additional input from stdin...
- 2026-11-18T04:09:32Z · body
- 2026-11-18T04:10:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still incomplete, so I did not emit the handoff signal. I started `just serve-noauth 7272` in the assigned worktree and opened `/agents` in Chrome. The server bound on the runner, but Chrome received `ERR_CONNECTION_REFUSED` be… · stderr: 2026-11-18T04:07:12.907838Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-desktop-agents-checks-se/.repoos/engineering-report-drafts/1173.md: A follow-up turn needs an authorized, available way to ser…
- 2026-11-18T04:18:32Z · body
- 2026-11-18T04:24:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task remains incomplete, so I did not emit the handoff signal. The scoped check passed again, including the UI smoke test. The worktree is clean and #1173 remains active. The blocker is still live browser access: the runner’s auth-less… · stderr: 2026-11-18T04:07:12.907838Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-web-app-desktop-agents-checks-se/.repoos/engineering-report-drafts/1173.md: A follow-up turn needs an authorized, available way to ser…
- 2026-11-18T04:29:14Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
