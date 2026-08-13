---
id: "0179"
title: Surface parked builds to the UI reliably (reload notice is one-shot)
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-13T16:19:55Z"
updated_at: "2026-08-13T16:19:55Z"
---
## Problem

The UI only learns a newer build is parked on disk via a one-shot SSE `build.available` event, emitted once when the build is parked (`parkBuild` in server/reload.ts → `onBuildAvailable` in server.ts). If the tabs SSE is disconnected or reconnecting at that moment, the event is lost and never re-sent. `/api/health` reports only the running build (`buildAt`, `buildHash`), and the parked hash stays private inside `ReloadManager` — so the UI has no polling or connect-time reconcile path to discover the parked build.

Observed live: a close-out parked a new build (0143 close-out lock); the "new build available — restart" notice never appeared; the operator only got the new build after a manual POST /api/server/restart.

## Fix

- Expose the parked build in `/api/health` (e.g. `buildAvailableAt` / `buildAvailableHash`) via a getter on `ReloadManager` (`buildAvailableHash` already exists as private state; parked builds are already deduped per hash in `parkBuild`).
- In the UI (`reconcileVersion`, called on SSE `hello` / connect), if health reports a parked build newer than the running one, SET the notice instead of only clearing it. Keep the existing clear behavior when the running build is at least as new as the parked one.

## Acceptance

1. While the tab is closed (or SSE disconnected), a new build lands and is parked. On next connect / page load, the "new build available — restart" notice appears without any prior build.available event having been seen.
2. After the reload lands, the notice clears (existing behavior preserved).

## Activity

- 2026-08-13T16:19:55Z · created · unknown
