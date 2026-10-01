---
id: "0612"
title: Align detected-agent driver column and compatibility icons
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/align-detected-agent-driver-column-and-c
created_at: "2026-10-01T09:01:31Z"
updated_at: "2026-10-01T09:14:46Z"
review_rounds: 1
review_passes: 1
---
## Shots

```json
[{"target": "default", "route": "/agents", "label": "Detected tab — driver column and compat icon aligned", "highlight": ".detect-row", "steps": [{"waitMs": 500}]}, {"target": "default", "route": "/agents", "label": "Detected tab — deprecated badge and compat icon at fixed positions", "highlight": ".detect-deprecated-slot", "steps": [{"waitMs": 500}]}]
```

## Original prompt

Align the info/question mark/check icon to come right after the "repoos driver" / "detected only" column, and make them all aligned so it's prettier. Anything else - version, install cmd, hints, dropdown select should come in the next column, also left aligned.

## Screenshots

![Screenshot-2026-09-30-at-20.50.39](/api/tasks/0612/attachments/screenshot-1.png)

## Activity

- 2026-10-01T09:01:31Z · created · hello@repoos.org
- 2026-10-01T09:01:32Z · screenshots
- 2026-10-01T09:02:02Z · status draft→inbox, title, area, body
- 2026-10-01T09:02:14Z · status inbox→ready
- 2026-10-01T09:02:23Z · status ready→active, branch
- 2026-10-01T09:04:42Z · body
- 2026-10-01T09:09:02Z · status active→review
- 2026-10-01T09:09:33Z · status review→active
- 2026-10-01T09:10:29Z · body
- 2026-10-01T09:14:46Z · note: shots: skipped — 2 shots already captured — an engineer-made capture pre-empts the automatic one
