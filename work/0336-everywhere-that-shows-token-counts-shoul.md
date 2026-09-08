---
id: "0336"
title: Show token counts in millions with time-only session timestamps
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-08T12:45:50Z"
updated_at: "2026-09-08T12:51:26Z"
---
## Problem

Token counts across the UI are compacted in thousands (`k`/`K`), which reads poorly now that agent sessions routinely burn millions of tokens — `1,842k` is harder to parse than `1.842M`. Formatters using the k shorthand exist in several places, so the fix must cover all of them, not just one component.

Separately, in the task panel's tokens tab, the per-session table's **started** and **ended** columns always render the date plus time (e.g. "Aug 20, 3:14 PM"). The date is noise for the common case of scanning today's sessions, and it makes the columns wider than they need to be.

## Desired UX

- Every token count shown in the UI is rendered in millions with 3 decimal places (e.g. `1.842M`, `0.013M`) instead of the k/`K` shorthand.
- In the task drawer's tokens tab, the session table's started/ended columns show **only the time** by default (local time, not UTC).
- Clicking the started or ended columns (the column header, as the toggle) expands those columns to show both date and time; clicking again collapses back to time-only. The same local-time rule applies in both states.

## Acceptance criteria

- [ ] All token-count displays use `X.XXXM` formatting instead of `k`/`K`, everywhere tokens appear: task drawer tokens tab (totals, per-role table, per-session table, cache-hover tooltip), the usage panel, and the model playground token-cost filter
- [ ] Tokens tab session table shows time-only for started/ended by default, in local time
- [ ] Clicking the started/ended column header expands to show date + time (still local time); clicking again collapses to time-only
- [ ] Missing/unreported values still render as `—` exactly as before
- [ ] The expand state behaves sensibly with the table's existing click-to-expand affordances (e.g. doesn't conflict with the agent/model column toggle)

## Notes for AI

- Token formatters to touch (all are duplicated local functions, not shared):
  - `fmtTokens` in `src/ui-app/src/components/TaskDrawer.vue` (currently: `842` / `12.3k` / `1.2M`)
  - `fmtTokens` in `src/ui-app/src/components/UsagePanel.vue` (same k logic)
  - the `K` shorthand in `src/ui-app/src/components/ModelPlaygroundPanel.vue` (token-cost filter)
- Consider consolidating the duplicated token formatters into one shared helper (e.g. `src/ui-app/src/lib/`) so this can't drift again — but keep it UI-internal.
- Timestamps: `fmtSessionTime` in `TaskDrawer.vue` already uses `toLocaleString` (local time) with month/day + hour/minute. Change the default to time-only and add the date on expand. Keep using `toLocale*` with explicit options — never manual UTC math.
- For the click-to-expand, follow the existing `sessionAgentsExpanded` / `toggleSessionAgentExpand()` pattern on the agent/model column in the same table — it's the established affordance here.
- Assumption (stated, not invented): counts below the compact threshold may stay as raw integers (e.g. `842`) since `0.001M` is unreadable and loses precision; everything that is currently k-compacted becomes `X.XXXM`. If you instead render all values in M, note that `0.000M` for small counts is acceptable to the user.
- Assumption: the expand toggle applies to started and ended together (one click toggles both columns), matching the single-toggle pattern of the agent/model column. A per-column toggle is also acceptable.
- Do not change the raw token counts shown in hover tooltips' underlying data or the API payloads — display-only change.
- `fmtCount` in `SystemResourcePanel.vue` is for files/worktrees/LOC, not tokens — leave it alone.

## Scope

Covers: token-count display formatting UI-wide, and the tokens-tab session table's started/ended time presentation. Defers: any change to what token data is collected or served, cost/currency formatting, elapsed-time (`fmtElapsed`) formatting, and any other panel's non-token count formatting.

## Related

- Task #0230 introduced the usage/session stats this formats (tokens tab, cost labeling).
- AGENTS.md: after any UI change, rebuild (`bun run build:ui`) so the worktree build is fresh; UI smoke test via `repoos check` must stay green.

## Original prompt

Everywhere that shows token counts should use M (millions) with 3 decimal places, not K (thousands). Also on the task panel tokens tab don't show the date on started / ended, just show the time by default, and if the user clicks on the started or ended columns then you can expand to show the date and time. (time shown should be local time, not utc).

## Activity

- 2026-09-08T12:45:50Z · created · hello@repoos.org
- 2026-09-08T12:47:24Z · status draft→inbox, title, area, body
- 2026-09-08T12:51:26Z · status inbox→ready
