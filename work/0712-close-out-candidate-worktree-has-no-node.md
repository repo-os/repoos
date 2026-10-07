---
updated_at: "2026-10-07T04:47:17Z"
review_passes: 2
id: "0712"
title: "Close-out candidate worktree has no node_modules: check plan fails with 'prettier: command not found'"
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/close-out-candidate-worktree-has-no-node
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T09:14:49Z"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Row 24: unless the check plan starts with an install step. Install deps (or reuse) in the candidate worktree, or fail with advice.

## Verify first

VERIFY FIRST: #0674 (merged 2026-10-06) already reuses the primary checkout's node_modules in a candidate worktree (integration-orchestrator.ts ~691-700). Reproduce on CURRENT main with a check plan that runs a locally installed tool (prettier) in the close-out candidate. If it already works, add a regression test, say so in your reply and the task notes, and stop.

## Notes for AI
## Verification (#0712)

#0674 symlink-main reuses main's `node_modules` during candidate sync, but that alone does not cover a candidate with no usable install after merge (broken symlink, primary never installed, or plans that invoke local binaries like `prettier` without a leading install step). Implemented `shouldPrepareCandidateDependencies` in `dependency-install.ts` and wired it in `integration-orchestrator.ts` validating phase: frozen install when needed, skip when the full-profile check plan already installs, actionable advice when install is impossible. Regression tests in `close-out-dependency.test.ts`.

## Activity

- 2026-10-06T09:14:49Z · created · unknown
- 2026-10-06T09:14:50Z · needs_input
- 2026-10-06T23:52:17Z · cli_override, model_override
- 2026-10-06T23:52:20Z · status inbox→ready
- 2026-10-06T23:52:21Z · status ready→active, needs_input, branch
- 2026-10-06T23:55:52Z · body
- 2026-10-06T23:57:16Z · body
- 2026-10-06T23:57:25Z · body
- 2026-10-06T23:58:50Z · body
- 2026-10-07T00:00:13Z · body: section Notes for AI
- 2026-10-07T00:00:39Z · body
- 2026-10-07T00:02:16Z · body
- 2026-10-07T00:08:04Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/mtd-remote-deadline.test.ts:147:28
    145|     const { gateParams, validatorCalls } = await runGateWithBudget(0);
    146|
    147|     expect(gateParams).not.toBeNull();
       |                            ^
    148|     expect(gateParams!["deadlineAt"]).toBeUndefined();
    149|     expect(validatorCalls[0]!["deadlineAt"]).toBeUndefined();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 423 passed | 1 skipped (425)
      Tests  2 failed | 5119 passed | 15 skipped (5136)
   Start at  00:03:33
   Duration  266.77s (transform 6.31s, setup 2.27s, import 48.60s, tests 217.88s, environment 238.53s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 408ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  00:08:00
   Duration  2.27s (transform 1.05s, setup 11ms, import 1.31s, tests 408ms, environment 470ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T00:13:10Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/mtd-remote-deadline.test.ts:147:28 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T00:13:11Z · status review→active
- 2026-10-07T00:18:07Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/mtd-remote-deadline.test.ts:147:28
    145|     const { gateParams, validatorCalls } = await runGateWithBudget(0);
    146|
    147|     expect(gateParams).not.toBeNull();
       |                            ^
    148|     expect(gateParams!["deadlineAt"]).toBeUndefined();
    149|     expect(validatorCalls[0]!["deadlineAt"]).toBeUndefined();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 423 passed | 1 skipped (425)
      Tests  2 failed | 5119 passed | 15 skipped (5136)
   Start at  00:13:35
   Duration  268.12s (transform 6.30s, setup 2.30s, import 49.88s, tests 218.64s, environment 239.00s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 409ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  00:18:04
   Duration  2.27s (transform 1.05s, setup 11ms, import 1.31s, tests 409ms, environment 469ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T00:23:10Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/mtd-remote-deadline.test.ts:147:28 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T00:23:11Z · status review→active
- 2026-10-07T00:32:56Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 1) —  ❯ tests/mtd-remote-deadline.test.ts:147:28
    145|     const { gateParams, validatorCalls } = await runGateWithBudget(0);
    146|
    147|     expect(gateParams).not.toBeNull();
       |                            ^
    148|     expect(gateParams!["deadlineAt"]).toBeUndefined();
    149|     expect(validatorCalls[0]!["deadlineAt"]).toBeUndefined();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 423 passed | 1 skipped (425)
      Tests  2 failed | 5119 passed | 15 skipped (5136)
   Start at  00:29:14
   Duration  217.91s (transform 5.59s, setup 1.81s, import 29.68s, tests 197.98s, environment 186.95s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 345ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  00:32:52
   Duration  1.93s (transform 959ms, setup 9ms, import 1.11s, tests 345ms, environment 402ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T00:38:18Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) —  ❯ tests/mtd-remote-deadline.test.ts:147:28 · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T00:38:18Z · status review→active
- 2026-10-07T00:48:18Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-07T00:53:18Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-07T01:07:14Z · note: OWNER clarification: cross-repo reports (private-tuk/tuk-private/opex) may describe an outdated RepoOS version. Verify CURRENT main behavior and the combined current-main/task-branch tree before treating the report or diagnosis as accurate. Record exact version/commit, reproduction, and whether still relevant, partly fixed, already fixed, or misdiagnosed. Do not implement a stale request; preserve regression evidence for already-fixed behavior. This reinforces Verify first and also applies to integration repairs.
- 2026-10-07T01:07:29Z · body
- 2026-10-07T01:09:18Z · body
- 2026-10-07T01:15:19Z · status active→review
- 2026-10-07T01:15:19Z · note: Task body is underspecified: missing sections: Problem, Acceptance criteria; empty sections: Notes for AI
- 2026-10-07T01:15:20Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-07T01:15:54Z · note: review pass 1: good to go
- 2026-10-07T04:47:17Z · note: review pass 1: good to go

