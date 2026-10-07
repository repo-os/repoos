---
id: "0740"
title: Board card says 'queued for close-out' for the job that is actively integrating (stage not reported yet)
type: bug
status: ready
priority: p2
area: web
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T14:13:12Z"
updated_at: "2026-10-07T16:24:57Z"
---
## Problem

2026-10-07: the pipeline bar showed '#0730 integrating 2m 27s' (active job, all stages empty: stage null) while the #0730 board card still said 'QUEUED FOR CLOSE-OUT', and #0720 (genuinely queued behind it) said the same. The card cannot tell 'the active job before its first stage event' from 'waiting in the queue'. Earlier the same day a job sat as the active job for 15 minutes with stage null and no log lines (#0720, 13:54-14:09Z) and the UI gave no sign it was stuck.

## Desired UX

- The active job's card says 'INTEGRATING · <stage or starting…> · <elapsed>'; queued jobs say 'QUEUED #N (behind #X)'. Both read the same snapshot as the pipeline bar (GET /api/integration/pipeline: active.taskId vs queue[]).
- An active job with no stage/log progress for more than N minutes (default 3) is shown as 'STALLED · no progress Nm' on the card and the bar, with the cancel + retry action offered inline.

## Acceptance criteria

- Tests: active+stage null renders integrating/starting; queued shows position; stall threshold. Uses shared components. repoos check passes.

## Notes for AI

Read TaskCard.vue (pipelineStage, inPipeline computed), the pipeline bar, and src/server integration snapshot. Related: #0738, #0720.

## Activity

- 2026-10-07T14:13:12Z · created · unknown
- 2026-10-07T16:24:54Z · cli_override, model_override
- 2026-10-07T16:24:57Z · status inbox→ready
