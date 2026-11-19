---
id: "1209"
title: "QA pass: Agents page failure states and Test button – missing CLI, signed-out agent, rate limit"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-failure-states-and-t
created_at: "2026-11-18T23:17:32Z"
updated_at: "2026-11-19T00:14:43Z"
---
## Problem
Agent failure states (signed out, missing CLI, rate limited) are common in practice and need verification.
## Desired UX
Each failure shows a clear, actionable message and the Test button reports accurately.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server with fixtures (just serve-noauth from a scratch worktree); never open a visible browser. Fix bugs with tests.
- Commit docs/qa/2026-11-agent-failures.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T23:17:32Z · created · t@t
- 2026-11-18T23:17:37Z · status inbox→ready
- 2026-11-18T23:17:39Z · status ready→active, branch
- 2026-11-18T23:34:33Z · CTO nudge: held — machine under pressure (CPU idle is 0% (below 5%) — holding new work until the machine has idle CPU)
- 2026-11-18T23:35:20Z · body
- 2026-11-18T23:42:20Z · message_queued at 2026-11-18T23:42:20.302Z
- 2026-11-18T23:42:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T23:45:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T23:45:23Z · body
- 2026-11-18T23:45:31Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T23:45:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The remote gate passed, but the local format check found one formatting issue in `agent-failure.ts`; the remaining local steps were correctly skipped after that failure. I’m applying the repository formatter as the check instructions requi… · stderr: Reading additional input from stdin...
- 2026-11-18T23:45:32Z · message_delivered: 1 message(s)
- 2026-11-18T23:45:56Z · message_queued at 2026-11-18T23:45:56.795Z
- 2026-11-18T23:45:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T23:47:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T23:53:05Z · body
- 2026-11-18T23:55:15Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:02:46Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:14:42Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T00:14:43Z · status active→review
