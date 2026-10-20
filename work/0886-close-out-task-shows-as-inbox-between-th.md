---
id: "0886"
title: "Close-out: task shows as inbox between the merge and 'set status done'; stamp done atomically and ignore engineer writes while closing"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T17:18:03Z"
updated_at: "2026-10-20T17:18:03Z"
---
## Problem
During Move to done, a task can show as `inbox` on the board for about 3 minutes. Observed on #0863 (2026-10-21 ~01:08-01:11 local): the pre-merge main copy and the branch copy both said `status: review`, but the close-out merge commit `7ecfcb7f1` itself contains `status: inbox` (updated_at 17:08:41Z). A stray `handoff requested (cli)` from the still-running engineer landed in the same second and failed with "task must be active or review, but is inbox". The status only becomes `done` at the later `docs(0863): set status done` commit (17:11:26Z, `markTaskReleased` in src/server/write.ts), so users see the task in the inbox column and may think it was reset.
Related earlier incident: #0838 (a stale or missing `status:` surfaces as `inbox` through the parser default).

## Desired UX
A task being closed never shows as `inbox`. The merge that publishes the task stamps `status: done` (and merged commit) in the same commit, or the task shows an explicit "closing" state until `done`. A running engineer cannot change or request anything on a task that is closing out.

## Acceptance criteria
- Find which write produced `status: inbox` in the merge commit (the engineer's late handoff request racing close-out, or the conflict resolution of the task file) and prove it with a test.
- The close-out merge commit's task file has `status: done`, or the board shows a deliberate closing state; never `inbox`, at any point from merge to release.
- While a task is closing out (lock present), `repoos mv`/handoff requests from an engineer process are rejected with a clear message and write nothing to the task file.
- The engineer process for a task is stopped or fenced before the close-out merge begins.
- Table-driven tests: engineer handoff request during each close-out phase (gate, merge, publish, release), conflict resolution of the own task file, and retry after a failed close-out.

## Notes for AI
- Relevant code: src/server/integration-orchestrator.ts (merge/publish, `markTaskReleased` call near line ~3988), src/server/conflict-resolution.ts (`resolveTaskFileByTakingMain`), src/server/close-out-task-status.ts (#0838 repair), src/server/write.ts (`markTaskReleased`, line ~660).
- Engineer-side writes go through `repoos mv <id> review` (cmdMv) and the handoff request path: check that they read the close-out lock.
- Do not weaken the existing rule that `repoos mv <id> done` never lands code.

## Activity

- 2026-10-20T17:18:03Z · created · njachowski@gmail.com
