---
id: "1098"
title: "Surface why an agent failed (expired auth, unavailable model) on the task card and in a notification, not only in the activity log"
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: `needs some work` — Feature code matches the spec; close-out is blocked until foreign `work/*` bookkeeping is healed off the branch tip.
priority: p2
area: [web, server, core]
assigned_to: ai
created_by: t@t
branch: feat/surface-why-an-agent-failed-expired-auth
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-12T05:35:20Z"
updated_at: "2026-11-12T18:56:26Z"
review_passes: 4
review_rounds: 2
last_check_failure: "repoos check at 2026-11-12T16:42:50.789Z: repoos check failed: tests — tests/pre-review-remote-gate.test.ts > standalone `repoos check` remote failure (#0520) > exits non-zero AND records the failure for the Checks surface when the runner is unusable — at tests/pre-review-remote-gate.test.ts:486:26 — AssertionError: expected +0 to be 1 // Object.is equality"
handoff_signal_retry_count: 2
close_out_repair_count: 1
---
## Problem
When an agent run fails, the reason is usually an expired login (Cursor, Claude, Copilot) or an unavailable model, but it only appears as one line in the task's activity log (for example 'agent exited with an error (cursor) · Cannot use this model: composer-2.5' on #1097), or as a terse crash-recovery note after the task has already been switched to another agent. A human watching the board sees a task that stalls or silently changes agent and has to dig for why. Cursor was unauthenticated for hours before anyone noticed.

## Desired UX
- When an engineer, reviewer, PM or debugger run fails, the task card and drawer show a short plain-English reason with the fix: 'Cursor is signed out. Re-authenticate Cursor on this computer', 'Model composer-2.5 is not available for this account', 'Claude usage limit reached until 14:00', with the raw CLI error behind a disclosure.
- Auth and model-availability failures raise one board-level notice per agent (not per task), cleared when a later run of that agent succeeds, so a signed-out agent is visible immediately.
- Crash recovery that switches a task to a different agent says why in the same plain language and links to the notice.

## Acceptance criteria
- A classifier maps known CLI error text (auth expired or signed out, model unavailable, usage limit, network unreachable) for each supported CLI to a reason id and a fix sentence; unknown errors fall back to the raw tail.
- The task card shows the reason on an agent failure; a board notice appears once per agent and clears on the next success. Reuse the existing bell or notice mechanism.
- The Agents page shows each agent's last-run status with the reason.
- Crash-recovery agent switches record the plain-English reason, not only the raw error.
- Tests: the classifier table for each CLI (include the Copilot auto-tier error and Cursor 'Cannot use this model'), notice dedupe and clearing, no network in tests.
- Docs: a short note in user-docs/agents.md. No new runtime dependencies; Settings UI rule does not apply unless a toml key is added.

