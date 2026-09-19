---
id: "0457"
title: Show 'Requested review' instead of 'Paused' on task card when agent emitted a handoff signal
type: feature
status: active
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-19T23:28:27Z"
updated_at: "2026-09-19T23:47:10Z"
---
## Problem

When an agent emits the handoff signal and stops, the task card shows 'Paused' with tooltip 'agent stopped — click Restart work to resume'. This is misleading: the agent didn't stop unexpectedly, it deliberately requested review. The right label is 'Requested review'.

The case that shows this most clearly is when handoff is 'retained for recovery' (server was restarted before finalization could complete) — the eng chat shows the retention warning, but the card still says Paused.

## Desired behaviour

On a paused active task where the agent emitted a handoff signal, show:
- Label: 'Requested review'
- Tooltip: 'agent requested review — click Move to review to proceed'

Regular paused tasks (watchdog stall, manual stop, error exit) keep showing 'Paused' as before.

## Implementation notes

The 'retained for recovery' state is stored in `pendingHandoffs` on disk (see `pendingHandoffsPath` in `src/server/agents.ts`). It is NOT currently surfaced on the task object.

The cleanest approach is to add a boolean field (e.g. `pendingHandoff: boolean`) to the task API response when a pending handoff entry exists for that task id, then key the card label off it in `TaskCard.vue` (the `hint` computed, around line 366 — before the 'paused' fallback).

An alternative is a dedicated `/api/tasks/:id/handoff-pending` endpoint, but polluting the task object is likely simpler and already precedented (e.g. `needsInput`).

## Activity

- 2026-09-19T23:28:27Z · created · unknown
- 2026-09-19T23:47:10Z · status inbox→active
