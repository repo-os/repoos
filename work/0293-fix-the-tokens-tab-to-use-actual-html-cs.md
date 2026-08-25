---
id: "0293"
title: Fix the tokens tab to use actual html/css/tailwind tables…
type: feature
status: review
needs_input: true
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-the-tokens-tab-to-use-actual-html-cs
model_override: default
pm_model_override: default
review_model_override: default
created_at: "2026-08-25T00:16:03Z"
updated_at: "2026-08-25T05:54:44Z"
handoff_signal_retry_count: 1
---
Fix the tokens tab to use actual HTML tables (with proper table semantics) so tabular data is displayed correctly and legibly, and apply the same fix to the other surfaces that render token/usage tabular data.

## Scope

Token/usage data is currently rendered with flex/grid "fake-table" divs in three places. Convert each to a real HTML `<table>` (with `<thead>`/`<tbody>`, column headers, right-aligned numeric columns, and responsive overflow handling) styled with the design system's token utilities/CSS vars.

### 1. Tokens tab in the task drawer
File: `src/ui-app/src/components/TaskDrawer.vue` (`ui.activeTab === "tokens"`)

- "by role" breakdown — `.task-usage-role-list` / `.task-usage-role` flex rows. Columns: role · time · tokens · cost.
- "individual sessions" — `.task-usage-session-list` / `.task-usage-session-row` grid rows. Columns: type · agent / model · started · ended · time · tokens · cost.

### 2. Control page (Control / dashboard view)
File: `src/ui-app/src/views/DashboardView.vue` -> `src/ui-app/src/components/UsagePanel.vue`

- "by role" breakdown — `.usage-role-list` / `.usage-role` flex rows. Columns: name · time · tokens · cost.
- "by day (server local time)" — same `.usage-role-list` pattern. Columns: date · time · tokens · cost.

The top summary stat blocks (`.agent-stats` / `.usage-grid` / `.usage-cell` — the time / tokens / cost / sessions stat "tiles") are NOT tables and should stay as-is. Only the multi-row breakdowns become real tables.

Also update the matching styles — `src/ui-app/src/components/UsagePanel.vue` scoped styles and the shared `task-usage-*` styles in `src/ui-app/src/style.css` that currently model tables with flex/grid (`.task-usage-role-list`, `.task-usage-session-list`, `.usage-role-list`).

## Acceptance
- `repoos check` passes (build, typecheck, tests, headless UI smoke).
- Each multi-row breakdown renders as a semantic `<table>` with headers and aligned numeric columns.
- No user-visible regression to the top summary stat tiles on either surface.

## Notes / best practices
- Use real `<table>`, `<thead>`, `<tbody>`, `<th>` / `<td>` elements rather than semantic-less divs, per the task's "actual html/css/tailwind tables" ask.
- Match existing design tokens (monospace font, `--border`, `--cyan`, `--txt-dim`, etc.); right-align numeric values (time / tokens / cost), left-align names and dates.
- Preserve the active-session highlight (green type) and the "running..." indicator.

## Activity

- 2026-08-25T00:20:58Z · body
- 2026-08-25T00:21:15Z · status draft→inbox
- 2026-08-25T00:56:33Z · model_override
- 2026-08-25T00:56:35Z · status inbox→ready
- 2026-08-25T00:56:47Z · status ready→active, branch
- 2026-08-25T04:33:03Z · pm_model_override
- 2026-08-25T04:33:35Z · review_model_override
- 2026-08-25T05:08:33Z · model_override
- 2026-08-25T05:27:12Z · status active→review
- 2026-08-25T05:29:04Z · model_override
- 2026-08-25T05:36:50Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-08-25T05:45:04Z · review_model_override
- 2026-08-25T05:51:50Z · needs_input
- 2026-08-25T05:54:25Z · review_model_override
- 2026-08-25T05:54:37Z · review_cli_override
- 2026-08-25T05:54:38Z · review_cli_override
- 2026-08-25T05:54:41Z · review_cli_override
- 2026-08-25T05:54:44Z · review_cli_override
