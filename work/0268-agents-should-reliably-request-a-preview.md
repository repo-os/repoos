---
id: "0268"
title: Agents should reliably request a preview before handoff
type: bug
status: inbox
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:55:19Z"
updated_at: "2026-08-24T15:58:37Z"
---
## Problem
On the first dev round of a canary run, handoff completed with "No preview running — the agent didn't request one before handoff." A preview should have been requested and verified working, since preview reliability is exactly what we want caught early and often.

## Fix
Investigate why the engineer agent didn't request a preview before handoff on this task, and make requesting + verifying a preview a more reliable/expected part of the handoff flow (at least prompted for, if not required).

## Activity

- 2026-08-24T15:58:37Z · body
