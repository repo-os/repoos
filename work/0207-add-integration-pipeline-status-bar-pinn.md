---
id: "0207"
title: Add integration pipeline status bar pinned to work queue
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-15T03:48:14Z"
updated_at: "2026-08-15T03:48:36Z"
---
## Problem

Move-to-done is a multi-stage pipeline (`sync` → `merge` → `build` → `check` → `finalize`), but the user has zero visibility into it. When it fails (merge conflict, build error, etc.), the only feedback is a fleeting error toast or digging through server logs. Users can't see:

- what is queued waiting to integrate
- what stage the current integration is at
- what failed
- how to retry

## Desired UX

A thin, always-visible bar pinned to the bottom of the Work Queue page (sticky, overlays the bottom of the viewport). It shows:

- **Queue** — tasks waiting to integrate (e.g. `#0195 queueing...`)
- **Active integration** — the current task with a stage indicator: `☐ sync → ☐ merge → ☐ build → ☐ check → ☐ done`, with the current stage highlighted/spinning and completed stages checked
- **Errors** — if a stage fails, that stage turns red with the error message inline, and a `Retry` button appears
- **Empty state** — `Integration pipeline idle` when nothing is in progress

The bar has a small expand/collapse toggle so it can fold to a thin strip when not needed.

## Acceptance criteria

- [ ] A pinned, bottom-overlay status bar is added to the Work Queue page
- [ ] Bar shows empty state `Integration pipeline idle` when nothing is in progress
- [ ] Bar lists queued tasks waiting to integrate (e.g. `#0195 queueing...`)
- [ ] Bar shows the active integration task with a stage indicator `sync → merge → build → check → done`
- [ ] Current stage is highlighted and shown as in-progress (spinning); completed stages are checked
- [ ] On stage failure, the failing stage turns red and the error message is shown inline
- [ ] A `Retry` button appears on failure
- [ ] Bar supports an expand/collapse toggle that folds it to a thin strip
- [ ] Bar updates live via integration pipeline SSE events (no manual refresh)

## Notes for AI

- The integration orchestrator in `src/server/integration-orchestrator.ts` already has discrete stages and progress callbacks — the SSE events for these only need to be exposed to the UI (do not re-architect the orchestrator; wire up existing progress data).
- The close-out flow in `src/server/done.ts` also has stage progress via `onProgress` callbacks — reuse/expose these the same way.
- The UI needs a new pinned Vue component on the Work page (`src/ui-app`) that subscribes to integration pipeline SSE events.
- The component must be sticky/pinned to the bottom of the viewport and overlay content.
- The `Retry` button should signal a retry through the existing integration pipeline mechanism (the notes above do not specify a new retry endpoint; if none exists, reuse the pipeline's retry path / file a follow-up in Notes if a new API is genuinely required).
- Conventions: imports use `.js` extensions even for `.ts` source (NodeNext). After any UI change, rebuild and verify with a browser probe before reporting done.
- Assumption: the pinned bar lives only on the Work Queue page, not other pages.
- Assumption: the `Retry` button retries the failed stage/integration through the existing integration pipeline; exact retry semantics are left to the integration-orchestrator's existing retry behavior.

## Scope

- In-scope: expose integration pipeline stages/progress as SSE events from the orchestrator and close-out flow; build the pinned Vue status-bar component with queue, active stage, error, and empty states; add the expand/collapse toggle.
- Deferred: any redesign of the integration pipeline itself, retry endpoint design beyond what already exists, and displaying the bar on pages other than the Work Queue.

## Related

- `src/server/integration-orchestrator.ts`
- `src/server/done.ts`
- Work Queue page in `src/ui-app`

## Activity

- 2026-08-15T03:48:14Z · created · unknown
- 2026-08-15T03:48:36Z · status inbox→ready
