---
id: "1123"
title: "Agents page: raw CLI errors leak into the Default agents last-runs list; classify more failures and hide stale rows"
type: feature
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: t@t
branch: feat/agents-page-raw-cli-errors-leak-into-the
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-14T18:02:14Z"
updated_at: "2026-11-14T19:11:55Z"
---
## Problem
On Agents > Agents > Default agents, the "last runs" list (`agentLastRuns` in src/ui-app/src/views/AgentsView.vue, from `GET /api/agents/last-runs` in src/server/server.ts) prints raw CLI output as if it were the message. Seen 2026-11-15 (screenshot attached): the debugger row shows "opencode exited with code 1: > build · deepseek-ai/DeepSeek-V4.1-Flash Error: You need positive balance to do inference. Please add balance manually or setup top-up", and the antigravity rows show a full `AGY_ERROR: {"short_error":"RESOURCE_EXHAUSTED (code 429)...` JSON blob. Only one row (opencode kimi) got the new treatment from #1098: a plain sentence plus a collapsed "Raw CLI error" disclosure.
Cause: `formatAgentFailure` in src/core/agent-failure.ts only recognises four classes (auth, model unavailable, usage limit, network). Anything else is returned verbatim and shown as the summary. "You need positive balance" (out of credit) and "Individual quota reached / RESOURCE_EXHAUSTED / 429" match none of the patterns (LIMIT only knows "usage limit", "rate limit", "quota exceeded", "out of usage", "too many requests").
The list also shows stale and unrelated rows: antigravity runs from 29/10, "Decision check (openrouter)", "Model router (jev/none/openrouter)", "design", "docs-debt" from September. They read as current problems.

## Desired UX
Each failed row says in one plain sentence what is wrong and what to do ("DeepInfra is out of credit. Add balance, or pick another model."), with the raw CLI text only behind the "Raw CLI error" disclosure. Rows that are not a current default agent, or are older than a sensible window, are hidden or collapsed so the list shows what needs attention now.

## Acceptance criteria
1. Add classes to `classifyAgentFailure` (table-driven tests with the real strings above): out of credit / balance ("You need positive balance", "insufficient credit/balance", "payment required", HTTP 402), and quota or rate exhaustion ("Individual quota reached", "RESOURCE_EXHAUSTED", HTTP 429, "usage limit" variants including a reset time when the text has one, such as "Resets in 95h12m41s"). Keep the existing classes and the Copilot Auto tier case.
2. A generic fallback for everything else: summary "<CLI name> exited with an error." (or the first short line when it is under about 120 characters and free of JSON, stack or ANSI), fix "Open Raw CLI error for details.", and the full text behind the disclosure. Never print a multi-line or JSON blob as the summary anywhere that uses `formatAgentFailure`/`splitAgentFailureDetail` (Agents page, task cards, drawer, notifications); strip ANSI and cap the raw text length.
3. Apply the classification to rows already stored: the formatting runs at read time in `/api/agents/last-runs`, so old rows get it too; no migration of stored reasons.
4. Last-runs list: show only agents that exist in the current config (default agents, CTO, debugger, built-ins) and runs from the last 14 days; hide the rest, with a small "Show older and other runs" toggle. Rows for the model router and decision checks are shown under their own label or hidden by default, not mixed into the default-agent list.
5. Tests: classifier table, the fallback (JSON blob, multi-line, ANSI), the endpoint output for a stored raw reason, and the view hiding stale or unknown rows; the contrast audit passes.
6. Docs: one line in user-docs for the Agents page; `repoos check` passes.

## Notes for AI
Build on #1098 (src/core/agent-failure.ts, `splitAgentFailureDetail`). Related: the DeepInfra "No credits" pause in repoos.toml; do not change allowlist or budget settings.

## Shots
```json
[
{
"label": "Default agents tab with last-runs filtering",
"target": "default",
"route": "/agents?tab=default",
"highlight": ".agent-tab-panel .sec-label"
}
]
```

## Screenshots

![60](/api/tasks/1123/attachments/att_9eea76a8-84c2-4c20-b6f8-7cf14184b2db.webp)

## Activity

- 2026-11-14T18:02:14Z · created · t@t
- 2026-11-14T18:02:15Z · screenshots
- 2026-11-14T18:02:28Z · cli_override, model_override
- 2026-11-14T18:02:32Z · status inbox→ready
- 2026-11-14T18:44:56Z · status ready→active, branch
- 2026-11-14T18:53:53Z · message_queued at 2026-11-14T18:53:53.155Z
- 2026-11-14T18:53:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T18:56:54Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T18:56:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Implementing core failure classification, last-runs filtering, UI toggle, tests, and docs. · stderr: (empty)
- 2026-11-14T18:56:55Z · message_delivered: 1 message(s)
- 2026-11-14T18:58:53Z · message_queued at 2026-11-14T18:58:53.076Z
- 2026-11-14T18:58:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T19:01:55Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T19:01:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Implementing core failure classification, last-runs filtering, UI toggle, tests, and docs. · stderr: (empty)
- 2026-11-14T19:01:55Z · message_delivered: 1 message(s)
- 2026-11-14T19:03:53Z · message_queued at 2026-11-14T19:03:53.269Z
- 2026-11-14T19:03:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T19:06:55Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T19:06:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Implementing core failure classification, last-runs filtering, UI toggle, tests, and docs. · stderr: (empty)
- 2026-11-14T19:06:55Z · message_delivered: 1 message(s)
- 2026-11-14T19:07:43Z · body
- 2026-11-14T19:08:53Z · message_queued at 2026-11-14T19:08:53.084Z
- 2026-11-14T19:08:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T19:11:55Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
