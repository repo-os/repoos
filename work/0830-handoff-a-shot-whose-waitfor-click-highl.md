---
last_close_out_gate_ms: 87581
last_close_out_gate_at: "2026-10-18T11:52:33.132Z"
id: "0830"
title: "Handoff: a shot whose waitFor/click/highlight target is missing fails the handoff (add hover step and fixture list)"
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-a-shot-whose-waitfor-click-highl
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T08:09:25Z"
updated_at: "2026-10-18T11:52:33Z"
review_passes: 1
last_check_failure: "repoos check at 2026-10-18T10:20:44.294Z: repoos check failed: ◆ Check plan"
dev_error_count: 1
---
## Problem
When a declared shot's `waitFor`, `click` or `highlight` target is missing, the capture only records a note ("capture went ahead") and the handoff still passes. A review round then discovers blank or wrong captures, and after 3 rounds the task parks with `review-rounds-exhausted` (#0822, #0829). The step vocabulary also has no `hover`, so tooltip shots (e.g. the integration median tooltip) cannot be declared.

## Desired UX
- At handoff, a declared shot with a failed step or unmatched highlight fails the handoff with a clear per-shot message (route, step, selector), leaving the task active so the engineer fixes the plan in the same turn.
- A `hover` step is supported alongside click/fill/waitFor/waitMs.
- The engineer prompt lists the known `state` fixtures (from `src/core/shot-fixtures.ts`) and says tooltip/hover and popover shots need a `hover` or `click` step plus a fixture that seeds the data.
- Auto-captured (undeclared) shots keep today's lenient behaviour.

## Acceptance criteria
- Test: a declared shot with a timed-out waitFor fails handoff, naming the shot; fixing it passes.
- Test: `hover` step works and is validated by `--shots`.
- Test: undeclared auto captures never fail the handoff.
- docs/previews.md and user-docs updated.

## Notes for AI
Related: #0734, #0755, #0613. Do not make a missing Playwright a failure (stays a visible skip). Source: driver discussion 2026-10-18.

## Activity

- 2026-10-18T08:09:25Z · created · njachowski@gmail.com
- 2026-10-18T08:18:27Z · status inbox→ready
- 2026-10-18T08:18:30Z · cli_override, model_override
- 2026-10-18T08:18:33Z · status ready→active, branch
- 2026-10-18T08:22:30Z · body
- 2026-10-18T08:23:57Z · body
- 2026-10-18T08:31:54Z · body
- 2026-10-18T08:32:10Z · handoff failed · remote validation failed: test failure: tests/shot-plan-edit.test.ts > parseShotEntry (#0627) > rejects a bad step and an unknown key, like the list parser on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T08:38:09Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/shot-plan-edit.test.ts > parseShotEntry (#0627) > rejects a bad step and an unknown key, like the list parser on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-18T08:38:09Z · note: handoff requested (cli)
- 2026-10-18T08:45:14Z · message_queued at 2026-10-18T08:45:14.164Z
- 2026-10-18T08:45:22Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/shot-plan-edit.test.ts > parseShotEntry (#0627) > rejects a bad step and an unknown key, like the list parser on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T08:55:14Z · message_delivered: 1 message(s)
- 2026-10-18T08:55:16Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/shot-plan-edit.test.ts > parseShotEntry (#0627) > rejects a bad step and an unknown key, like the list parser on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T09:01:14Z · message_queued at 2026-10-18T09:01:14.383Z
- 2026-10-18T09:01:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T09:02:58Z · body
- 2026-10-18T09:05:06Z · body
- 2026-10-18T09:59:27Z · body
- 2026-10-18T10:20:23Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T10:20:43Z · message_delivered: 1 message(s)
- 2026-10-18T10:21:52Z · body
- 2026-10-18T10:22:31Z · body
- 2026-10-18T10:49:21Z · message_queued at 2026-10-18T10:49:21.322Z
- 2026-10-18T10:49:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T11:06:40Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-18T11:06:40Z · message_delivered: 1 message(s)
- 2026-10-18T11:12:06Z · needs_input
- 2026-10-18T11:22:56Z · body
- 2026-10-18T11:25:42Z · body
- 2026-10-18T11:39:25Z · body
- 2026-10-18T11:47:16Z · status active→review
- 2026-10-18T11:48:00Z · note: review pass 1: good to go
- 2026-10-18T11:50:49Z · close-out gate completed in 81s
- 2026-10-18T11:52:33Z · close-out gate completed in 88s

