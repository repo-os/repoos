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
updated_at: "2026-11-15T16:56:50Z"
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
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Default agents at phone width (390px)",
"target": "default",
"route": "/agents",
"highlight": ".agent-tab-panel:first-child .agent-head",
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
