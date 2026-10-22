---
id: "0912"
title: "Human: review and accept ADR 0009 (remote engineer sessions) or send back changes"
type: feature
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T01:41:09Z"
updated_at: "2026-10-22T01:41:09Z"
---
## Problem
#0904 produced ADR 0009 (docs/adr/0009-remote-engineer-sessions.md, status: proposed). It decides that engineer sessions run in a real git worktree on a runner, synchronised with git bundles in both directions, with the local worktree staying canonical. The ADR says no implementation starts before a human accepts it.

## Desired UX
A human reads the ADR (and user-docs/remote-engineers.md), then either marks it accepted or records the changes wanted.

## Acceptance criteria
- ADR 0009 status changed from proposed to accepted (or a list of requested changes recorded on this task).
- The implementation task for ADR 0009 is unblocked or revised accordingly.

## Notes for AI
Human-only. Do not start this task.

## Activity

- 2026-10-22T01:41:09Z · created · njachowski@gmail.com
