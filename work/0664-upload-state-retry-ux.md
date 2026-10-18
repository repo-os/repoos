---
id: "0664"
title: Upload state + retry UX
type: feature
status: active
priority: p1
area: ui
story: Cloud attachment storage
depends_on: ["0660"]
assigned_to: ai
created_by: ""
branch: feat/upload-state-retry-ux
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-05T08:29:24Z"
updated_at: "2026-10-18T17:13:18Z"
review_rounds: 1
review_passes: 3
handoff_signal_retry_count: 1
---
Slice 7: Uploading / retrying / failed states visible in UI. Attachment never shown as available before upload succeeds. Retry without re-deriving user input.

## Acceptance criteria
- [ ] Uploading state: attachment card shows spinner/progress; file not listed as "available".
- [ ] Failed state: card shows retry action; error visible; file remains selected.
- [ ] Retry: re-submits same file/user input without re-deriving input.
- [ ] Success: only after server-confirmed upload is attachment listed as available.
- [ ] Covers upload targets (screenshots / inputs / attachments).

## Scope
Slice 7 of cloud attachment storage (depends_on: 0660). Purely UI/UX state rendering + retry flow.

## Questions for human
1. Retry endpoint: same upload endpoint or dedicated retry endpoint?
2. Auto-retry once before showing failed state?
3. Max retry count enforced in UI?

## Shots
```json
[
{
"label": "New input: outstanding attachment uploads after Create another input",
"target": "default",
"route": "/work",
"steps": [
{
  "click": ".new-btn"
},
{
  "waitFor": ".new-input-trigger"
},
{
  "click": ".new-input-trigger"
},
{
  "waitMs": 400
}
]
},
{
"label": "New task: failed screenshot retry row on freeform form",
"target": "default",
"route": "/work",
"steps": [
{
  "click": ".new-btn"
},
{
  "waitMs": 400
}
]
}
]
```

## Activity

- 2026-10-05T08:29:24Z · created · unknown
- 2026-10-05T09:16:46Z · needs_input, questions, body
- 2026-10-18T16:16:44Z · status inbox→ready
- 2026-10-18T16:16:47Z · cli_override, model_override
- 2026-10-18T16:16:49Z · status ready→active, needs_input, branch
- 2026-10-18T16:49:58Z · body
- 2026-10-18T16:58:34Z · status active→review
- 2026-10-18T16:58:35Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Notes for AI
- 2026-10-18T16:59:34Z · note: review pass 1: needs some work
- 2026-10-18T17:01:02Z · note: review pass 2: needs some work
- 2026-10-18T17:02:38Z · note: review pass 3: needs some work
- 2026-10-18T17:02:39Z · status review→active
- 2026-10-18T17:07:45Z · message_queued at 2026-10-18T17:07:45.691Z
- 2026-10-18T17:07:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T17:08:06Z · body
- 2026-10-18T17:11:04Z · body
- 2026-10-18T17:13:18Z · body
