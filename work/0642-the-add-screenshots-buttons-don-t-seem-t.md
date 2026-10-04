---
updated_at: "2026-10-04T05:25:16Z"
review_passes: 1
id: "0642"
title: Fix add-screenshot button on installed PWA (macOS)
type: bug
status: review
priority: p2
area: [mobile, macos]
assigned_to: ai
created_by: hello@repoos.org
branch: hotfix/0642-fix-add-screenshot-button-on-installed-p
review_cli_override: cursor
review_model_override: composer-2.5
hotfix: true
hotfix_target: branch
created_at: "2026-10-04T05:04:17Z"
---
## Problem
The "add screenshots" buttons do not work on an installed PWA on macOS. The issue affects both the New Task and New Input panels.

## Desired UX
On an installed PWA running on macOS, tapping the "add screenshots" buttons in the New Task and New Input panels successfully triggers screenshot capture/selection.

## Acceptance criteria
- [ ] Add-screenshot button works in the New Task panel on installed PWA (macOS)
- [ ] Add-screenshot button works in the New Input panel on installed PWA (macOS)
- [ ] Confirm no regression on non-PWA / non-macOS environments if checked

## Notes for AI
Assumed: the failure is specific to PWA-installed behavior on macOS, not a general broken button. No requirement mentioned for changing UI copy, adding new panels, or supporting other OSes. Check how the screenshot trigger interacts with PWA context / installed web app APIs. Do not modify unrelated forms or remove the buttons.

## Scope
Covers: fixing the add-screenshot button behavior in New Task and New Input panels for installed PWA on macOS. Deferred: other OSes, non-PWA browsers, or redesigning the screenshot flow.

## Related
None specified.

## Original prompt

The add screenshots buttons don't seem to work on an installed pwa on this machine (macos). I tried on both new task and new input panels.

## Shots
```json
[
  {
    "label": "New task panel: screenshot dropzone (file picker now opens)",
    "target": "default",
    "route": "/",
    "highlight": ".shot-dropzone",
    "steps": [
      {
        "click": ".new-btn"
      },
      {
        "waitMs": 400
      }
    ]
  },
  {
    "label": "New input panel: screenshot dropzone (file picker now opens)",
    "target": "default",
    "route": "/inputs",
    "highlight": ".shot-dropzone",
    "steps": [
      {
        "click": ".new-btn"
      },
      {
        "waitMs": 400
      }
    ]
  }
]
```

## Activity

- 2026-10-04T05:04:17Z · created · hello@repoos.org
- 2026-10-04T05:04:31Z · status draft→inbox, title, area, type, body
- 2026-10-04T05:05:37Z · review_cli_override
- 2026-10-04T05:05:39Z · review_model_override
- 2026-10-04T05:05:47Z · status inbox→ready
- 2026-10-04T05:11:20Z · branch, hotfix, hotfix_target
- 2026-10-04T05:11:21Z · status ready→active
- 2026-10-04T05:18:57Z · body: section Shots
- 2026-10-04T05:24:45Z · status active→review
- 2026-10-04T05:24:46Z · note: shots: skipped — the diff (0 changed paths) touches no [[preview.paths]] globs — no UI change to capture

