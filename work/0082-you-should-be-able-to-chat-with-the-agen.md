---
id: "0082"
title: Route task chat to the right agent for every lifecycle state
type: feature
status: draft
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T09:03:41Z"
updated_at: "2026-08-11T17:38:16Z"
---
## Problem

The Agent tab is useful once implementation starts, but task conversation does
not yet have a clear role or safety model across the whole lifecycle. Before
work begins, the user needs planning help; during implementation and review,
they need the engineer operating in the task worktree; after completion, they
need explanatory Q&A without accidentally mutating finished work.

## Desired UX

- In `draft`, `inbox`, and `ready`, chat uses the PM agent as a planning mode.
  It can explain and propose improvements to the task specification, and only
  changes the task through a narrow, confirmed RepoOS mutation.
- In `active` and `review`, chat continues with the task's engineer and current
  worktree/session so follow-up implementation and review fixes stay coherent.
- In `done`, chat uses an explanatory engineer mode grounded in the final task,
  retained transcript, and merged diff. It is read-only unless the user
  explicitly chooses a future reopen/follow-up-task workflow.
- The UI clearly identifies which role is answering and whether that role may
  edit the task or code.

## Acceptance criteria

- [ ] Chat is available in every lifecycle state and routes to PM, engineer, or
      read-only explanatory mode according to the rules above.
- [ ] Role changes never silently reuse an incompatible provider session id;
      context is handed off explicitly and remains attributable in the log.
- [ ] Pre-active task edits require explicit user confirmation and use the
      guarded RepoOS task API rather than direct filesystem access.
- [ ] Active/review follow-ups reuse the registered worktree and engineer
      session, including after reopening the drawer.
- [ ] Done-state chat cannot modify the completed task, merged branch, or main
      checkout; it can offer to create a separate follow-up task.
- [ ] Missing or unavailable configured agents fail soft with a useful message
      and do not change task state.
- [ ] Tests cover routing for every status, state transitions during an open
      chat, session handoff, permission boundaries, and unavailable agents.
- [ ] `repoos check` passes.

## Notes for AI

- Treat this as role/session orchestration, not just showing the same chat box
  everywhere. Define the state-to-role matrix centrally so UI and server cannot
  disagree.
- Build on 0090 for durable transcripts, 0094 for privileged task mutations,
  and 0097 for compact context packs. Avoid implementing competing persistence,
  permission, or prompt-assembly mechanisms here.
- Retain a single chronological display while recording role, engine, session,
  and timestamp metadata for each turn.

## Scope

- Covers lifecycle-aware chat routing, role disclosure, context/session handoff,
  guarded planning edits, and read-only done-state Q&A.
- Deferred: reopening done tasks in place, autonomous PM edits without
  confirmation, multi-agent group chat, and cross-task memory.

## Related

- 0042 — per-task Agent tab and streaming chat foundation
- 0053 — retained chat during review
- 0090 — transcript persistence
- 0094 — API-first trusted mutations
- 0097 — cached task context packs

## Activity

- 2026-08-11T09:03:41Z · created · unknown
- 2026-08-11T15:37:46Z · updated · turn rough idea into a lifecycle role and permission design
- 2026-08-11T17:38:13Z · status draft→inbox
- 2026-08-11T17:38:16Z · status inbox→draft
