---
id: "0605"
title: Server-tracked release-notes generation run
type: feature
status: inbox
priority: p2
area: [web, server]
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-30T13:43:09Z"
updated_at: "2026-09-30T13:43:09Z"
---
## Problem
`POST /api/release/notes` (`generateReleaseNotes` in `src/server/routes/release.ts`) is a single blocking HTTP request (1-3 min). If the user closes the modal or navigates away, the agent still finishes and caches the draft, but the UI gets no result, shows no in-progress state on return, and a second click starts a duplicate agent run.

## Change
Track notes generation like the release run (`run` / `GET /api/release/run`):
- Server holds a notes-run state (idle/running/succeeded/failed, startedAt, error, key of the commit context) in memory; `POST /api/release/notes` starts it detached and returns 202; a second POST while running returns the existing run instead of spawning another agent.
- New `GET /api/release/notes/run` (or similar) returns the state and, when succeeded, the draft.
- ReleasesView polls on mount and while the modal is open: reopening the modal shows 'Drafting…' while running and fills the textarea when the draft is ready. Keep the cache reuse behaviour and the confirm-before-replace prompt.
- Keep recordOneShotSession usage recording (sessionType release-notes).
- Emit a completion event that the notification feed task can consume (see the notice-feed task); this task should only expose the state, not build the feed.

## Tests
Server: duplicate POST while running doesn't start a second run; failure state surfaces the error; cache hit short-circuits. UI: reopening the modal mid-run shows drafting and picks up the result.

## Activity

- 2026-09-30T13:43:09Z · created · unknown
