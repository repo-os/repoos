---
id: "0331"
title: "Mission Control AI usage: track every AI role (Ross, CTO, debugger, dispatch)"
type: feature
status: done
priority: p2
area: server
assigned_to: ai
created_by: hello@repoos.org
branch: feat/mission-control-ai-usage-track-every-ai-
created_at: "2026-09-07T08:31:24Z"
updated_at: "2026-09-07T10:06:06Z"
---
Mission Control's "AI usage — all roles" panel only shows some roles. Playground sessions appear, but Ross (the repo guide), the CTO monitor, and other non-task AI invocations are missing or misclassified. Every AI agent that burns tokens should be visible there, not just task-scoped engineer/reviewer sessions.

## Where the data comes from

- Panel: `UsagePanel.vue` (rendered by `DashboardView.vue`) reads `/api/stats/board` → `getSessionTypeStats()` (`src/core/db.ts:626`), which groups the `sessions` table by `sessionType` and drops nothing — a role appears iff at least one session row carries its sessionType.
- Three recording paths, all must be covered:
  1. Task runner sessions — `AgentRunner.recordSessionToDb` (`src/server/agents.ts:3904`), sessionType classified from agent name (agents.ts:3913-3921).
  2. One-shot sessions — `recordOneShotSession` with explicit sessionType: playground, pm (docs/inputs/task-create), dispatch (auto-engineering).
  3. CTO monitor — `CTOMonitor.recordRun` (`src/server/cto.ts:559`) writes sessionType "cto".

## Suspected root causes to verify first

- **Ross is misclassified, not absent:** the classifier checks `agentName.includes("repoos")` FIRST (agents.ts:3915), so a guide configured under the legacy name "repoos guide" is swallowed into "engineer" before the `includes("ross") || includes("guide")` branch (3918) can fire. Reorder the checks / prefer exact matches.
- **Ross chat recording path:** Ross runs through `startChat`/`send` on the shared runner keyed as "repoos-guide" (`src/server/routes/info.ts:160`). Verify `recordSessionToDb` fires for chat-style sessions and that multi-turn chats accumulate into one record rather than only recording on task exits.
- **CTO runs actually recording:** `recordRun` exists and the monitor gets the db (cto.ts:150), but confirm it is invoked on every monitor pass and that elapsedMs/usage are populated — the panel's `visibleRoles` filter (UsagePanel.vue:42-46) hides rows with zero sessions/cost/time, so an empty row reads as "missing".

## What to build

1. Fix sessionType classification so every built-in role lands on its own label: engineer, reviewer, pm, guide (Ross), cto, tech-debt, debugger, dispatch, playground, task, chat. Exact-match known names before falling back to `includes`.
2. Ensure every server-initiated AI invocation records a session row: Ross chats (multi-turn accumulate), CTO monitor passes, debugger sessions, PM one-shots. Invariant: nothing spawns an agent without a sessionType.
3. No changes needed in UsagePanel itself if 1-2 are right — the panel already renders whatever roles exist. Keep the zero-usage filter; rows with no activity are noise.

## Acceptance criteria

- Chat with Ross → Mission Control shows a "guide" row with its tokens/cost/time.
- Trigger a CTO monitoring pass → "cto" row appears.
- A legacy "repoos guide" agent name no longer shows up under "engineer".
- Playground, PM, dispatch rows unchanged (they already work — regression guard).
- Unit tests: classification table (all agent names → expected sessionType), Ross chat records a session, CTO recordRun writes a row.

## Notes

- The task drawer's per-task usage table (TaskDrawer.vue:3521+) renders roles too, so the fix benefits both surfaces.
- Non-task roles record `taskId: null` — they appear on the board panel only, not in any task's drawer. That is correct behavior, not a bug.

## Original prompt

In mission control AI usage all roles let's also show Ross, CTO, and others (every AI agent should be tracked, not just those within tasks etc) . e.g. now I see "playground" is tracked which is good, but some are still missing like Ross and CTO

## Activity

- 2026-09-07T08:31:24Z · created · hello@repoos.org
- 2026-09-07T08:55:27Z · title, area, body
- 2026-09-07T08:55:28Z · status draft→inbox
- 2026-09-07T08:55:28Z · note: Fleshed out by PM: recording paths, suspected root causes (Ross misclassified as engineer via includes('repoos'), CTO recordRun verification), what to build, acceptance criteria.
- 2026-09-07T09:11:11Z · status inbox→ready
- 2026-09-07T09:11:20Z · status ready→active, branch
- 2026-09-07T09:38:37Z · status active→review
- 2026-09-07T10:06:06Z · status review→done, release:success
