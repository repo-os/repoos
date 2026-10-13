---
id: "0760"
title: "repoos message --now: interrupt a busy agent and deliver immediately"
type: feature
status: review
priority: p2
area: [cli, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-message-now-interrupt-a-busy-agen
created_at: "2026-10-12T14:35:44Z"
updated_at: "2026-10-13T05:11:23Z"
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
- 2026-10-13T05:11:23Z · status active→review
