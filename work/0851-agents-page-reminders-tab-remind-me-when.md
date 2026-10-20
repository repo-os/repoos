---
id: "0851"
title: "Agents page: Reminders tab (remind me when an AI agent or provider is available again)"
type: feature
status: done
priority: p2
area: [web, server, core]
merged_commit: f1b3f935e6fd0ac8d380d6092769ab92bfca63d3
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/agents-page-reminders-tab-remind-me-when
cli_override: pi
model_override: openrouter/openrouter/auto-beta
review_cli_override: pi
review_model_override: openrouter/z-ai/glm-5.3-flash
created_at: "2026-10-19T12:23:10Z"
updated_at: "2026-10-19T14:46:00Z"
last_close_out_gate_ms: 164694
last_close_out_gate_at: "2026-10-19T14:45:12.526Z"
review_passes: 1
dev_error_count: 1
---
## Problem
Agents and providers become unavailable for known periods (Cursor is out of credit for about 3 days, rate limits reset at a set time, a provider is down until a stated date), and the human has to remember to switch them back on. There is no place in RepoOS to record "tell me when X is available again", so it lives in the human's head.

## Desired UX
The Agents page gets a **Reminders** tab (alongside the existing tabs, built with the shared styled components and the standard side-panel shell for the create/edit form; see the schedule panel and New task for the pattern):
- A list of reminders, soonest first, each showing: the text, the date/time it fires, an optional link to an agent, model or provider (chosen with the shared styled dropdown from the known agents/providers), its state (upcoming, due, overdue, done, snoozed) and a countdown ("in 2d 4h").
- **Create/edit** a reminder: text, date and time (with the browser's timezone shown), optional agent/model/provider link, optional "resume this entry when done" toggle when the link points at a paused allowlist entry (see the pause-allowlist task #0850).
- When a reminder becomes due it appears in the notification bell (and on the Agents tab badge) until the human marks it done or snoozes it (preset snoozes: 1 hour, tomorrow, 1 day, custom). Reminders survive server restarts.
- Actions: done, snooze, edit, delete (shared confirmation dialog, no native confirm), and the CLI `repoos reminder add|list|done|snooze|delete`.
- Quick path: from a paused agent/model in Budget Controls, a one-click "Remind me when it resumes" creates a reminder at the paused-until date.
- Storage is repo-native and human-readable (for example `reminders/<id>.md` or a single `reminders.md`, a documented format) so it is versioned or at least diffable, with derived state kept disposable; no new runtime dependency. Reminders are personal notes: they never start agents or change config by themselves.

## Acceptance criteria
- Tests: create/edit/snooze/done/delete round-trip through the API and survive a restart; a reminder whose time has passed shows as due and raises exactly one bell notice (no duplicates across ticks or reloads); snooze moves the fire time; deleted reminders disappear everywhere.
- Tests: the CLI commands work against the API; invalid dates and unknown agents give specific errors.
- UI: the Reminders tab and its create/edit panel use the shared drawer shell, styled Select/date controls and global form classes (no native select, no ff-textarea on single-line inputs); close on X, Esc and outside click; light and dark checked; declared shots use a real fixture (add `reminders:due` if needed) and every PNG is opened.
- Server tick or timer fires due reminders only on the real control-plane server (not previews, worktrees or tests), the same guard the scheduled-tasks automation uses.
- docs and user-docs/agents.md updated; AGENTS.md conventions respected (shared dialogs, teleported layers with data-overlay-layer, Settings control for any new setting).

## Notes for AI
Model the storage, tick and SSE-update pattern on scheduled tasks (src/server/schedule-*.ts, src/core/schedule.ts, docs/scheduled-tasks.md) and the UI on ScheduledTasksPanel.vue after #0841 fixes it; the bell integration is in the notices/attention store. Keep it small and independent of #0850: the "resume this entry" link is optional and may land as a follow-up if #0850 is not merged. Do not touch repoos.toml. Source: Nick, 2026-10-19.

## Shots
```json
[
{
"label": "Due and upcoming reminders in dark theme",
"target": "default",
"route": "/agents?tab=reminders",
"highlight": "[data-testid=reminders-panel]",
"state": "reminders:due",
"theme": "dark"
},
{
"label": "Due and upcoming reminders in light theme",
"target": "default",
"route": "/agents?tab=reminders",
"highlight": "[data-testid=reminders-panel]",
"state": "reminders:due",
"theme": "light"
},
{
"label": "Reminder drawer with styled link and local date/time controls",
"target": "default",
"route": "/agents?tab=reminders",
"highlight": "[data-testid=reminder-editor-drawer]",
"steps": [
{
"click": "[data-testid=new-reminder]"
}
],
"state": "reminders:due",
"theme": "light"
}
]
```

## Activity

- 2026-10-19T12:23:10Z · created · njachowski@gmail.com
- 2026-10-19T13:19:21Z · cli_override, model_override
- 2026-10-19T13:19:34Z · model_override
- 2026-10-19T13:19:38Z · review_cli_override, review_model_override
- 2026-10-19T13:19:41Z · review_model_override
- 2026-10-19T13:19:42Z · status inbox→ready
- 2026-10-19T13:19:45Z · status ready→active, branch
- 2026-10-19T13:37:23Z · body
- 2026-10-19T13:39:21Z · body
- 2026-10-19T13:40:16Z · body
- 2026-10-19T13:41:41Z · agent exited with an error (pi) · Warning: No project session found with id 'repoos-0851-engineer'; creating a new session with that id.
- 2026-10-19T14:22:37Z · body
- 2026-10-19T14:25:53Z · body
- 2026-10-19T14:34:22Z · status active→review
- 2026-10-19T14:34:22Z · note: shots: skipped — 5 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-19T14:41:38Z · note: review pass 1: good to go
- 2026-10-19T14:45:12Z · close-out gate completed in 165s
- 2026-10-19T14:46:00Z · status review→done, release:success
