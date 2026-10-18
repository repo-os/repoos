---
id: "0834"
title: "Close-out: engineer checkpoint commits after handoff trigger an automatic re-review of the delta, not a hard error"
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-engineer-checkpoint-commits-af
model_override: deepinfra/XiaomiMiMo/MiMo-V2.6-Flash
created_at: "2026-10-18T09:09:05Z"
updated_at: "2026-10-18T17:51:13Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-10-18T16:15:03.089Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 47285b26 to 5792761a) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/review-override.test.ts > review completion > reports the reviewer selected for the turn, not the global default on bee — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: 90dd570de19d07048a020e9fc550ae7b969589fb
handoff_signal_retry_count: 1
dev_error_count: 6
---
## Problem
Move to done refuses with "worktree changed after handoff: HEAD is X but handoff recorded Y" whenever the branch HEAD moves after handoff, and the only recovery is a person: discard the edits or send the task back to the engineer (seen on #0832, 2026-10-18). The guard is right in principle (close-out must merge only the reviewed commit; incident #0594), but the common cause is benign: the engineer's own WIP self-check checkpoint commit (a few fixture/test files) landing after the review passed, and the task then sits in review with no engineer and no signal.

## Desired UX
When the only commits after the recorded handoff sha are RepoOS/engineer checkpoint commits (`WIP: engineer self-check checkpoint (#id)`) and the worktree is clean, Move to done does not hard-fail. Instead RepoOS automatically re-runs the handoff on the new HEAD (gate + shots) and a review pass scoped to the delta since the approved sha (reuse the narrow-resolution "review only the delta" machinery from #0692), then resumes the authorized Move to done if that pass is good to go. Any other post-handoff change (dirty tree, non-checkpoint commit, mixed drift) keeps today's hard error with a clearer message that says what to do.

## Acceptance criteria
- Test: HEAD ahead of the lock by one checkpoint commit -> automatic delta re-review is queued, the task is not left silently in review, and the original review stays tied to its commit.
- Test: a dirty worktree or a non-checkpoint commit still refuses with the existing error.
- Test: a delta review that fails sends the task back to active with the findings, like a normal needs-some-work verdict.
- docs/close-out-pipeline.md and user-docs/review-and-close-out.md updated; AGENTS.md "Interactive sessions" paragraph on post-handoff edits updated to match.

## Notes for AI
Never widen what counts as benign without a test; fail closed. Look at src/core/close-out-failure.ts, src/server/integration-orchestrator.ts, and src/server/conflict-resolution.ts for the existing guard and delta-review path. Source: driver discussion 2026-10-18 (#0832).

## Shots
```json
[
{
"label": "Board card during post-handoff checkpoint recovery",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"task-card-agent-hint\"]",
"state": "card:checkpointRecovery"
}
]
```

## Activity

- 2026-10-18T09:09:05Z · created · njachowski@gmail.com
- 2026-10-18T09:09:22Z · status inbox→ready
- 2026-10-18T09:09:37Z · cli_override, model_override
- 2026-10-18T09:09:42Z · status ready→active, branch
- 2026-10-18T09:10:15Z · agent exited with an error (cursor) · Error: [unavailable] read ETIMEDOUT
- 2026-10-18T09:35:33Z · needs_input
- 2026-10-18T09:53:07Z · message_queued at 2026-10-18T09:53:07.826Z
- 2026-10-18T09:53:08Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T10:22:28Z · body
- 2026-10-18T10:27:02Z · body
- 2026-10-18T10:31:35Z · body
- 2026-10-18T11:11:51Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-10-18T11:11:51Z · message_delivered: 1 message(s)
- 2026-10-18T11:17:28Z · needs_input
- 2026-10-18T11:24:39Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-18T11:25:05Z · cli_override, model_override
- 2026-10-18T11:25:33Z · body
- 2026-10-18T11:26:02Z · body
- 2026-10-18T11:26:42Z · body
- 2026-10-18T11:26:47Z · model_override
- 2026-10-18T11:35:41Z · needs_input
- 2026-10-18T11:53:11Z · message_queued at 2026-10-18T11:53:11.767Z
- 2026-10-18T11:53:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T12:18:27Z · body
- 2026-10-18T12:24:45Z · message_delivered: 1 message(s)
- 2026-10-18T12:50:29Z · handoff failed · remote validation failed: test failure: tests/review-override.test.ts > review completion > reports the reviewer selected for the turn, not the global default on mini — fix it in the feature branch and re-run the gate
- 2026-10-18T12:55:36Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/review-override.test.ts > review completion > reports the reviewer selected for the turn, not the global default on mini — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-18T12:55:36Z · note: handoff requested (cli)
- 2026-10-18T13:01:38Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/review-override.test.ts > review completion > reports the reviewer selected for the turn, not the global default on bee — fix it in the feature branch and re-run the gate
- 2026-10-18T13:07:18Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/review-override.test.ts > review completion > reports the reviewer selected for the turn, not the global default on mini — fix it in the feature branch and re-run the gate
- 2026-10-18T13:10:04Z · message_queued at 2026-10-18T13:10:04.658Z
- 2026-10-18T13:11:26Z · body
- 2026-10-18T13:14:48Z · body
- 2026-10-18T13:15:48Z · body
- 2026-10-18T13:27:16Z · message_queued at 2026-10-18T13:27:16.500Z
- 2026-10-18T13:27:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T13:32:42Z · message_delivered: 2 message(s)
- 2026-10-18T13:39:21Z · body
- 2026-10-18T14:01:15Z · body
- 2026-10-18T14:12:43Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-18T14:16:50Z · needs_input
- 2026-10-18T14:22:34Z · body
- 2026-10-18T14:32:20Z · message_queued at 2026-10-18T14:32:20.216Z
- 2026-10-18T14:32:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T15:27:09Z · body
- 2026-10-18T15:31:59Z · body
- 2026-10-18T15:33:37Z · body
- 2026-10-18T15:42:16Z · note: ui verification failed (1 issue(s)): [missing-target] Board card during post-handoff checkpoint recovery: highlight [data-test-id="task-card-agent-hint"] matched nothing on / (http://127.0.0.1:60485/?shotState=card%3AcheckpointRecovery)
- 2026-10-18T15:42:19Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T15:42:19Z · message_delivered: 1 message(s)
- 2026-10-18T15:48:42Z · message_queued at 2026-10-18T15:48:42.742Z
- 2026-10-18T15:51:34Z · note: highlight [data-test-id="task-card-agent-hint"] matched nothing on /
- 2026-10-18T16:02:55Z · body
- 2026-10-18T16:05:00Z · body
- 2026-10-18T16:15:02Z · message_delivered: 1 message(s)
- 2026-10-18T16:37:14Z · body
- 2026-10-18T17:31:54Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/review-override.test.ts > review completion > reports the reviewer selected for the turn, not the global default on mini — fix it in the feature branch and re-run the gate
- 2026-10-18T17:51:13Z · message_queued at 2026-10-18T17:51:13.280Z
- 2026-10-18T17:51:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
