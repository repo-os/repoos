---
updated_at: "2026-09-19T00:35:48Z"
review_passes: 6
id: "0420"
title: Recover gracefully when the UI is stale after a rebuild
type: bug
status: review
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/recover-gracefully-when-the-ui-is-stale-
created_at: "2026-09-18T15:33:49Z"
review_rounds: 2
handoff_signal_retry_count: 1
---
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
- 2026-09-18T17:00:00Z · status inbox→ready
- 2026-09-18T17:00:03Z · status ready→active, branch
- 2026-09-18T17:10:28Z · status active→review
- 2026-09-18T17:12:44Z · status review→active
- 2026-09-18T17:31:38Z · status active→review
- 2026-09-18T17:32:36Z · status review→active
- 2026-09-18T17:36:46Z · status active→review
- 2026-09-18T19:12:22Z · status review→active
- 2026-09-18T19:12:22Z · note: Address the latest reviewer findings before returning #0420 to review: 1. Ensure stale-UI state and the existing new-version state are mutually exclusive. No focus/reconnect/route-change path may show both update banners. 2. Scope API timeouts: do not apply the 15-second abort to legitimate slow write/upload operations. Preserve visible recovery guidance for truly stalled reads/navigation. 3. Extend the dirty-state check to cover unsent task-chat drafts and task-editor body/title drafts, so automatic reload cannot lose user text. 4. Implement the specified server-status distinction between a healthy listener outside the serve-lock lifecycle and a genuinely stopped server, or explicitly narrow the requirement with evidence and tests—but do not leave it silently unaddressed. 5. Add regression coverage for all four points, rerun the focused tests and repoos check, then return the task to review.
- 2026-09-18T19:19:09Z · status active→review
- 2026-09-19T00:22:08Z · status review→active
- 2026-09-19T00:27:14Z · status active→review
- 2026-09-19T00:27:14Z · status review→active
- 2026-09-19T00:31:43Z · status active→review

