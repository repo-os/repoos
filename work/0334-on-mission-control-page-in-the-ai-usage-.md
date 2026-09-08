---
id: "0334"
title: Add date range selector to Mission Control AI usage panel
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-date-range-selector-to-mission-contr
created_at: "2026-09-08T04:38:46Z"
updated_at: "2026-09-08T04:44:35Z"
---
## Problem

The Mission Control page's "AI usage — all roles" panel always shows usage aggregated over the entire history of the board. There is no way to see recent activity — what was spent today, this week, or this month — without manually reading and summing the per-day table. As history accumulates, the headline totals become less and less useful for day-to-day questions.

## Desired UX

- In the AI usage panel on Mission Control, a compact date-range selector appears near the "AI usage — all roles" header with exactly four options: **1 day**, **1 week**, **1 month**, **all time**.
- Selecting a range refetches the usage stats and updates the whole panel: the headline totals (time / tokens / cost), the per-role breakdown, and the per-day table all reflect only sessions started within the selected range.
- The panel defaults to **all time** on load, which matches today's behavior exactly.
- The selector matches the panel's existing compact monospace styling; cost-source labeling (USD / `est` / credits / `mixed`) keeps working unchanged for any range.

## Acceptance criteria

- [ ] A range selector with the four options (1 day, 1 week, 1 month, all time) is visible in the AI usage panel on Mission Control.
- [ ] Choosing a range refetches usage scoped to that range and re-renders headline totals, the by-role table, and the by-day table consistently (they agree with each other).
- [ ] "All time" reproduces today's unfiltered numbers exactly — no regression.
- [ ] An empty range (e.g. no sessions in the last day) shows the panel's existing empty state, not an error.
- [ ] Loading and error states (including the Retry button) still behave correctly when switching ranges.
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test).

## Notes for AI

- Relevant code:
  - UI: `src/ui-app/src/components/UsagePanel.vue` (the panel; the "AI usage — all roles" header is the natural home for the selector), rendered by `src/ui-app/src/views/DashboardView.vue`.
  - Store: `loadBoardUsage()` in `src/ui-app/src/stores/repo.ts` (~line 1724) calls `GET /api/stats/board`; types in `src/ui-app/src/types.ts` (`BoardUsageStats` ~line 367).
  - Server: `getBoardStats` handler in `src/server/routes/tasks.ts` (~line 1330), route registered in `src/server/server.ts` (~line 1696).
  - Data: `RepoOSDb.getBoardStats()` in `src/core/db.ts` (~line 749), which composes `getSessionTypeStats()` (roles) and `getDailyTotals()` (days).
- Recommended approach: thread a range param end-to-end (e.g. `GET /api/stats/board?range=1d|7d|30d|all`, defaulting to `all`) and filter the SQL on `sessions.startedAt` — that column is NOT NULL ISO text and already indexed (`idx_sessions_startedAt`, `src/core/db.ts` ~line 100). Client-side filtering is NOT viable: the endpoint returns pre-aggregated totals, not raw sessions. `getDailyTotals()` and `getSessionTypeStats()` need the same filter so the tables agree with the headline numbers.
- Assumptions (user didn't specify; pick these unless told otherwise): "1 day" = trailing 24 hours, "1 week" = trailing 7 days, "1 month" = trailing 30 days; boundaries computed server-side using server local time, consistent with the existing per-day table. Default selection is "all time" so current behavior is preserved.
- The selected range does not need to persist across reloads.
- Constraints: zero runtime dependencies — the selector is plain buttons/toggle styled like the rest of the panel. After any UI change, rebuild (`bun run build:ui`).

## Scope

- Covers: the range selector and server-side range filtering for the Mission Control AI usage panel only.
- Deferred: custom/arbitrary date pickers, separate per-role or per-day range selectors, usage displays on other pages (e.g. Agents view), persisting the selection, and any charting/graphing.

## Related

- `0230` — board-level usage rollup and cost-source labeling this panel builds on.

## Original prompt

On mission control  page in the AI usage section add a date range selector for the data to show: 1 day, 1 week, 1 month, all time

## Activity

- 2026-09-08T04:38:46Z · created · hello@repoos.org
- 2026-09-08T04:41:00Z · status draft→inbox, title, area, body
- 2026-09-08T04:44:23Z · status inbox→ready
- 2026-09-08T04:44:35Z · status ready→active, branch
