---
id: "0321"
title: Duplicate error toast when per-task sync-with-main fails
type: bug
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-29T05:59:08Z"
updated_at: "2026-08-29T05:59:08Z"
---
## Problem

In DebugPanel.vue (per-task "sync with main" button), when the sync fails the
store's `syncTaskBranch` (repo.ts:1519) already pushes an error toast and then
rethrows; the panel's catch then calls `repo.onError(err)`, pushing a second
identical toast. The user sees the same failure twice.

## Suggested fix

Either drop the `repo.onError` call in the panel (the rethrow is only needed for
`syncBusy` cleanup), or make the store not toast when the caller handles the
error.

## Scope

- Low priority UI polish bug; no behavior change to sync logic itself.

## Related

- #0318 (per-task sync-with-main button on the debug tab) — where this was
  discovered during review.

## Original prompt

Review feedback on #0318: "Minor, DebugPanel.vue / repo.ts:1519: on failure the store's syncTaskBranch already pushes an error toast, then rethrows; the panel's catch calls repo.onError(err), which pushes a second identical toast. One fix: drop the repo.onError call (the throw is only needed for syncBusy cleanup), or make the store not toast when the caller handles it."

## Activity

- 2026-08-29T05:59:08Z · created · unknown
