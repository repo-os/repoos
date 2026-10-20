---
id: "0865"
title: Reviews must not chain back to back on a task with open findings; queued messages must be delivered between passes
type: bug
status: active
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/reviews-must-not-chain-back-to-back-on-a
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-20T11:55:25Z"
updated_at: "2026-10-20T17:23:13Z"
---
## Problem
When a review ends "needs some work" and no engineer is running, another review starts again within minutes. Observed 2026-10-20 on #0861: passes 2-9 ran 2-3 minutes apart, then roughly 14 minutes each, with no engineer working in between, for about 45 minutes, all failing on the same finding. While a review runs, `repoos message` is refused ("review in progress - wait for it to finish"), so the fix instruction could not reach the engineer. When a message IS accepted mid-turn it only queues and is delivered at the end of the engineer's turn, so engineers hand off right before reading it. Seen on #0854 (pass 8 reviewed work from before the fix message was read) and #0860 (codex crashed after the message, then a handoff was auto-requested on the unmerged branch). Result: dozens of wasted review passes, stale-work reviews, and fixes that arrive a full cycle late.

## Desired UX
After a review verdict of needs some work (or back to the drawing board) the task goes back to the engineer and no new review starts until the engineer hands off again with a new commit or new evidence. A message sent to a task is delivered before the engineer's next handoff is accepted: a queued, undelivered message blocks or defers handoff (the engineer is told to read it first), and a message to a task in review interrupts the pending review cleanly instead of being refused. Repeated reviews of an unchanged tree are not started.

## Acceptance criteria
- A review is never auto-started on a tree (commit + evidence identity) that was already reviewed with open findings.
- After "needs some work" the task is handed back to the engineer, with the findings, rather than re-reviewed.
- `repoos message` to a task in review is accepted (not refused) and either cancels the running review or queues it so the engineer gets it first; the activity log records which.
- A handoff request while an undelivered message is queued is deferred, with a visible note, until the message is delivered.
- The review-rounds-exhausted flag still works as a backstop.
- Table-driven tests: unchanged tree, changed tree, queued message at handoff, message during review, crashed engineer with a queued message.
- Any new setting has a Settings UI control and docs.

## Notes for AI
Look at the review auto-trigger and re-review logic (src/server/review.ts and the watcher/handoff finalization), the message queue delivery (`message_queued` / `message_delivered`), and the "review in progress" refusal in the message and start routes. Related: #0861 (bookkeeping-aware evidence identity) just landed; reuse its tree-identity helper rather than adding another. See the 2026-10-20 timeline of #0861 review passes 2-13 and #0854 passes 8-15 as the worked examples. Do not remove the rounds-exhausted backstop.

### Review start entry points (audit — shared `decideReviewAutomation` in `src/server/review-automation.ts`)

| Trigger | Path | Explicit? |
| --- | --- | --- |
| `status-enter-review` | `server.ts` `startReview` on index `status → review` (watcher + handoff finalization) | no |
| `engineer-exited-pending` | `server.ts` `pendingReview` on `agent.exited` while task still in `review` | no |
| `recovery-interrupted` | `review.ts` `recoverInterruptedReviews` on server boot | no |
| `stale-evidence-rereview` | `review.ts` stale evidence refresh re-review | no |
| `evidence-gap-rereview` | `review.ts` evidence-gap repair re-review | no |
| `incomplete-retry` | `review.ts` `scheduleIncompleteRetry` | no |
| `watchdog-stuck-review` | `task-watchdog.ts` dead reviewer retry | no |
| `explicit-again` | `routes/tasks.ts` `POST …/review/again` and CLI `repoos review again` | **yes** — always runs even on unchanged tree with open findings |

Not gated: `ReviewManager.runCheckpointDelta` (post-handoff checkpoint delta review).

## Activity

- 2026-10-20T11:55:25Z · created · njachowski@gmail.com
- 2026-10-20T12:18:07Z · story
- 2026-10-20T12:42:54Z · status inbox→ready
- 2026-10-20T13:14:18Z · cli_override, model_override
- 2026-10-20T13:14:21Z · model_override
- 2026-10-20T16:10:03Z · status ready→active, branch
- 2026-10-20T16:15:34Z · body
- 2026-10-20T16:16:20Z · body
- 2026-10-20T16:17:57Z · body
- 2026-10-20T16:32:34Z · message_queued at 2026-10-20T16:32:34.610Z
- 2026-10-20T16:33:58Z · handoff failed · remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > 'Review again' starts a fresh review run that replaces the report on bee — fix it in the feature branch and re-run the gate
- 2026-10-20T16:37:06Z · message_delivered: 1 message(s)
- 2026-10-20T17:06:29Z · body
- 2026-10-20T17:11:52Z · body
- 2026-10-20T17:16:21Z · body: Notes for AI (added 12)
- 2026-10-20T17:16:21Z · message_queued at 2026-10-20T17:16:21.767Z
- 2026-10-20T17:16:38Z · message_delivered: 1 message(s)
- 2026-10-20T17:23:12Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > 'Review again' starts a fresh review run that replaces the report on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-20T17:23:13Z · note: handoff requested (cli)
