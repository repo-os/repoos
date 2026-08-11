---
id: "0104"
title: Fix LiveIndex diff so needsInput/needsMerge changes produce SSE events
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/fix-liveindex-diff-so-needsinput-needsme
cli_override: codex
model_override: gpt-5.6-sol
created_at: "2026-08-11T14:00:00Z"
updated_at: "2026-08-11T19:26:45Z"
---
## Problem

`LiveIndex.diff()` in `src/server/live-index.ts` only compares 8 fields:
`title`, `status`, `priority`, `area`, `assignee`, `assignedTo`, `branch`,
`type`. Fields like `needsInput`, `needsMerge`, `agentOverride`, `cliOverride`,
`modelOverride`, `created_at`, and `updated_at` are excluded from the diff.

When an agent sets `needs_input: true` in the task file, the file watcher fires,
the index re-parses the file, but `diff()` returns `changedFields: []` —
empty. The SSE `task.updated` event is never emitted, so the UI never updates
in real time. The human only sees the flag on a full page refresh.

This is the root cause of #0075 sitting blocked for 6 hours today with a
running zombie process and no visible signal.

## Desired UX

When `needsInput` or `needsMerge` changes in a task file, the usual
`task.updated` SSE event fires and the UI reflects the change immediately —
same as it already does for `status` and `title` changes.

## Acceptance criteria

- [ ] `needsInput` is added to the `diff()` comparison in `live-index.ts`
- [ ] `needsMerge` is added to the `diff()` comparison
- [ ] `agentOverride`, `cliOverride`, `modelOverride` are added
- [ ] `created_at`, `updated_at` are added
- [ ] Existing diff tests still pass (none should break — these are additive)
- [ ] Manual verification: set `needsInput: true` in a task file, confirm
      the UI updates via SSE without a page refresh
- [ ] `repoos check` passes

## Notes for AI

- The change is in `src/server/live-index.ts` in the `diff()` method (around
  line 273-292). It compares `prev` (the old task from the Map) against
  `current` (the freshly re-parsed task).
- The comparison pattern is `keyof Task` fields pushed into an array. Add the
  missing fields to that list. No other code changes needed — the SSE funnel,
  store, and UI already handle any `task.updated` event correctly.
- This is a 5-line change. Do not overthink it.
- Verification: edit a task file on disk (e.g. toggle `needs_input: true`),
  then open the browser and confirm the card updates without a refresh.

## Activity

- 2026-08-11T19:26:42Z · cli_override, model_override
- 2026-08-11T19:26:45Z · status ready→active, branch
