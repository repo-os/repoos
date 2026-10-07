---
id: "0692"
title: Resolve integration conflicts without restarting the full engineering and review cycle
type: feature
status: active
priority: p1
area: [server, web]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/resolve-integration-conflicts-without-re
created_at: "2026-10-05T23:52:38Z"
updated_at: "2026-10-07T16:15:57Z"
---
## Problem
Current verified incident: #0730 passed full handoff gate311sbee10:36:36Z and green review10:38:42Z at636a03b27730be914515fff8448cf9028574753f. #0728 then landed1118b2031dbd3346b4f4b91ade9dd8e6585c8ca0. #0730 MTD failed10:44:16Z on src/cli/index.ts conflict and returned active to engineer15482. Original review was valid for its snapshot, but conflict repair restarts engineering/handoff/review, repeats validation, and appears to users as failed development. Driver verified on CURRENT maina1707629aec1e575d5d85e7436b06be67e9dab27 / compiled0.5.67 hash04ce49b2639fa4317ab7fa26abbb304e224903e0a0577f7e7d69dbf1b4061cdc. integration-orchestrator.ts syncCandidate preflight routes named conflicts to onMergeConflict.

## Desired UX
Keep this within server-owned close-out, with visible Resolving integration conflict state and original review evidence tied to its immutable commit. An engineer resolves only the conflict against current main in a server-owned isolated context; no concurrent writers. Review the resolution delta (including surrounding behavior and relevant base changes), rather than repeat whole feature review. Run one required combined gate on the exact resolved candidate. Automatically resume the previously authorized MTD after resolution review and gate pass. If resolution expands scope, changes behavior, cannot be classified confidently, or targeted reviewer finds problems, return to full engineering/review. Do not assume that staying inside conflict hunks proves semantic safety.

## Acceptance criteria
1. Regression modeled on #0728 watch and #0730 decisions/attention CLI additions: resolve command registration conflict, preserve both features and tests, original review immutable, resolution-only review recorded, combined gate once, then normal publication.
2. No prior feature approval/review means no shortcut; behavior-changing resolution or edits outside allowed scope require full handoff/review. Tests demonstrate failures preserve evidence and never auto-publish.
3. Candidate provenance records approved feature SHA, main base SHA, conflict paths, resolution commit/tree, reviewer verdict and gate result. Publication lock checks the exact validated tree; main advancement triggers safe reclassification/revalidation. Dirty worktree, cancellation, server reload and stale generation cannot bypass locks or publish untested edits. Coordinate #0736 cancellation ownership and existing main-drift rules.
4. UI distinguishes conflict repair from new development with phase/reason/progress/timing; CLI/API expose equivalent state and supported actions. Show original feature review separately from pending/passed resolution review. No generic union of docs, tests, lists or code merely because changes look append-only. Restrict deterministic auto-resolution to explicitly allowlisted, tested semantics; preserve existing task-bookkeeping handling.
5. Update AGENTS.md, docs/close-out-pipeline.md and user-docs/review-and-close-out.md for the precise exception. Build, scoped self-check, normal full gate/review/MTD to land this feature. No direct-main commit, manual merge, push, release, config weakening or host changes.

## Notes for AI
Relevance reassessment of existing #0692 opex report: still relevant for genuine code conflict round-trip; partly fixed because #0679 already auto-resumes engineers and #0624 already accepts exact conflict-free merge-tree replay. Old desired UX claiming conflict-region-only edits need no review is superseded: require resolution review and semantic checks above. Earlier incident timing15-30min is historical and not freshly measured. Verify CURRENT main/running build again before implementation; external managed repos used older versions. Record commit/version/reproduction and relevance. Read integration-orchestrator.ts, onMergeConflict wiring, review/handoff lock handling and #0724 gate reuse. #0724 reduces check cost, this task changes lifecycle; avoid duplicate check runs but never skip the combined candidate validation requirement. Keep original historical Activity and task identity; do not create a duplicate task.

## Shots
```json
[
  {
    "label": "Board with integration pipeline bar (now six stages incl. resolve-conflict)",
    "target": "default",
    "route": "/",
    "highlight": ".main"
  }
]
```

## Activity

