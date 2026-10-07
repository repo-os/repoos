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
updated_at: "2026-10-07T18:08:13Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-07T18:07:41.275Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] highlight .task-card .tc-hint.tc-moving matched nothing on / (captured http://127.0.0.1:60065/) (http://127.0.0.1:60065/); [missing-target] highlight .ibar-wrap matched nothing on / (captured http://127.0.0.1:60065/) (http://127.0.0.1:60065/)"
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
    "label": "Board",
    "target": "default",
    "route": "/"
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
- 2026-10-07T16:52:43Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  16:48:13
   Duration  265.68s (transform 7.12s, setup 2.22s, import 48.06s, tests 245.45s, environment 211.71s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 706ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  16:52:39
   Duration  2.67s (transform 1.15s, setup 12ms, import 1.44s, tests 706ms, environment 444ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T16:58:10Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T16:58:10Z · status review→active
- 2026-10-07T17:03:31Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  16:58:54
   Duration  271.80s (transform 7.03s, setup 2.38s, import 49.20s, tests 246.36s, environment 220.73s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 790ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:03:26
   Duration  2.77s (transform 1.15s, setup 13ms, import 1.45s, tests 790ms, environment 449ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:08:39Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T17:08:39Z · status review→active
- 2026-10-07T17:14:05Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  17:09:16
   Duration  285.38s (transform 6.86s, setup 2.46s, import 55.93s, tests 228.44s, environment 255.86s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 409ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:14:02
   Duration  2.42s (transform 1.15s, setup 11ms, import 1.42s, tests 409ms, environment 504ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:19:39Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T17:19:40Z · status review→active
- 2026-10-07T17:24:56Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  17:20:25
   Duration  266.63s (transform 7.04s, setup 2.25s, import 48.95s, tests 246.44s, environment 212.02s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 781ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:24:52
   Duration  2.72s (transform 1.13s, setup 12ms, import 1.41s, tests 781ms, environment 443ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:30:39Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T17:30:40Z · status review→active
- 2026-10-07T17:36:17Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T17:36:17Z · status review→active
- 2026-10-07T17:43:23Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  17:37:01
   Duration  377.54s (transform 12.40s, setup 3.77s, import 81.62s, tests 275.80s, environment 352.55s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 509ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:43:19
   Duration  2.91s (transform 1.40s, setup 13ms, import 1.72s, tests 509ms, environment 572ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:49:17Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T17:49:17Z · status review→active
- 2026-10-07T17:54:49Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:381:35
    379|
    380|     const expandedChip = expanded.find(".ibar .ibar-chip");
    381|     expect(expandedChip.exists()).toBe(true);
       |                                   ^
    382|     expect(expandedChip.text()).toBe("3m 07s");
    383|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 441 passed | 1 skipped (443)
      Tests  1 failed | 5327 passed | 15 skipped (5343)
   Start at  17:49:57
   Duration  287.65s (transform 6.92s, setup 2.51s, import 55.64s, tests 229.79s, environment 258.85s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 411ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  17:54:45
   Duration  2.42s (transform 1.13s, setup 12ms, import 1.41s, tests 411ms, environment 502ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T17:59:39Z · body
- 2026-10-07T18:01:13Z · body
- 2026-10-07T18:07:38Z · note: ui verification failed (2 issue(s)): [missing-target] highlight .task-card .tc-hint.tc-moving matched nothing on / (captured http://127.0.0.1:60065/) (http://127.0.0.1:60065/); [missing-target] highlight .ibar-wrap matched nothing on / (captured http://127.0.0.1:60065/) (http://127.0.0.1:60065/)
- 2026-10-07T18:08:13Z · body: section Shots
