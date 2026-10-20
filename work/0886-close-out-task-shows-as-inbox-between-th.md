---
id: "0886"
title: "Close-out: task shows as inbox between the merge and 'set status done'; stamp done atomically and ignore engineer writes while closing"
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-task-shows-as-inbox-between-th
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T17:18:03Z"
updated_at: "2026-10-20T18:33:35Z"
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


Evidence (2026-10-21): this reproduces on EVERY landing, not just #0863. For #0865 both parents of merge commit e0cca5bc9 ('repoos/integrate/0865' into main) carry `status: review` in work/0865-*.md, yet the merge result itself carries `status: inbox`. The task then shows in the inbox column until the later 'set status done' commit (~1-3 minutes). So the close-out merge's handling of the task's own work file (conflict resolution / bookkeeping take-main logic in src/server/conflict-resolution.ts and integration-orchestrator.ts, around the own-task-file resolution) produces a file whose status the parser reads as inbox (missing or wrong `status:`). Reproduce with a throwaway repo: task file changed on both sides, run the close-out merge, assert the merge commit's file says the closing status. Fix there first; the 'stamp done in the merge commit' and 'fence engineer writes while closing' parts stay in scope.

## Activity

- 2026-10-20T17:18:03Z · created · njachowski@gmail.com
- 2026-10-20T18:33:00Z · priority
- 2026-10-20T18:33:09Z · body: Notes for AI (added 1)
- 2026-10-20T18:33:24Z · status inbox→ready
- 2026-10-20T18:33:32Z · cli_override, model_override
- 2026-10-20T18:33:35Z · status ready→active, branch
