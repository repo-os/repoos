---
last_close_out_gate_ms: 335869
last_close_out_gate_at: "2026-10-15T18:47:52.871Z"
id: "0801"
title: Highlight running dev targets
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/highlight-running-dev-targets
created_at: "2026-10-15T18:16:48Z"
updated_at: "2026-10-15T18:47:52Z"
review_passes: 1
---
## Problem

It is not immediately clear which dev targets are running, making it harder to distinguish started targets from stopped ones.

## Desired UX

Running dev targets are highlighted in the same style as active remote runners that are running checks. Stopped dev targets are not highlighted as running.

## Acceptance criteria

- [ ] Started dev targets receive the same highlight treatment as active remote runners running checks.
- [ ] Stopped dev targets do not receive the running highlight.
- [ ] Existing highlighting for active remote runners remains unchanged.

## Notes for AI

- Treat a dev target as running when it is started; do not highlight stopped targets.
- Reuse the existing active remote runner highlight style rather than introducing a new one.

## Original prompt

I want to highlight the running dev targets in the same style we highlight the active remote runners (those running checks) so it's easier to immediately tell which dev targets are running (the started ones, not the stopped ones).

## Shots
```json
[
{
"label": "Started dev target carries the cyan running glow; the stopped one does not",
"target": "default",
"route": "/dev",
"highlight": ".dev-card[data-running]",
"state": "dev:running"
}
]
```

## Screenshots

![Screenshot-2026-10-16-at-01.14.30](/api/tasks/0801/attachments/screenshot-1.png)
![Screenshot-2026-10-16-at-01.14.50](/api/tasks/0801/attachments/screenshot-2.png)

## Activity

- 2026-10-15T18:16:48Z · created · hello@repoos.org
- 2026-10-15T18:16:50Z · screenshots
- 2026-10-15T18:16:51Z · screenshots
- 2026-10-15T18:17:13Z · status draft→inbox, title, area, body
- 2026-10-15T18:21:50Z · status inbox→ready
- 2026-10-15T18:21:54Z · status ready→active, branch
- 2026-10-15T18:27:48Z · body: section Shots
- 2026-10-15T18:29:01Z · body
- 2026-10-15T18:37:28Z · status active→review
- 2026-10-15T18:38:17Z · note: review pass 1: good to go
- 2026-10-15T18:47:52Z · close-out gate completed in 336s

