---
id: "1133"
title: "Agents page: replace the Default agents last-runs log with a per-agent status dot"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/agents-page-replace-the-default-agents-l
created_at: "2026-11-15T15:20:08Z"
updated_at: "2026-11-15T18:12:11Z"
handoff_signal_retry_count: 1
---
## Problem
The Default agents section of Agents > Agents now starts with a "last runs" log, added in #1098 (12 Nov) and reworked in #1123 (15 Nov). It lists rows such as CTO, debugger, engineer, pm and reviewer, each with a "finished · <timestamp>" line, plus a "Show older and other runs (14)" toggle. Nick didn't ask for it and finds it badly designed:
- A log of timestamps sits above the controls he actually uses (each agent's coding agent, model, instructions and skills).
- The engineer failure row repeats its sentence twice: "OpenCode exited with an error. Open Raw CLI error for details. (CLI: OpenCode exited with an error. Open Raw CLI error for details."
- The list repeats what the agent cards below already show.

## Desired UX
Remove the separate last-runs list from the top of Default agents. Each agent card gets a small status dot with a short label next to its name, such as "Last run 21:40" or "Failed 21:36". Tapping it shows the plain-language failure reason and the collapsed "Raw CLI error". When everything is healthy, nothing extra takes up space.

## Acceptance criteria
- The status shown for an agent reflects its *current* coding agent and model. `getAgentLastRuns` in src/core/db.ts today partitions by `agent` (role) only, so after switching the engineer from OpenCode to Codex the card can still show an OpenCode failure. Record the model on each session if it isn't stored yet. Compare the latest run's CLI and model with the agent's current config, and show a run from an older combination as "previous setup (opencode + glm-5.3-flash)" or hide it, never as the current status.
- The status dot links to the failed run's task and its log.
- The last-runs block and its "Show older and other runs" toggle are gone from the top of Default agents.
- Each default agent card (plus CTO and debugger) shows its last run status inline. The failure detail opens on demand and uses `formatAgentFailure`/`splitAgentFailureDetail` from #1123.
- The failure summary never repeats itself. Fix the formatter so the "(CLI: …)" suffix doesn't repeat the summary, and add a test with the OpenCode string above.
- Older runs remain reachable from the activity log, not from this page header.
- UI tests are updated, and the layout is checked at 1280px and at phone width.

## Notes for AI
The current list is `agentLastRuns` in src/ui-app/src/views/AgentsView.vue, fed by `GET /api/agents/last-runs` in src/server/server.ts, which reads `getAgentLastRuns()` in src/core/db.ts (ROW_NUMBER partitioned by `agent`). The failure formatting is in src/core/agent-failure.ts (`formatAgentFailure`, `splitAgentFailureDetail`) from #1123. The engineer row in Nick's 15 Nov screenshot shows the summary repeated inside the "(CLI: …)" suffix. Reproduce that with a test. Keep the endpoint backward compatible, or update every caller.

## Shots
```json
[
{
"label": "Default agents cards with inline last-run status (1280px)",
"target": "default",
"route": "/agents",
"highlight": ".agent-tab-panel:first-child .agent-head",
"state": "agents:lastRuns",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Default agents at phone width (390px)",
"target": "default",
"route": "/agents",
"highlight": ".agent-tab-panel:first-child .agent-head",
"state": "agents:lastRuns",
"viewportWidth": 390,
"viewportHeight": 844
}
]
```

## Activity

- 2026-11-15T15:20:08Z · created · t@t
- 2026-11-15T15:20:10Z · needs_input
- 2026-11-15T15:25:58Z · needs_input, body: Acceptance criteria (added 2); Notes for AI (added)
- 2026-11-15T16:09:46Z · status inbox→ready
- 2026-11-15T16:09:48Z · status ready→active, branch
- 2026-11-15T16:44:07Z · message_queued at 2026-11-15T16:44:07.158Z
- 2026-11-15T16:44:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T16:44:30Z · body
- 2026-11-15T16:47:16Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T16:47:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now I have a clear picture. Let me implement the core status helpers. · stderr: (empty)
- 2026-11-15T16:47:32Z · message_delivered: 1 message(s)
- 2026-11-15T16:48:44Z · body
- 2026-11-15T16:49:07Z · message_queued at 2026-11-15T16:49:07.706Z
- 2026-11-15T16:49:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T16:50:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T16:52:16Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T16:52:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now I have a clear picture. Let me implement the core status helpers. · stderr: (empty)
- 2026-11-15T16:52:16Z · message_delivered: 1 message(s)
- 2026-11-15T16:54:06Z · message_queued at 2026-11-15T16:54:06.968Z
- 2026-11-15T16:54:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T16:56:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T16:57:19Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T16:57:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now I have a clear picture. Let me implement the core status helpers. · stderr: (empty)
- 2026-11-15T16:57:20Z · message_delivered: 1 message(s)
- 2026-11-15T16:57:38Z · body
- 2026-11-15T16:58:03Z · message_queued at 2026-11-15T16:58:03.680Z
- 2026-11-15T16:58:04Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T16:58:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:01:22Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:01:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: I found one more nesting case in the formatter that matches the exact screenshot shape. Let me fix it and test it. · stderr: (empty)
- 2026-11-15T17:01:22Z · message_delivered: 1 message(s)
- 2026-11-15T17:02:39Z · message_queued at 2026-11-15T17:02:39.339Z
- 2026-11-15T17:02:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:04:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:05:39Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:05:39Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: I found one more nesting case in the formatter that matches the exact screenshot shape. Let me fix it and test it. · stderr: (empty)
- 2026-11-15T17:05:39Z · message_delivered: 1 message(s)
- 2026-11-15T17:06:58Z · body
- 2026-11-15T17:09:06Z · CTO nudge: held — handoff gate is running
- 2026-11-15T17:18:54Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-15T17:18:54Z · message_queued at 2026-11-15T17:18:54.808Z
- 2026-11-15T17:19:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:22:09Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-15T17:27:12Z · message_queued at 2026-11-15T17:27:12.638Z
- 2026-11-15T17:32:09Z · message_delivered: 1 message(s)
- 2026-11-15T17:33:39Z · body
- 2026-11-15T17:35:09Z · queued message undelivered for 8m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:35:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: I found one more nesting case in the formatter that matches the exact screenshot shape. Let me fix it and test it. · stderr: (empty)
- 2026-11-15T17:37:09Z · message_delivered: 1 message(s)
- 2026-11-15T17:39:07Z · message_queued at 2026-11-15T17:39:07.264Z
- 2026-11-15T17:39:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:42:52Z · body
- 2026-11-15T17:44:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:44:24Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:44:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The captured shots show the old block is gone but no status dots, because the preview board has no recent runs. I'll add a deterministic preview fixture so the review shots actually demonstrate the new inline status. · stderr: (empty)
- 2026-11-15T17:49:10Z · message_delivered: 1 message(s)
- 2026-11-15T17:54:07Z · message_queued at 2026-11-15T17:54:07.419Z
- 2026-11-15T17:54:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:57:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:57:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The captured shots show the old block is gone but no status dots, because the preview board has no recent runs. I'll add a deterministic preview fixture so the review shots actually demonstrate the new inline status. · stderr: (empty)
- 2026-11-15T17:57:10Z · message_delivered: 1 message(s)
- 2026-11-15T17:59:07Z · message_queued at 2026-11-15T17:59:07.286Z
- 2026-11-15T17:59:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:02:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:02:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The captured shots show the old block is gone but no status dots, because the preview board has no recent runs. I'll add a deterministic preview fixture so the review shots actually demonstrate the new inline status. · stderr: (empty)
- 2026-11-15T18:02:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:03:19Z · message_queued at 2026-11-15T18:03:19.237Z
- 2026-11-15T18:03:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:04:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:06:40Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:06:40Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The earlier local check run timed out while waiting on the remote validation runner. I'll re-run it in the background and monitor the log rather than blocking the turn. · stderr: (empty)
- 2026-11-15T18:08:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:09:07Z · message_queued at 2026-11-15T18:09:07.331Z
- 2026-11-15T18:09:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:09:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:12:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:12:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: The earlier local check run timed out while waiting on the remote validation runner. I'll re-run it in the background and monitor the log rather than blocking the turn. · stderr: (empty)
- 2026-11-15T18:12:11Z · message_delivered: 1 message(s)