## Notes for AI
Related code: src/core/copilot-auto-tier.ts and enrichAgentFailureDetail in src/server/agents.ts (the Copilot enrichment from #1088 is the pattern to generalise), the crash-recovery switch in the engineer runner (search for 'engineer crash recovery'), and the existing release or bell notice code for one-per-key notices. Keep the raw error available.

## Shots
```json
[
{
"label": "Task card with plain-language agent failure and Raw CLI error disclosure",
"target": "default",
"route": "/work",
"highlight": "[data-task-id=\"9999\"] .tc-needs-detail",
"state": "card:agentFailed"
}
]
```

## Activity

- 2026-11-12T05:35:20Z · created · t@t
- 2026-11-12T12:17:15Z · cli_override, model_override
- 2026-11-12T12:17:17Z · status inbox→ready
- 2026-11-12T12:17:18Z · status ready→active, branch
- 2026-11-12T12:27:03Z · body
- 2026-11-12T12:38:30Z · body
- 2026-11-12T12:38:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I didn’t complete task #1098, so I’m not requesting handoff. The classifier, failure formatting, crash-recovery wording, docs note, and report draft are in the worktree. The first check found formatting issues; I formatted the files and re… · stderr: Reading additional input from stdin... 2026-11-12T12:38:24.056800Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 31630
- 2026-11-12T13:19:48Z · message_queued at 2026-11-12T13:19:48.193Z
- 2026-11-12T13:19:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T13:24:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T13:39:02Z · body
- 2026-11-12T13:43:10Z · CTO nudge: held — handoff gate is running
- 2026-11-12T13:45:12Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-12T13:45:13Z · status active→review
- 2026-11-12T13:45:13Z · message_queued at 2026-11-12T13:45:13.131Z
- 2026-11-12T13:46:25Z · note: review pass 1: good to go
- 2026-11-12T14:30:57Z · status review→active
- 2026-11-12T14:30:57Z · note: close-out repair: merge-conflict
- 2026-11-12T14:30:57Z · message_delivered: 1 message(s)
- 2026-11-12T14:49:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T14:59:02Z · message_queued at 2026-11-12T14:59:02.326Z
- 2026-11-12T14:59:05Z · message_delivered: 1 message(s)
- 2026-11-12T15:14:48Z · message_queued at 2026-11-12T15:14:48.449Z
- 2026-11-12T15:14:48Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-12T15:16:52Z · body
- 2026-11-12T15:19:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T15:29:28Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-12T15:29:28Z · message_queued at 2026-11-12T15:29:28.361Z
- 2026-11-12T15:29:48Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T15:34:49Z · message_delivered: 1 message(s)
- 2026-11-12T15:34:50Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-12T15:51:18Z · body
- 2026-11-12T15:54:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T16:04:30Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-12T16:04:31Z · status active→review
- 2026-11-12T16:04:31Z · message_queued at 2026-11-12T16:04:31.519Z
- 2026-11-12T16:06:28Z · note: review pass 2: needs some work
- 2026-11-12T16:06:28Z · message_delivered: 1 message(s)
- 2026-11-12T16:06:28Z · status review→active
- 2026-11-12T16:06:30Z · CTO nudge: held — remote validation is running
- 2026-11-12T16:32:43Z · CTO nudge: held — handoff gate is running
- 2026-11-12T16:42:47Z · message_queued at 2026-11-12T16:42:47.421Z
- 2026-11-12T16:42:50Z · message_delivered: 1 message(s)
- 2026-11-12T16:53:42Z · body
- 2026-11-12T16:54:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T17:07:36Z · status active→review
- 2026-11-12T17:07:37Z · message_queued at 2026-11-12T17:07:37.000Z
- 2026-11-12T17:08:12Z · note: review pass 3: needs some work
- 2026-11-12T17:08:12Z · message_delivered: 1 message(s)
- 2026-11-12T17:08:12Z · status review→active
- 2026-11-12T17:08:14Z · CTO nudge: held — remote validation is running
- 2026-11-12T17:09:48Z · CTO nudge: held — handoff gate is running
- 2026-11-12T17:24:55Z · CTO nudge: held — handoff gate is running
- 2026-11-12T17:39:46Z · handoff failed · remote validation failed: test failure: tests/pressure-guard.test.ts > waitForPressureRelief > waits until a fake probe reports relief, then proceeds on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-12T17:39:46Z · message_queued at 2026-11-12T17:39:46.548Z
- 2026-11-12T17:39:46Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-12T17:39:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T17:44:56Z · message_delivered: 1 message(s)
- 2026-11-12T17:44:57Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-11-12T18:08:28Z · body
- 2026-11-12T18:09:57Z · status active→review
- 2026-11-12T18:19:05Z · handoff failed · remote validation failed: test failure: gate exit 1 on mini — fix it in the feature branch and re-run the gate
- 2026-11-12T18:19:05Z · message_queued at 2026-11-12T18:19:05.540Z
- 2026-11-12T18:19:06Z · note: review pass 4: needs some work
- 2026-11-12T18:19:06Z · needs_input
- 2026-11-12T18:42:58Z · status review→active
- 2026-11-12T18:43:00Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-12T18:43:37Z · body
- 2026-11-12T18:43:49Z · note: handoff requested (cli)
- 2026-11-12T18:44:55Z · CTO nudge: held — handoff gate is running
- 2026-11-12T18:56:25Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-12T18:56:26Z · status active→review
- 2026-11-12T18:56:26Z · message_queued at 2026-11-12T18:56:26.179Z
