---
id: "0886"
title: "Close-out: task shows as inbox between the merge and 'set status done'; stamp done atomically and ignore engineer writes while closing"
type: bug
status: active
priority: p1
area: server
assigned_to: human
created_by: njachowski@gmail.com
branch: feat/close-out-task-shows-as-inbox-between-th
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T17:18:03Z"
updated_at: "2026-10-20T21:16:19Z"
last_handoff_failure_fingerprint: "check|the worktree changed while the gate was running (HEAD moved from 4888f355 to e1bf06da) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
last_handoff_failure_sha: 4888f35575fbdbdcd27ee3ba9d0b8cdb33dd2646
dev_error_count: 1
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
- 2026-10-20T18:39:21Z · message_queued at 2026-10-20T18:39:21.309Z
- 2026-10-20T18:39:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T19:01:47Z · body
- 2026-10-20T19:10:02Z · body
- 2026-10-20T19:18:04Z · body
- 2026-10-20T19:27:42Z · body
- 2026-10-20T19:31:29Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-20T19:31:29Z · message_delivered: 1 message(s)
- 2026-10-20T19:39:45Z · handoff failed · remote validation failed: test failure: tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > returns 409 + needsCommit against a dirty main and never enqueues, tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > surfaces an uncommitted repoos.toml instead of silently committing it (#0819), tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > does not block close-out when the only dirty files on main are shot captures (#0713) on bee — fix it in the feature branch and re-run the gate
- 2026-10-20T19:44:45Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > returns 409 + needsCommit against a dirty main and never enqueues, tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > surfaces an uncommitted repoos.toml instead of silently committing it (#0819), tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > does not block close-out when the only dirty files on main are shot captures (#0713) on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-20T19:44:45Z · note: handoff requested (cli)
- 2026-10-20T19:47:42Z · status active→ready
- 2026-10-20T19:47:46Z · status ready→active
- 2026-10-20T19:55:21Z · body
- 2026-10-20T20:01:35Z · body
- 2026-10-20T20:02:08Z · body
- 2026-10-20T20:05:03Z · body
- 2026-10-20T20:10:03Z · body
- 2026-10-20T20:10:22Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-20T20:12:56Z · body
- 2026-10-20T20:18:48Z · needs_input
- 2026-10-20T20:19:01Z · assigned_to
- 2026-10-20T20:33:48Z · assigned_to
- 2026-10-20T20:33:50Z · note: handoff requested (ui-review)
- 2026-10-20T20:41:44Z · handoff failed · ui-review handoff failed at check · remote validation failed: test failure: tests/moot-failure-reconcile.test.ts > moot close-out failure reconciliation (#0289) > drops a failed close-out job whose task is already done instead of leaving a failed record on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-20T20:48:49Z · note: handoff requested (ui-review)
- 2026-10-20T20:52:56Z · body
- 2026-10-20T20:54:35Z · body
- 2026-10-20T20:57:36Z · handoff failed · ui-review handoff failed at check · the worktree changed while the gate was running (HEAD moved from 4888f355 to e1bf06da) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-20T20:57:41Z · body
- 2026-10-20T21:07:40Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > returns 409 + needsCommit against a dirty main and never enqueues, tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > surfaces an uncommitted repoos.toml instead of silently committing it (#0819), tests/done-guard.test.ts > move-to-done dirty-main guard (#0211) > does not block close-out when the only dirty files on main are shot captures (#0713) on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-20T21:07:41Z · note: handoff requested (cli)
- 2026-10-20T21:11:08Z · assigned_to
- 2026-10-20T21:16:19Z · note: shots: skipped — the diff (17 changed paths) touches no capture target's globs — no UI change to capture
