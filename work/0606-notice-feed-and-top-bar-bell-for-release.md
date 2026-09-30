---
id: "0606"
title: Notice feed and top-bar bell for release events
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: ""
branch: feat/notice-feed-and-top-bar-bell-for-release
created_at: "2026-09-30T13:43:10Z"
updated_at: "2026-09-30T18:53:48Z"
---
## Problem
Long-running release work (notes drafting ~1-3 min, cut ~5 min) finishes while the user is elsewhere and nothing tells them. The mission control 'Needs your attention' list (`NeedsYouPanel.vue`, `humanNeeds` in `src/ui-app/src/stores/repo.ts`) is task-only, and the browser-notification store (`src/ui-app/src/stores/notifications.ts`) only knows the task types review/paused/stuck/needsInput.

## Change
- Add a non-task notice item type (id, kind, title, detail, link, createdAt, dismissed/read) with kinds: release notes ready, release succeeded, release failed. Generated from the release run state (`/api/release/run`) and the notes run state (see the server-tracked notes run task); design so other kinds can be added later.
- Reuse the 'Needs your attention' list: NeedsYouPanel renders notices alongside task items, and notices are dismissible and link to the Releases page.
- Add a bell icon with an unread-count badge in the upper right of the top bar, next to the user / help / light-dark toggle, visible on every page. Click opens a popover listing current notices (and task attention items if that fits the existing design), with dismiss / mark all read. Popover is body-teleported and carries `data-overlay-layer` per AGENTS.md; use the shared dialog/dropdown conventions and global CSS classes.
- Feed notifications.ts: new NotificationType(s) for the release kinds with per-type toggles, sound and browser push honouring the existing master toggles, plus Settings UI controls and a test (per the Settings rule in AGENTS.md).
- Persist read/dismissed state sensibly (localStorage is fine for read state); notices must survive a page reload while the underlying event is still current.

## Depends on
Server-tracked notes generation run (for the 'notes ready' event) and the modal copy task is independent.

## Tests
Store tests for notice creation/dedup/dismiss, bell badge count, and that a finished release produces exactly one notice.

## Shots

```json
[
  {"target": "default", "route": "/", "label": "Top bar bell popover", "steps": [{"click": "button[data-test-id=\"notice-bell-trigger\"]"}, {"waitMs": 400}], "selector": "[data-test-id=\"notice-bell-popover\"]"},
  {"target": "default", "route": "/", "label": "Needs-you panel with notice rows", "steps": [], "selector": "main"},
  {"target": "default", "route": "/settings?tab=notifications", "label": "Settings: release notification toggles", "steps": []}
]
```

Sources: release-succeeded/failed notices derive from `/api/release/run`; the `releaseNotesReady` kind is wired end-to-end (type, toggles, settings rows, tests) and its source lands with the server-tracked notes run task (#0605).

## Activity

- 2026-09-30T13:43:10Z · created · unknown
- 2026-09-30T17:55:55Z · status inbox→ready
- 2026-09-30T17:55:58Z · status ready→active, branch
- 2026-09-30T18:49:01Z · body
- 2026-09-30T18:49:08Z · body
- 2026-09-30T18:49:19Z · body
- 2026-09-30T18:53:48Z · status active→review
