---
id: "0749"
title: "Dev targets: Settings control and user docs"
type: feature
status: review
priority: p1
area: [web, docs]
story: "Dev page: start and manage dev targets"
depends_on: ["0747"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dev-targets-settings-control-and-user-do
created_at: "2026-10-09T17:10:45Z"
updated_at: "2026-10-09T18:43:49Z"
---
## Problem

Dev targets are configured in repoos.toml only. AGENTS.md requires that a user-facing repoos.toml feature has a Settings control, and users need docs for it.

## Desired UX

The Settings page lets the user add, edit, reorder and remove a project's dev targets. A user-facing doc explains what a target is and how to write one.

## Acceptance criteria

- [ ] A Settings control edits the project's `[[dev.targets]]` list, with validation errors shown inline.
- [ ] Changes are written through the config API, not by hand-editing the file.
- [ ] A user doc in user-docs/ describes dev targets, the four fields, and the health check, with an example for a web HMR server and an Android debug build.
- [ ] Tests cover the Settings control's validation and save path.

## Notes for AI

- Depends on the backend task. Use the config schema it adds; do not duplicate its validation.
- Use the shared form classes and dialog components in src/ui-app/src/style.css and components/ui/dialog.

## Related

- Story: Dev page: start and manage dev targets

## Shots
```json
[
{
"label": "Advanced tab: Dev targets card with add/edit/reorder/remove rows",
"target": "default",
"route": "/settings?tab=advanced",
"highlight": ".dev-targets-card",
"steps": [
{
"waitMs": 400
}
]
}
]
```

## Activity

- 2026-10-09T17:10:45Z · created · njachowski@gmail.com
- 2026-10-09T18:02:23Z · status inbox→ready
- 2026-10-09T18:02:24Z · status ready→active, branch
- 2026-10-09T18:27:19Z · body
- 2026-10-09T18:28:14Z · body
- 2026-10-09T18:29:58Z · body: section Shots
- 2026-10-09T18:32:44Z · body
- 2026-10-09T18:34:04Z · body
- 2026-10-09T18:35:25Z · body
- 2026-10-09T18:36:28Z · body
- 2026-10-09T18:43:49Z · status active→review
