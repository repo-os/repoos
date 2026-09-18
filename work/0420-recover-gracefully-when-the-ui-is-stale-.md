---
id: "0420"
title: Recover gracefully when the UI is stale after a rebuild
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-18T15:33:49Z"
updated_at: "2026-09-18T15:35:13Z"
---
---
id: "0420"
title: Recover gracefully when the UI is stale after a rebuild
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-18T15:33:49Z"
updated_at: "2026-09-18T15:33:49Z"
---
## Problem

When RepoOS is rebuilt while a browser tab is open, navigation from the already-loaded Work page to a lazy route such as Inputs or Agents can appear to do nothing. The old app shell may request a hashed route chunk that the new dist no longer serves. The server's SPA fallback can return index.html for a missing asset, and Vue Router currently has no user-facing route-load error path. Separately, API requests have no deadline, so a stalled local request can leave a click or page load waiting indefinitely. This is especially confusing when task cards still work because they do not require a new route chunk.

## Desired outcome

RepoOS should detect stale UI/build state and recover with clear user feedback instead of a dead-looking navigation. Preserve user work and never blindly reload over unsaved edits.

## Requirements

- Detect lazy-route and dynamic-import failures (including missing hashed chunks and module MIME/fetch errors) through a global router error handler.
- Show a persistent, prominent but non-destructive banner such as: RepoOS was updated while this page was open. Reload to continue.
- Include a Reload now action. Remember the attempted destination so a reload returns the user to the intended route when safe.
- Automatically reload only when the UI is idle and has no unsaved task/input/raw-config drafts, pending attachments, or other known edit state. Otherwise require an explicit click and keep the current page intact.
- Add a bounded API-request timeout/abort path so stalled local requests fail visibly with retry/reload guidance rather than hanging forever.
- Missing /assets/* files must return a real 404 instead of the SPA HTML fallback, making stale-asset failures unambiguous and preventing JavaScript MIME confusion.
- Keep old UI asset generations available long enough for open tabs to finish loading, or make builds/deploys atomic so a browser never receives an HTML shell and incompatible asset set. Choose and document the approach that fits RepoOS's local/dev and deployed flows.
- Separately, the UI can compare its own build ID to `/api/health` on reconnect, focus, and normal route changes, then show the same banner before a click fails.
- Reconcile this with the existing /new-build notice and SSE reconnect behavior; do not create duplicate or conflicting banners.
- The server-status view should distinguish a healthy listener that is outside the normal serve-lock lifecycle from a genuinely stopped server, or otherwise make that mismatch actionable.

## UX details

- Banner states should distinguish stale UI/reload required, temporarily offline/stalled server, and normal new-build available.
- Show a retry/reload action and, where relevant, the current and new build identifiers/timestamps.
- Do not interrupt active agent output, task chat, or an editor with an automatic reload.
- Preserve route intent through reload when possible; if not, explain where the user will land.

## Verification

- Unit-test router dynamic-import error detection, idle/dirty reload decisions, route-intent persistence, timeout behavior, and build-ID comparisons.
- Add server tests proving missing assets return 404 while unknown document/UI routes still receive SPA fallback behavior.
- Test SSE reconnect, window focus, and route-change health checks without duplicate requests or banners.
- Add a browser/UI regression test that opens an old shell, simulates a missing route chunk, and verifies the actionable reload banner.
- Verify active task runs and unsaved form/input/config edits are not lost.
- Run the focused suites and repoos check.

## Activity

- 2026-09-18T15:33:49Z · created · unknown
- 2026-09-18T15:35:13Z · body
