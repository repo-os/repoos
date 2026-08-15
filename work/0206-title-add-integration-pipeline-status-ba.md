---
id: "0206"
title: "Title: Add integration pipeline status bar pinned to work…"
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-15T03:45:30Z"
updated_at: "2026-08-15T04:08:08Z"
---
Title: Add integration pipeline status bar pinned to work queue

Problem: Move-to-done is a multi-stage pipeline (sync → merge → build → check → finalize), but the user has zero visibility into it. When it fails (merge conflict, build error, etc.), the only feedback is a fleeting error toast or digging through server logs. Users can't see what's queued, what stage the current integration is at, what failed, or how to retry.

Desired UX: A thin, always-visible bar pinned to the bottom of the Work Queue page (sticky, overlays the bottom of the viewport). It shows:

Queue — tasks waiting to integrate (e.g. "#0195 queueing...")
Active integration — the current task with a stage indicator: ☐ sync → ☐ merge → ☐ build → ☐ check → ☐ done, with the current stage highlighted/spinning and completed stages checked
Errors — if a stage fails, that stage turns red with the error message inline, and a "Retry" button appears
Empty state — "Integration pipeline idle" when nothing is in progress
The bar has a small expand/collapse toggle so it can fold to a thin strip when not needed.

Technical notes:

The integration orchestrator (src/server/integration-orchestrator.ts) already has discrete stages and progress callbacks — the SSE events for these just need to be exposed to the UI
The close-out flow in src/server/done.ts also has stage progress via onProgress callbacks
The UI needs a new pinned Vue component on the Work page that subscribes to integration pipeline SSE events

## Activity

- 2026-08-15T03:45:30Z · created · unknown
- 2026-08-15T04:08:08Z · status draft→inbox
