---
id: "0796"
title: "CTO safe actions: allow an empty list and pick actions with checkboxes"
type: bug
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cto-safe-actions-allow-an-empty-list-and
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-15T09:55:06Z"
updated_at: "2026-10-15T10:21:33Z"
---
## Problem
1. Saving CTO safe actions with no action selected fails with 'CTO safe actions must be a non-empty array'. The server rejects every empty array for list settings (src/server/routes/config.ts ~728), but cto.actions is opt-in and its own description says 'Empty means report-only'. Turning all actions off should be allowed.
2. There is no easy way to see or pick the actions. The setting is a free-form array, so users have to know the four action names and type them correctly. The actions are: restart-stalled-agent, refresh-main-install, requeue-closeout-after-env-fix, kill-hung-validation.

## Desired UX
- Settings > CTO (or wherever cto.actions lives): a checkbox per action, with a one-line plain-language description of what it does, and a note that the list is report-only when empty.
- Turning every action off saves cleanly.
- kill-hung-validation shows a clear warning that it stops containers on the remote validation hosts automatically.

## Acceptance criteria
- Test: cto.actions accepts an empty list through the config route, and the schema still rejects unknown action names.
- Test: the Settings control saves the selected actions and reloads them.
- Checkboxes use the app's form styling; keyboard accessible; light and dark themes checked.
- Any new text is in getConfigSchema() description, so the docs and Settings stay in step (AGENTS.md).

## Notes for AI
Start from src/server/routes/config.ts (the non-empty array check), src/core/config.ts (cto.actions schema entry ~2215), src/core/cto-actions.ts (the allowed action names), and the Settings view that renders array fields. Source: user report 2026-10-15.

## Shots
```json
[
{
"label": "CTO safe actions checkboxes",
"target": "default",
"route": "/settings?tab=general",
"highlight": "#setting-cto.actions",
"steps": [
{
"waitMs": 400
}
]
}
]
```

## Activity

- 2026-10-15T09:55:06Z · created · njachowski@gmail.com
- 2026-10-15T09:57:59Z · cli_override, model_override
- 2026-10-15T09:58:02Z · status inbox→ready
- 2026-10-15T09:58:50Z · status ready→active, branch
- 2026-10-15T10:09:05Z · body
- 2026-10-15T10:09:29Z · body: section Shots
- 2026-10-15T10:12:29Z · body
- 2026-10-15T10:20:09Z · status active→review
- 2026-10-15T10:20:24Z · note: highlight #setting-cto.actions matched nothing on /settings?tab=general
- 2026-10-15T10:21:33Z · note: review pass 1: needs some work
