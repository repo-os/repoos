---
id: "0748"
title: "Dev page: list and control dev targets"
type: feature
status: inbox
priority: p1
area: [web, ui]
story: "Dev page: start and manage dev targets"
depends_on: ["0747"]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-09T17:10:39Z"
updated_at: "2026-10-09T17:10:39Z"
---
## Problem

Once dev targets exist on the backend, the user needs a page to see and control them. Without it, starting an HMR server still means a terminal.

## Desired UX

A Dev page lists each project's dev targets with state, a Start, Stop and Restart button, the last few output lines, and an open link for servers. Running targets stay running when the page is closed.

## Acceptance criteria

- [ ] A Dev nav item appears when any project declares dev targets; it is hidden otherwise.
- [ ] Targets are grouped by project and show name, kind, state and label.
- [ ] Start, Stop and Restart work from the page, and the state updates live.
- [ ] Failed targets show the failure reason and the last output lines.
- [ ] Server targets show an open-URL link that opens in a new tab.
- [ ] Layout works at phone width, with no horizontal page scroll.
- [ ] Any confirmation uses the shared dialog components, never native alert or confirm.

## Notes for AI

- Depends on the backend task in this story. Use the API it exposes; do not add a second process path.
- Follow the nav and view conventions in AGENTS.md (router.ts, nav.ts, views/).
- Rebuild the UI after changes with `bun run build:ui`.

## Related

- Story: Dev page: start and manage dev targets

## Activity

- 2026-10-09T17:10:39Z · created · njachowski@gmail.com
