---
id: "0230"
title: "Unify AI usage telemetry (time, tokens, cost) across all roles"
type: feature
status: inbox
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-16T12:09:54Z"
updated_at: "2026-08-16T12:09:54Z"
---
## Problem

Telemetry today is only reliable for engineer sessions. PM chats are persisted
under chat session IDs instead of the real task IDs they belong to, reviewer
sessions are stored with zero elapsed time and no token/cost data at all, and
CTO runs are not persisted to telemetry whatsoever. As a result, aggregated
usage is wrong or missing for every role except the engineer: PM cost totals,
reviewer time, and CTO cost/tokens either don't exist or can't be attributed to
the tasks they were spent on.

This blocks the core promise of "anything that uses AI, for time, cost, and
tokens": per-role totals, per-task totals, and per-day totals cannot be
computed because the underlying sessions are missing, mis-attributed, or lack
duration and usage data.

## Desired UX

- Every role session — engineer, PM, reviewer, CTO, Ross/guide, and any other
  role the CLI exposes usage for — is captured with the same shape: wall-clock
  elapsed time, input/output/total tokens, and cost.
- Sessions that are task-specific are associated with the real task ID,
  including PM and reviewer follow-up turns.
- All completed, failed, and cancelled sessions are persisted in
  `.repoos/repoos.db` so durable totals survive server restarts. Live telemetry
  survives normal UI refreshes (the server is the source of truth, not page
  state).
- The control panel surfaces high-level metrics: per-role totals (e.g. "PM cost
  total", "engineer cost total", "CTO cost total"), per-day totals, and an
  overall total, across time, tokens, and cost.
- Each task shows its own task-specific metrics: total elapsed time, tokens,
  and cost, plus a role breakdown, in a compact treatment in the task drawer.
- Board-level totals appear where they fit naturally so a whole board's AI usage
  is visible at a glance.

## Acceptance criteria

- [ ] `repoos check` passes with no console errors.
- [ ] Engineer, PM, reviewer, CTO, Ross/guide, and other supported roles record
      wall-clock elapsed time, input/output/total tokens, and cost for every
      session where the CLI exposes usage.
- [ ] Task-specific sessions (including PM and reviewer follow-ups) are
      attributed to the real task ID; PM sessions are no longer stored under
      bare chat session IDs.
- [ ] Reviewer sessions persist nonzero elapsed time and token/cost data.
- [ ] CTO runs are persisted to telemetry.
- [ ] All completed, failed, and cancelled sessions are persisted in
      `.repoos/repoos.db`; if SQLite is unavailable the existing graceful
      fallback is preserved.
- [ ] Authoritative CLI-reported usage/cost is used when available; estimates
      are clearly labeled, and Kiro credits are never presented as USD.
- [ ] Task totals include every associated role/session and expose role-level
      breakdowns.
- [ ] The task drawer shows a compact usage treatment: total elapsed time,
      tokens, cost, and a role breakdown.
- [ ] Board-level totals are exposed where they fit naturally.
- [ ] Live telemetry survives normal UI refreshes; durable totals survive
      server restarts.
- [ ] Tests cover: role-to-task attribution, aggregation, zero/unknown usage,
      failed turns, and no-SQLite fallback.

## Notes for AI

- "Supported roles" means every role the CLI exposes usage for; capture is
  driven by the role, not hardcoded per-role in the UI.
- Per-day totals should group sessions by day using the server's local time;
  call this out in the UI if it matters.
- Do not invent new cost sources: cost/token figures must come from
  authoritative CLI-reported usage when present. Where an estimate is used
  (e.g. Kiro credits), label it as such and keep it distinct from USD.
- Preserve the existing no-SQLite behavior — persistence must degrade
  gracefully, not crash.
- Persistence shape change affects existing PM/reviewer/CTO session records;
  the store layer is the place to unify the schema, and aggregation must not
  double-count sessions that were previously mis-attributed under chat session
  IDs.
- The server owns live telemetry; the UI should read it from the server so
  refreshes don't drop it.
- After any UI change, rebuild (`bun run build:ui` or `bun run build`) and
  verify with a browser probe before reporting done.

## Scope

Covers end-to-end capture, attribution, persistence, aggregation, and UI
surfacing for time/tokens/cost across all roles. Deferred: any change to how
the CLI reports usage/cost itself, and any non-telemetry billing/invoicing
features.
</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>

## Activity

- 2026-08-16T12:09:54Z · created · unknown
