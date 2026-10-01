---
id: "0615"
title: Move Hub sidebar alert badges to the URL row
type: feature
status: inbox
priority: p2
area: macos
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-01T15:28:04Z"
updated_at: "2026-10-01T15:29:35Z"
---
## Problem

In the macOS RepoOS Hub sidebar, each server row shows attention/notification count circles (`InfoOrBadgesTrigger`) on the **top** line beside the server name. When the sidebar is narrow, those badges compete with the name for horizontal space and can cover or obscure the RepoOS server name—the label the user cares about most.

The second line already shows secondary text (repository name or origin URL via `sidebarSubtitle`). The user prefers sacrificing readability of that line over losing visibility of the server name.

## Desired UX

- **Top row:** server name only—full width for the name, no alert/count circles on this line. The name should remain clearly readable at typical sidebar widths; badges must not sit on or overlap the name row.
- **Bottom row:** the existing subtitle (URL or distinct repository name) **and** the alert/notification count circles on the **same** horizontal row—badges trailing (same visual language as today: colors, counts, `9+` cap, info affordance, tooltips, details popover).
- **URL/subtitle truncation:** when horizontal space is tight, it is acceptable for the subtitle text to be **partially covered or cut off** by the badges. Prefer an **abrupt clip** (text runs to the edge and is visually cut off) rather than an ellipsis (`…`) on that subtitle line.
- Badge behavior, semantics, and popover/hover interactions stay the same; only **placement** and **subtitle truncation style** change.

## Acceptance criteria

- [ ] In `ServerSidebarRow` (`macos/RepoOSHub/ServerSidebarView.swift`), alert/count circles render on the **bottom** row with the subtitle, not on the top row with `entry.name`.
- [ ] The server name row has no overlapping alert badges at sidebar widths where the problem was reported (including the layout shown in task #0615 screenshots).
- [ ] The bottom row lays out subtitle text leading and badges trailing; partial obstruction of the subtitle by badges at narrow widths is expected and acceptable.
- [ ] Subtitle text uses clip-style truncation (no ellipsis on that line); assume SwiftUI `truncationMode(.tail)` with layout that clips, or equivalent—document the choice in code if not obvious.
- [ ] Compact vs standard width behavior from #0518 is updated so it does not contradict this design (e.g. hiding the URL on line 2 while badges sit alone below the name is no longer the desired narrow layout unless explicitly deferred in Scope).
- [ ] `ServerSidebarRowLayoutTests` (and any related layout helpers) are updated for the new row geometry and badge placement; tests pass.
- [ ] `user-docs/macos-hub.md` sidebar badge description matches the new placement if it still describes badges on the name row.

## Notes for AI

- Primary files: `macos/RepoOSHub/ServerSidebarView.swift` (`ServerSidebarRow`, `ServerSidebarRowLayout`, `InfoOrBadgesTrigger`), `macos/RepoOSHubTests/ServerSidebarRowLayoutTests.swift`.
- **Assumption:** this placement applies to the normal two-line server row for all sidebar widths unless a separate compact form remains necessary for extreme narrow widths—in that case, still keep badges off the name row and pair them with whatever subtitle/URL line is shown; do not revert to badges beside the name.
- Do **not** change badge colors, count sources, attention polling, or notification settings—layout only.
- Rebuild/run macOS Hub tests as appropriate for the repo’s macOS test target; run `bun run fmt` on any touched non-Swift docs if applicable.
- After UI change, capture or declare shots per AGENTS.md if handoff requires Hub UI evidence (macOS may use manual verification—follow existing Hub task conventions).

## Scope

- **In scope:** Hub sidebar server list rows (pinned and grouped entries using `ServerSidebarRow`).
- **Out of scope:** RepoOS web UI sidebar, mobile Hub, badge semantics, and redesign of badge visuals.

## Related

- #0518 — prior narrow-sidebar work (badges below name, URL hidden in compact form); this task revises that tradeoff.
- Task #0615 — user screenshot of badges overlapping the server name on the top row.

## Original prompt

I want the alert/notification count circles on the sidebar for each server to appear not the top row of each server with the server name, but rather on the bottom row with the url (because I don’t mind if the url is partially obstructed since it’s less important than the RepoOS server name. And probably better not to use ellipsis, just end the url text abruptly (cut-off) .

## Screenshots

![Screenshot-2026-10-01-at-23.24.23](/api/tasks/0615/attachments/screenshot-1.png)

## Activity

- 2026-10-01T15:28:04Z · created · hello@repoos.org
- 2026-10-01T15:28:05Z · screenshots
- 2026-10-01T15:28:40Z · status draft→inbox, title, area, body
- 2026-10-01T15:29:29Z · cli_override
- 2026-10-01T15:29:35Z · model_override