- 2026-10-05T23:52:38Z · created · unknown
- 2026-10-05T23:52:47Z · story
- 2026-10-07T10:51:15Z · title, priority, area, body
- 2026-10-07T14:35:22Z · status inbox→ready
- 2026-10-07T14:35:45Z · status ready→active, branch
- 2026-10-07T14:54:59Z · body
- 2026-10-07T14:55:58Z · body
- 2026-10-07T14:57:57Z · body
- 2026-10-07T15:00:57Z · body
- 2026-10-07T15:03:58Z · body
- 2026-10-07T15:06:43Z · body
- 2026-10-07T15:07:47Z · body: section Shots
- 2026-10-07T15:13:40Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32
    291|     expect(ui.activeTab).toBe("debug");
    292|     expect(ui.debugView).toBe("logs");
    293|     expect(ui.debugCheckFocus).toMatchObject({ taskId: "0042", kind: "…
       |                                ^
    294|   });
    295|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed | 434 passed | 1 skipped (436)
      Tests  4 failed | 5287 passed | 15 skipped (5306)
   Start at  15:08:59
   Duration  276.69s (transform 7.42s, setup 2.38s, import 51.20s, tests 248.96s, environment 225.62s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 780ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  15:13:36
   Duration  2.74s (transform 1.14s, setup 12ms, import 1.42s, tests 780ms, environment 446ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T15:19:01Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T15:19:02Z · status review→active
- 2026-10-07T15:25:39Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32
    291|     expect(ui.activeTab).toBe("debug");
    292|     expect(ui.debugView).toBe("logs");
    293|     expect(ui.debugCheckFocus).toMatchObject({ taskId: "0042", kind: "…
       |                                ^
    294|   });
    295|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed | 434 passed | 1 skipped (436)
      Tests  4 failed | 5287 passed | 15 skipped (5306)
   Start at  15:20:11
   Duration  323.84s (transform 11.03s, setup 2.93s, import 67.11s, tests 250.30s, environment 294.50s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 411ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  15:25:35
   Duration  2.26s (transform 1.05s, setup 11ms, import 1.31s, tests 411ms, environment 454ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T15:31:07Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T15:31:09Z · status review→active
- 2026-10-07T15:36:11Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32
    291|     expect(ui.activeTab).toBe("debug");
    292|     expect(ui.debugView).toBe("logs");
    293|     expect(ui.debugCheckFocus).toMatchObject({ taskId: "0042", kind: "…
       |                                ^
    294|   });
    295|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed | 434 passed | 1 skipped (436)
      Tests  4 failed | 5287 passed | 15 skipped (5306)
   Start at  15:31:45
   Duration  261.43s (transform 7.07s, setup 2.16s, import 46.78s, tests 242.31s, environment 208.28s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 786ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  15:36:07
   Duration  2.77s (transform 1.16s, setup 13ms, import 1.45s, tests 786ms, environment 446ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T15:42:06Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T15:42:06Z · status review→active
- 2026-10-07T15:48:03Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T15:48:03Z · status review→active
- 2026-10-07T15:53:18Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32
    291|     expect(ui.activeTab).toBe("debug");
    292|     expect(ui.debugView).toBe("logs");
    293|     expect(ui.debugCheckFocus).toMatchObject({ taskId: "0042", kind: "…
       |                                ^
    294|   });
    295|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed | 434 passed | 1 skipped (436)
      Tests  4 failed | 5287 passed | 15 skipped (5306)
   Start at  15:48:39
   Duration  275.68s (transform 6.62s, setup 2.36s, import 52.20s, tests 224.70s, environment 245.07s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 408ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  15:53:15
   Duration  2.35s (transform 1.09s, setup 11ms, import 1.36s, tests 408ms, environment 491ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T15:59:03Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T15:59:03Z · status review→active
- 2026-10-07T16:04:09Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32
    291|     expect(ui.activeTab).toBe("debug");
    292|     expect(ui.debugView).toBe("logs");
    293|     expect(ui.debugCheckFocus).toMatchObject({ taskId: "0042", kind: "…
       |                                ^
    294|   });
    295|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯
 Test Files  1 failed | 434 passed | 1 skipped (436)
      Tests  4 failed | 5287 passed | 15 skipped (5306)
   Start at  15:59:50
   Duration  253.07s (transform 6.58s, setup 2.07s, import 44.69s, tests 236.07s, environment 200.94s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 712ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  16:04:04
   Duration  2.73s (transform 1.16s, setup 13ms, import 1.45s, tests 712ms, environment 461ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T16:10:03Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T16:10:03Z · status review→active
- 2026-10-07T16:15:57Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/integration-status-bar.test.ts:293:32 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T16:15:57Z · status review→active
