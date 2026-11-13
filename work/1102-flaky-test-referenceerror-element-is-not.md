---
id: "1102"
title: "Flaky test: 'ReferenceError: Element is not defined' in jsdom tests fails checks for unrelated tasks (seen on #1062, #1075, #1078, #1081)"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/flaky-test-referenceerror-element-is-not
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-13T07:11:46Z"
updated_at: "2026-11-13T14:30:06Z"
review_passes: 1
---
## Problem
repoos check intermittently fails with `ReferenceError: Element is not defined`. It appears in the agent logs of #1062, #1075, #1078 and #1081, tasks that touch unrelated code. The likely source is a jsdom MutationObserver callback delivered in a microtask after the environment is torn down (activity-motion-coordinator.test.ts and the overlay-occlusion code from #1062). #1081's engineer worked around it by stubbing the global Element in that test; that was reverted.

## Acceptance criteria
- Find the observer or listener that runs after teardown and disconnect it in the code or the test cleanup; no global stubs.
- Reproduce by running the whole ui-app suite repeatedly (or under load) before and after.

## Notes for AI
Grep agent logs for the stack. Do not raise timeouts or stub globals.

## Desired UX
No user-facing change: checks on unrelated tasks stop failing with a jsdom teardown error.

## Activity

- 2026-11-13T07:11:46Z · created · t@t
- 2026-11-13T07:11:46Z · needs_input
- 2026-11-13T07:11:54Z · body: Desired UX (added)
- 2026-11-13T11:28:29Z · needs_input
- 2026-11-13T11:55:17Z · cli_override, model_override
- 2026-11-13T11:55:29Z · status inbox→ready
- 2026-11-13T11:55:34Z · status ready→active, branch
- 2026-11-13T12:08:28Z · message_queued at 2026-11-13T12:08:28.804Z
- 2026-11-13T12:08:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-13T12:09:27Z · body
- 2026-11-13T12:13:28Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-13T12:22:36Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-13T12:22:38Z · status active→review
- 2026-11-13T12:22:38Z · message_queued at 2026-11-13T12:22:38.599Z
- 2026-11-13T12:23:10Z · note: review pass 1: good to go
- 2026-11-13T14:30:06Z · message_overdue: still queued after 60m without being delivered
