---
id: "1242"
title: "QA pass: Hub server picker and add-server flow copy and error states"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-server-picker-and-add-server
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T19:07:19Z"
updated_at: "2026-11-19T19:45:16Z"
review_rounds: 1
review_passes: 1
---
## Problem
The Hub server picker and add-server flow need a final check of wording and error states (bad URL, unreachable server, duplicate name, unsafe scheme) in the web preview of the shell.
## Desired UX
Every error says what is wrong and what to do next in plain English; the flow works at phone and tablet widths.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; no real servers contacted.
- Cover bad URL, http/file/javascript schemes, duplicate, unreachable and slow servers; fix issues with tests.
- Commit docs/qa/2026-11-hub-picker-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T19:07:19Z · created · t@t
- 2026-11-19T19:07:24Z · status inbox→ready
- 2026-11-19T19:07:25Z · cli_override, model_override
- 2026-11-19T19:07:26Z · status ready→active, branch
- 2026-11-19T19:26:04Z · body
- 2026-11-19T19:28:55Z · body
- 2026-11-19T19:30:47Z · status active→review
- 2026-11-19T19:30:47Z · message_queued at 2026-11-19T19:30:47.379Z
- 2026-11-19T19:30:47Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-19T19:33:03Z · note: review pass 1: needs some work
- 2026-11-19T19:33:03Z · message_delivered: 1 message(s)
- 2026-11-19T19:33:03Z · status review→active
- 2026-11-19T19:36:40Z · body
- 2026-11-19T19:39:09Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:39:23Z · message_queued at 2026-11-19T19:39:23.234Z
- 2026-11-19T19:41:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T19:42:27Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T19:42:28Z · message_delivered: 1 message(s)
- 2026-11-19T19:44:05Z · body
- 2026-11-19T19:45:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The handoff blocker is fixed. The engineering report draft is written, the scoped check passes, and the worktree has no uncommitted changes. **What I found:** Round 1's code already covers the review's findings. The discovery error paragra… · stderr: (empty)
- 2026-11-19T19:45:16Z · status active→review
