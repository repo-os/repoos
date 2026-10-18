---
last_close_out_gate_ms: 375582
last_close_out_gate_at: "2026-10-18T18:03:56.494Z"
id: "0834"
title: "Close-out: engineer checkpoint commits after handoff trigger an automatic re-review of the delta, not a hard error"
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-engineer-checkpoint-commits-af
model_override: deepinfra/XiaomiMiMo/MiMo-V2.6-Flash
created_at: "2026-10-18T09:09:05Z"
updated_at: "2026-10-18T18:03:56Z"
review_passes: 4
last_check_failure: "repoos check at 2026-10-18T16:15:03.089Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 47285b26 to 5792761a) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
handoff_signal_retry_count: 1
dev_error_count: 7
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
- 2026-10-18T16:49:29Z · status active→review
- 2026-10-18T16:49:30Z · note: shots: skipped — 4 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-18T16:50:13Z · note: review pass 1: good to go
- 2026-10-18T16:56:33Z · status review→active
- 2026-10-18T16:56:39Z · message_queued at 2026-10-18T16:56:39.890Z
- 2026-10-18T17:00:43Z · body
- 2026-10-18T17:05:34Z · status active→review
- 2026-10-18T17:05:35Z · note: shots: skipped — 4 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-18T17:06:29Z · note: review pass 2: good to go
- 2026-10-18T17:08:31Z · status review→active
- 2026-10-18T17:14:35Z · status active→review
- 2026-10-18T17:14:36Z · note: shots: skipped — 4 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-18T17:15:28Z · note: review pass 3: good to go
- 2026-10-18T17:21:06Z · status review→active
- 2026-10-18T17:21:14Z · message_delivered: 1 message(s)
- 2026-10-18T17:21:16Z · status active→review
- 2026-10-18T17:21:17Z · note: handoff requested (cli)
- 2026-10-18T17:22:47Z · handoff failed · task-file handoff failed at check · the worktree changed while the gate was running (appeared: AGENTS.md, docs/previews.md, repoos.toml, src/cli/api-route-parity.ts, src/cli/help.ts, src/cli/index.ts, src/commands/control-api.ts, src/commands/migrate.ts, src/core/activity-animation.test.ts, src/core/activity-animation.ts, src/core/attachment-migration.test.ts, src/core/attachment-migration.ts, src/core/attachment-reference.test.ts, src/core/attachment-reference.ts, src/core/attachment-upload-state.ts, src/core/config.ts, src/core/debug-tldr-key.test.ts, src/core/debug-tldr-key.ts, src/core/review-verdict.test.ts, src/core/review-verdict.ts, src/core/shot-fixtures.ts, src/core/shot-page.ts, src/core/shot-plan.ts, src/core/task.ts, src/core/ui-verification-config.ts, src/server/agents.ts, src/server/attachments.ts, src/server/close-out-outcome-backfill.ts, src/server/close-out-outcome.ts, src/server/debug-tldr.ts, src/server/pm-attachments.ts, src/server/review.ts, src/server/ui-handoff-gate.ts, src/ui-app/src/components/ActivityIndicator.vue, src/ui-app/src/components/DebugPanel.vue, src/ui-app/src/components/IntegrationStatusBar.vue, src/ui-app/src/components/TaskCard.vue, src/ui-app/src/components/TaskDrawer.vue, src/ui-app/src/components/activity-art/BooSwoopArt.vue, src/ui-app/src/components/activity-art/PumpkinSpellArt.vue, src/ui-app/src/components/activity-art/RgbKeystormArt.vue, src/ui-app/src/components/activity-art/WheelieCourierArt.vue, src/ui-app/src/lib/debug-event-expand.ts, src/ui-app/src/lib/handoff-verification.ts, src/ui-app/src/lib/needs-input-ui.ts, src/ui-app/src/lib/shot-preview-fixtures.ts, src/ui-app/src/lib/shot-rows.ts, src/ui-app/src/stores/repo.ts, src/ui-app/src/style.css, src/ui-app/tests/activity-indicator-motion.test.ts, src/ui-app/tests/activity-indicator.test.ts, src/ui-app/tests/attachments.test.ts, src/ui-app/tests/cli-control-api.test.ts, src/ui-app/tests/cli-screenshots.test.ts, src/ui-app/tests/close-out-outcome-backfill.test.ts, src/ui-app/tests/debug-event-expand.test.ts, src/ui-app/tests/freeform-input-carry.test.ts, src/ui-app/tests/input-attachments.test.ts, src/ui-app/tests/integration-pipeline-ui.test.ts, src/ui-app/tests/integration-status-bar.test.ts, src/ui-app/tests/needs-input-ui.test.ts, src/ui-app/tests/pm-attachments.test.ts, src/ui-app/tests/shot-plan-edit.test.ts, src/ui-app/tests/shot-plan.test.ts, src/ui-app/tests/shot-preview-fixtures.test.ts, src/ui-app/tests/shot-preview-settings-fixture.test.ts, src/ui-app/tests/storage-provider-config.test.ts, src/ui-app/tests/storage-provider.test.ts, src/ui-app/tests/task-card-review-rounds-detail.test.ts, src/ui-app/tests/ui-handoff-verification.test.ts, src/ui-app/tests/ui-verification-config.test.ts, user-docs/cli.md, user-docs/configuration.md, user-docs/review-and-close-out.md, user-docs/running-with-agents.md) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-18T17:28:03Z · body
- 2026-10-18T17:30:09Z · agent exited with an error (opencode) · error: Transport
- 2026-10-18T17:38:56Z · needs_input
- 2026-10-18T17:42:14Z · body
- 2026-10-18T17:44:41Z · body
- 2026-10-18T17:55:26Z · status active→review
- 2026-10-18T17:55:27Z · note: shots: skipped — 4 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-18T17:56:36Z · note: review pass 4: good to go
- 2026-10-18T18:03:56Z · close-out gate completed in 376s

