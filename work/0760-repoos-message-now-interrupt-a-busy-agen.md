---
id: "0760"
title: "repoos message --now: interrupt a busy agent and deliver immediately"
type: feature
status: active
priority: p2
area: [cli, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-message-now-interrupt-a-busy-agen
cli_override: claude code
model_override: sonnet
created_at: "2026-10-12T14:35:44Z"
updated_at: "2026-10-13T05:04:37Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: c5c7052b617617735b2fe7111f97583ea83becc3
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem

`repoos message` queues a message when the task's agent is busy, and delivers it when the current turn ends. Steering an agent that is mid-turn is slow. The only immediate path is three commands: `repoos pause`, `repoos message`, `repoos start`. Users have to know that sequence.

## Desired UX

`repoos message <id> "<text>" --now` interrupts the running turn, delivers the message right away and resumes the agent, in one call. The default (queue) is unchanged. The CLI reports what happened: delivered now, or the reason it could not interrupt.

## Acceptance criteria

- [ ] `repoos message <id> "<text>" --now` pauses the running agent, delivers the message, and resumes the agent in one call.
- [ ] The API accepts the same option on `POST /api/tasks/:id/message` (for example `{"now": true}`). Without it, behaviour is unchanged: a busy agent queues the message.
- [ ] If the pause does not stop the run, the call fails clearly and does not deliver a second message on top of the running turn.
- [ ] The CLI output says whether the message was delivered now or queued, and why.
- [ ] Tests cover: idle agent with --now, busy agent with --now (interrupt then deliver), a pause that does not stop the run, and the default queue path unchanged.

## Notes for AI

- Reuse the existing pause, message and start code paths. Do not add a second process model or a new way to kill a turn.
- A task in review or closing out cannot take a message this way; keep the existing guards.
- Do not change the default queueing behaviour from #0756.
- Interrupting mid-edit can leave a worktree half-changed. Stop the run cleanly through the pause path and never delete files.
- Run `repoos check` before handoff.

## Activity

- 2026-10-12T14:35:44Z · created · njachowski@gmail.com
- 2026-10-12T14:35:52Z · status inbox→ready
- 2026-10-12T14:35:53Z · status ready→active, branch
- 2026-10-12T15:05:39Z · message_queued at 2026-10-12T15:05:39.129Z
- 2026-10-12T15:05:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-12T16:07:43Z · cli_override, model_override
- 2026-10-12T16:08:27Z · message_expired: not delivered within timeout
- 2026-10-12T16:09:48Z · body
- 2026-10-12T16:11:05Z · cli_override, model_override
- 2026-10-12T16:13:42Z · body
- 2026-10-12T16:29:05Z · message_queued at 2026-10-12T16:29:05.205Z
- 2026-10-12T16:29:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-12T16:37:49Z · message_delivered: 1 message(s)
- 2026-10-12T17:17:34Z · model_override
- 2026-10-12T17:19:27Z · body
- 2026-10-12T17:43:38Z · message_queued at 2026-10-12T17:43:38.967Z
- 2026-10-12T17:43:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-12T18:49:07Z · body
- 2026-10-12T18:55:31Z · handoff failed · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-12T19:00:41Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-12T19:00:42Z · note: handoff requested (cli)
- 2026-10-12T19:06:06Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: src/a.test.ts > suite > fails, src/b.test.ts > suite > fails, src/c.test.ts > suite > fails on bee — fix it in the feature branch and re-run the gate
- 2026-10-13T02:03:03Z · message_expired: not delivered within timeout
- 2026-10-13T03:14:41Z · message_queued at 2026-10-13T03:14:41.771Z
- 2026-10-13T03:14:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-13T03:27:38Z · agent exited with an error (claude) · ✗ Server finalization skipped: the branch tip is unchanged since the last identical check failure — fix the code or wait for an engineer recovery turn
- 2026-10-13T05:01:18Z · needs_input
- 2026-10-13T05:01:21Z · message_expired: not delivered within timeout
- 2026-10-13T05:02:10Z · body
- 2026-10-13T05:04:37Z · body
