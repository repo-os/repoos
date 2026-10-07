---
id: "0740"
title: Board card says 'queued for close-out' for the job that is actively integrating (stage not reported yet)
type: bug
status: active
priority: p2
area: web
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/board-card-says-queued-for-close-out-for
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T14:13:12Z"
updated_at: "2026-10-07T16:44:11Z"
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

## Shots
```json
[
  {
    "label": "Board cards distinguish active integrating vs queued close-out",
    "target": "default",
    "route": "/",
    "highlight": ".task-card .tc-hint.tc-moving"
  },
  {
    "label": "Integration bar stall actions when close-out hangs",
    "target": "default",
    "route": "/",
    "highlight": ".ibar-wrap"
  }
]
```

## Activity

- 2026-10-07T14:13:12Z · created · unknown
- 2026-10-07T16:24:54Z · cli_override, model_override
- 2026-10-07T16:24:57Z · status inbox→ready
- 2026-10-07T16:24:58Z · status ready→active, branch
- 2026-10-07T16:32:03Z · body
- 2026-10-07T16:33:06Z · body: section Shots
- 2026-10-07T16:38:43Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  16:34:01
   Duration  278.23s (transform 6.86s, setup 2.39s, import 53.44s, tests 223.56s, environment 249.61s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 402ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  16:38:40
   Duration  2.33s (transform 1.09s, setup 11ms, import 1.35s, tests 402ms, environment 484ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T16:44:10Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T16:44:11Z · status review→active
