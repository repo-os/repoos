---
id: "0605"
title: Server-tracked release-notes generation run
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: ""
branch: feat/server-tracked-release-notes-generation-
created_at: "2026-09-30T13:43:09Z"
updated_at: "2026-09-30T18:55:31Z"
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

## Also: cache key must ignore bookkeeping commits
`releaseNotesCacheKey` (`src/server/release-notes-cache.ts`) is `HEAD::sinceTag`. Every commit to main moves HEAD, including bookkeeping-only ones (`docs(NNNN): add task`, task status/`work/*.md` updates, checkpoint commits), so a saved draft misses on the next click and a fresh ~60s agent run starts. Observed 2026-09-30: drafts for 2a908931 and 42375fa6 were both cached, then HEAD moved by task-creation commits and the modal re-ran the agent every time.
- Key the cache on the release-relevant commit context instead: e.g. a hash of the commit list since the last tag with commits that touch only `work/**` (task files) filtered out, or the newest non-bookkeeping commit SHA.
- The same filtered list should feed the prompt, so bookkeeping commits do not show up in notes.
- Test: adding a task-file-only commit keeps the cache hit; a source commit invalidates it.

## Shots

```json
[
  {
    "target": "default",
    "route": "/releases",
    "label": "Releases page",
    "steps": [{ "waitMs": 800 }]
  },
  {
    "target": "default",
    "route": "/releases",
    "selector": ".release-modal",
    "label": "Cut-a-release modal — optional notes field and Generate with AI (which now starts a server-tracked run)",
    "steps": [{ "click": ".rel-next-release .rel-actions button" }, { "waitMs": 700 }]
  }
]
```

The mid-run "Drafting…" state and the auto-fill on completion are covered by
store tests (`release-cut-next.test.ts`); we deliberately don't trigger a real
agent run in the shot capture.

## Activity

- 2026-09-30T13:43:09Z · created · unknown
- 2026-09-30T14:04:51Z · assigned_to, body
- 2026-09-30T17:54:59Z · status inbox→ready
- 2026-09-30T17:55:00Z · status ready→active, branch
- 2026-09-30T18:48:43Z · body
- 2026-09-30T18:54:53Z · status active→review
- 2026-09-30T18:55:31Z · note: shots: failed — capture of Cut-a-release modal — optional notes field and Generate with AI (which now starts a server-tracked run) on "default" failed: goto: Timeout 30000ms exceeded.
