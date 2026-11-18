---
id: "1209"
title: "QA pass: Agents page failure states and Test button – missing CLI, signed-out agent, rate limit"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-failure-states-and-t
created_at: "2026-11-18T23:17:32Z"
updated_at: "2026-11-18T23:42:20Z"
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
