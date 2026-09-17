---
updated_at: "2026-09-17T05:39:33Z"
review_passes: 1
id: "0380"
title: Redesign task drawer Tokens tab into distinct sections
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/redesign-task-drawer-tokens-tab-into-dis
model_override: opencode-go/minimax-m3
created_at: "2026-09-17T03:22:19Z"
---
## Problem

The Tokens tab in the task drawer (the panel that opens for a task) shows
several different kinds of data, but the usage content below the top strip is
hard to parse:

- A **top strip** of live agent stats (time / tokens / cost for the current
  session). This stays as-is — an earlier draft of this task asked for its
  removal, but that referred to a legacy engineer-only strip that had already
  been removed; the current live strip is fine.
- Below it, the usage content (task-wide totals, per-role breakdown, per-session
  table) sits in **one continuous bordered block** with only a faint
  "usage — all roles & sessions" caption, an "individual sessions" sub-caption,
  and thin **dashed lines** between the parts. Three different kinds of data run
  together, so it is hard for a human to tell what each part represents without
  parsing the tables.

## Desired UX

Opening the Tokens tab shows the current live stat strip (unchanged), followed
by the usage content split into **three clearly separate, visually distinct
sections**, each rendered as its own block/card — the same treatment the
Settings page uses (one `Card` panel per section with a `sec-label` heading,
stacked with spacing; see `src/ui-app/src/views/SettingsView.vue` ~lines
332–460), NOT sections separated by a dashed line inside one continuous panel:

1. **Task totals** — the totals grid (total time, total tokens, cache hit,
   total cost, turns, sessions), reading as "the whole-task summary".
2. **By role** — the per-role table (role / time / tokens / cost), reading as
   "who spent what".
3. **Individual sessions** — the per-session table, reading as "the raw session
   log".

A first-time reader should be able to glance at the tab and understand that
different kinds of data are shown and what each section means, without needing
to hover tooltips to figure out the structure. Existing tooltips on the metrics
themselves (cache hit, turns, cache column) stay.

## Acceptance criteria

- [x] The top-strip question is settled: the current live strip (spinner + time
      / tokens / cost from the current session, the `showStats` `agent-stats`
      block) STAYS — it is not the duplicate the original prompt referred to;
      that legacy engineer-only strip was already removed by earlier work.
- [ ] The usage content is divided into three sections with clear headings
      (at minimum: task totals, by role, individual sessions).
- [ ] Each section is rendered as a visually distinct block/card — separate
      panels like the Settings page's section blocks, matching the drawer/dark
      theme — replacing the current single `task-usage` panel with its dashed
      `border-top` separators between the roles and sessions parts.
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
  `agent-stats` block, currently ~line 3590; usage block: the `task-usage`
  section). The strip stays; the redesign applies to the `task-usage` section.
- Styles for the drawer live in `src/ui-app/src/style.css` (`.agent-stats`,
  `.agent-stat`, `.task-usage*`, roughly lines 4826–4991) — the drawer is
  body-teleported, so its CSS is global, not scoped. The dashed separators to
  replace are `border-top: 1px dashed var(--border)` on `.task-usage-roles`
  (~line 4911) and `.task-usage-sessions` (~line 4958). `.agent-stat` is
  reused inside the totals grid; `.agent-stats` (plural) is used only by the
  strip, which stays.
- Visual reference for the block treatment: the Settings page renders each
  section as its own `<Card>` with a `.sec-label` heading
  (`src/ui-app/src/views/SettingsView.vue`, ~lines 332–460). Match the drawer's
  existing panel look (bordered, rounded, `var(--panel-solid)`) in that spirit
  rather than introducing a new style.
- Keep the data layer untouched: same `taskUsage` / `sessionStats` sources and
  formatting helpers (`fmtTokens`, `fmtCost`, `fmtElapsed`, `cacheHitPct`);
  this is a presentation redesign, not a data change.
- Do not break the interactive toggles in the sessions table
  (`sessionTimesExpanded`, `sessionAgentsExpanded`) — relocate them intact.
  The empty-state condition (`!showStats && (!taskUsage ||
  taskUsage.totalSessions === 0)`) stays valid since the strip stays.
- Use the Claude frontend design skill for the visual treatment; match the
  existing design language rather than introducing a new one.
- Resolved 2026-09-17: an earlier draft of this task asked to remove the "top
  section" from the Tokens tab. That referred to a legacy engineer-only strip
  that had already been removed; the current live strip stays, and the
  remaining work is the section split with distinct blocks below it.

## Scope

Covers only the Tokens tab of the task drawer. Deferred: any new metrics or
sections, changes to the top live stat strip, changes to the board-level usage
view (`UsagePanel.vue`), changes to how usage data is collected or served, and
live-run stats shown elsewhere in the drawer (e.g. the run tab).

## Related

- #0080 (live run stats — source of the top strip, which stays)
- #0230 (historical usage totals — source of the usage content being split)

## Original prompt

The token tabs of the task panel needs some cleanup, the top section isn't really relevant anymore (its just the engineer total, whcih is below in the new section too), so please redesign this tab to make it better. remove the top section and split out the bottom section into visual different sections (use claude frontend design skill) so that it's easier for a human to understand that different data is being displayed and what it means.

> PM update 2026-09-17: the "remove the top section" part above referred to a
> legacy engineer-only strip that was already removed. The current live stat
> strip stays; the remaining ask is the section split with each table as a
> visually distinct block (like the Settings page sections), replacing the
> dashed-line separation.

## Activity

- 2026-09-17T03:22:19Z · created · hello@repoos.org
- 2026-09-17T03:24:08Z · status draft→inbox, title, area, body
- 2026-09-17T05:18:30Z · body
- 2026-09-17T05:35:04Z · model_override
- 2026-09-17T05:35:06Z · status inbox→ready
- 2026-09-17T05:35:12Z · status ready→active, branch
- 2026-09-17T05:37:35Z · status active→review

