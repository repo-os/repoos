---
id: "1098"
title: "Surface why an agent failed (expired auth, unavailable model) on the task card and in a notification, not only in the activity log"
type: feature
status: active
priority: p2
area: [web, server, core]
assigned_to: ai
created_by: t@t
branch: feat/surface-why-an-agent-failed-expired-auth
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-12T05:35:20Z"
updated_at: "2026-11-12T14:30:57Z"
review_passes: 1
handoff_signal_retry_count: 1
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
"label": "Task card with agent failure explanation",
"target": "default",
"route": "/work?task=1098&tab=changes",
"highlight": "[data-task-id=\"1098\"]",
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
