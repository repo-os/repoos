---
id: "0223"
title: Work-queue board fetches full task bodies for every task on every load
type: bug
status: review
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/work-queue-board-fetches-full-task-bodie
model_override: default
pm_model_override: default
created_at: "2026-08-15T10:04:18Z"
updated_at: "2026-08-15T20:28:07Z"
review_rounds: 1
---
## Problem

`/api/index` returns full `Task` objects for every task — body, activity log, all frontmatter — to render a board that only needs id, title, status, priority, type, area. At 202 tasks this is 961 KB per fetch. It is also the single largest payload the app transfers, fetched on every page load and on every SSE reconnect.

Measured live in-browser (2026-08-15): 963 KB for one `/api/index` call, `totalTransferKb: 1581` for the whole page load. A per-task cost of ~4.8 KB × 202 tasks.

This is very likely the cause of a separate observation: the web UI has "slowed considerably as the number of tasks has grown" and startup can take 20+ seconds. The startup path was also independently found to fetch `/api/index` twice on load ([#0205](0205)'s close-out surfaced this; fixed in `a6478d1b` — halved the transfer but did not touch the size).

## Desired UX

The work-queue board loads quickly regardless of task count, and does not visibly re-fetch or stall as the number of tasks grows.

## Acceptance criteria

- [ ] `/api/index` (or a new lighter endpoint the board uses) returns only what the board needs to render cards — id, title, status, priority, type, area, and whatever else `TaskCard.vue` actually reads — not full body/activity
- [ ] Full task detail (body, activity log) is fetched on demand when a task is opened in the drawer, not eagerly for all 200+ tasks
- [ ] Measured payload size at current task count drops substantially from the current ~960 KB baseline
- [ ] No regression in board responsiveness to live updates (SSE-driven card changes still work without a full re-fetch)

## Notes for AI

- Reproduce the baseline first: open the app, capture `performance.getEntriesByType('resource')` for `/api/index`, confirm the transfer size.
- Server-side: `src/server/live-index.ts` and wherever `/api/index` is served in `src/server/server.ts` / `routes/`.
- Client-side: `src/ui-app/src/stores/repo.ts` (`refresh()`), `src/ui-app/src/types.ts` (`Task` / `RepoIndex`).
- Check whether the SSE event stream already carries enough detail to avoid needing a full-body index at all for the board view.
- Related: `docs/dogfooding-vs-general.md` (self-hosting-scale symptom, not present at typical customer task counts — but real and worth fixing since RepoOS eats its own dogfood at 200+ tasks).

## Activity

- 2026-08-15T10:04:18Z · created · unknown
- 2026-08-15T10:06:31Z · model_override
- 2026-08-15T12:20:51Z · pm_model_override
- 2026-08-15T12:21:16Z · model_override
- 2026-08-15T12:21:25Z · status ready→active, branch
- 2026-08-15T13:02:18Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T13:02:18Z · status review→active
- 2026-08-15T13:27:32Z · model_override
- 2026-08-15T16:55:03Z · status active→review
- 2026-08-15T19:15:28Z · pm_cli_override
- 2026-08-15T19:15:28Z · pm_cli_override, pm_model_override
- 2026-08-15T19:15:57Z · pm_model_override
- 2026-08-15T19:53:11Z · model_override
- 2026-08-15T19:53:17Z · status review→active
- 2026-08-15T20:03:38Z · status active→review
- 2026-08-15T20:28:07Z · model_override
