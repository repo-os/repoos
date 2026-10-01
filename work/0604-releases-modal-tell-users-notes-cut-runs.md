---
id: "0604"
title: "Releases modal: tell users notes/cut runs can be left and revisited"
type: chore
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/releases-modal-tell-users-notes-cut-runs
cli_override: cursor
model_override: composer-2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-30T13:42:54Z"
updated_at: "2026-10-01T04:56:12Z"
review_passes: 1
---
## Problem
In the Cut a release modal (`src/ui-app/src/views/ReleasesView.vue`) nothing says the user can leave while work continues.

- **Generate with AI**: `POST /api/release/notes` keeps running server-side if the modal closes, and a successful draft is cached (`src/server/release-notes-cache.ts`), so clicking Generate again later returns it instantly. Typical duration 1-3 minutes.
- **Publish**: `POST /api/release` runs detached; state is polled from `GET /api/release/run` on page mount. Typical duration ~5 minutes; safe to navigate away.

## Change
Copy-only. Add hint text: notes drafting takes 1-3 minutes and you can close this and come back (re-clicking Generate reuses the saved draft); the cut takes about 5 minutes and is safe to leave, check status on the Releases page. Keep the existing 'usually takes a few minutes' line consistent with it.

## Out of scope
Server-tracked notes runs (separate task) and notifications (separate task).

## Activity

- 2026-09-30T13:42:54Z · created · unknown
- 2026-09-30T17:53:46Z · cli_override, model_override
- 2026-09-30T17:54:05Z · model_override
- 2026-09-30T17:54:16Z · review_model_override
- 2026-09-30T17:54:19Z · status inbox→ready
- 2026-09-30T17:54:20Z · status ready→active, branch
- 2026-09-30T18:25:34Z · status active→review
- 2026-10-01T04:56:12Z · status review→done, release:success
