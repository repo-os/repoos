---
id: "0380"
title: Redesign task drawer Tokens tab into distinct sections
type: feature
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-17T03:22:19Z"
updated_at: "2026-09-17T03:24:08Z"
---
## Problem

The Tokens tab in the task drawer (the panel that opens for a task) has grown into
a cluttered layout:

- A **top strip** shows live agent stats (time / tokens / cost for the current
  session). This is no longer relevant as a separate section — it is effectively
  just the engineer's totals, which already appear below in the usage data
  (totals grid and the "by role" breakdown). It reads as duplicated information
  and pushes the real content down.
- Below it, everything else (task-wide totals, per-role breakdown, per-session
  table) sits in one continuous block with only a faint "usage — all roles &
  sessions" caption and an "individual sessions" sub-caption. Visually, the three
  different kinds of data run together, so it is hard for a human to tell what
  each part represents without parsing the tables.

## Desired UX

Opening the Tokens tab shows a clean, well-structured readout with **no top
stat strip** — the tab starts directly with the usage content. That content is
split into clearly separate, visually distinct sections (per the Claude frontend
design skill: distinct section headers/eyebrow labels, spacing, and visual
treatment consistent with the app's design system), for example:

1. **Task totals** — the current totals grid (total time, total tokens, cache
   hit, total cost, turns, sessions), presented as its own section so it reads
   as "the whole-task summary".
2. **By role** — the per-role table (role / time / tokens / cost), presented as
   its own section so it reads as "who spent what".
3. **Individual sessions** — the per-session table, presented as its own
   section so it reads as "the raw session log".

A first-time reader should be able to glance at the tab and understand that
different kinds of data are shown and what each section means, without needing
to hover tooltips to figure out the structure. Existing tooltips on the metrics
themselves (cache hit, turns, cache column) stay.

## Acceptance criteria

- [ ] The top live stat strip (spinner + time / tokens / cost from the current
      session) is removed from the Tokens tab; the engineer figures it duplicated
      remain available via the totals and by-role sections.
- [ ] The usage content is divided into visually distinct sections with clear
      headings (at minimum: task totals, by role, individual sessions), styled
      consistently with the rest of the drawer/dark theme.
- [ ] Each section is self-explanatory: the heading conveys what the data
      represents; section-level meaning does not depend on hover tooltips.
- [ ] All existing data and interactions are preserved: the totals grid fields,
      the by-role table, the sessions table with clickable started/ended time
      expansion and agent/model expansion, cache-hover titles, and the
      active-session row highlight.
- [ ] The empty state ("No token or usage data yet.") still renders when there
      is no usage data, and the tab does not look broken in the partial states
      (totals present but single role; totals present but no sessions, etc.).
- [ ] UI rebuilds cleanly and `repoos check` passes.

## Notes for AI

- Markup lives in `src/ui-app/src/components/TaskDrawer.vue` — the Tokens tab
  is the `ui.activeTab === 'tokens'` branch (top strip: the `showStats`
  `agent-stats` block; usage block: the `task-usage` section).
- Styles for the drawer live in `src/ui-app/src/style.css` (`.agent-stats`,
  `.agent-stat`, `.task-usage*`, roughly lines 4826–4990) — the drawer is
  body-teleported, so its CSS is global, not scoped. `.agent-stat` is reused
  inside the totals grid and possibly other tabs; remove the top-strip usage in
  the Tokens tab and prune shared CSS only after confirming nothing else uses
  it.
- Keep the data layer untouched: same `taskUsage` / `sessionStats` sources and
  formatting helpers (`fmtTokens`, `fmtCost`, `fmtElapsed`, `cacheHitPct`);
  this is a presentation redesign, not a data change.
- Do not break the interactive toggles in the sessions table
  (`sessionTimesExpanded`, `sessionAgentsExpanded`) — relocate them intact.
- Use the Claude frontend design skill for the visual treatment; match the
  existing design language rather than introducing a new one.
- Assumption recorded: "top section" = the live `agent-stats` strip
  (including its busy spinner); "bottom section" = the whole `task-usage`
  block. If the implementer judges the live busy indicator worth keeping, it
  may be folded into the task-totals section header rather than kept as a
  separate strip — not required.

## Scope

Covers only the Tokens tab of the task drawer. Deferred: any new metrics or
sections, changes to the board-level usage view (`UsagePanel.vue`), changes to
how usage data is collected or served, and live-run stats shown elsewhere in
the drawer (e.g. the run tab).

## Related

- #0080 (live run stats — source of the top strip being removed)
- #0230 (historical usage totals — source of the bottom section)

## Original prompt

The token tabs of the task panel needs some cleanup, the top section isn't really relevant anymore (its just the engineer total, whcih is below in the new section too), so please redesign this tab to make it better. remove the top section and split out the bottom section into visual different sections (use claude frontend design skill) so that it's easier for a human to understand that different data is being displayed and what it means.

## Activity

- 2026-09-17T03:22:19Z · created · hello@repoos.org
- 2026-09-17T03:24:08Z · status draft→inbox, title, area, body
