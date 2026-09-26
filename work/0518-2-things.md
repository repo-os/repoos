---
id: "0518"
title: "Fix Hub sidebar server rows: stack alert badges when narrow, and stop the accent bar shifting the icon"
type: bug
status: inbox
priority: p2
area: macos
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-26T09:41:44Z"
updated_at: "2026-09-26T09:43:33Z"
---
## Problem

Two layout defects in the Hub's sidebar server row (`ServerSidebarRow` in
`macos/RepoOSHub/ServerSidebarView.swift`), both of which show up as soon as the
sidebar is resized:

1. **The alert badges end up on top of the server name once the sidebar is
   narrow.** The row is one `HStack(spacing: 10)` — accent bar, icon button,
   name + subtitle, then `InfoOrBadgesTrigger` pinned to the trailing edge with
   `.fixedSize()`. The badges are the only part of the row that refuses to
   shrink, so as the split view narrows they are drawn over the name instead of
   the name yielding space. The address line (`sidebarSubtitle`, which falls
   back to the origin host whenever the server has no distinct repository name)
   competes for the same horizontal space, and the name is what loses. At
   comfortable widths the current arrangement is fine and should stay as-is.

2. **The accent color bar shifts everything else in the row.** When
   `entry.accentColorHex` is set, the 4pt-wide `RoundedRectangle` is inserted as
   a sibling in that same `HStack`, so it consumes its own 4pt *plus* 10pt of
   `HStack` spacing and pushes the server icon, the name and the badges roughly
   14pt to the right. Rows with a color and rows without one no longer line up:
   the green/red server icon sits at a different x depending on whether a color
   happens to be configured for that server.

Net effect: at exactly the width where the sidebar is hardest to read, the
server name can be hidden and the icon column is ragged.

## Desired UX

**Alert badges**

- **Wide sidebar (today's default, the split view at its normal/large width):
  unchanged.** Badges sit on the trailing edge of the row, on the same line as
  the server name, with the repository/address subtitle still visible underneath.
- **Narrow sidebar:** the row switches to a compact two-line form —
  - line 1: the server name, truncating with an ellipsis if it has to, never
    covered;
  - line 2: the alert badges, directly below the name and left-aligned with it;
  - the repository/address subtitle is **not** shown in this form.
- The switch is a pure consequence of the available width — there is no new
  setting to flip, and both forms are internally consistent: whatever width the
  user drags to, the name and every badge are fully readable.
- Everything *about* the badges is unchanged: same colors (blue = in review,
  orange = needs input, purple = active agents), same `9+` cap, same monospaced
  digits, same hover tooltips, same per-server counts, and the same
  `info.circle` → details-popover affordance for a server with nothing to count.
  Hovering the badges in either layout still opens the existing details popover.
- The switch is stable while the splitter is being dragged: no flicker, no rapid
  toggling between the two forms, no frame where the name or the badges vanish.

**Accent bar**

- The color bar is purely additive decoration. Whether or not a server has an
  accent color, its server icon (or its custom SF Symbol, when one is
  configured), name and badges start at exactly the same x position.
- Adding or removing a color on a server changes only whether the 4pt bar is
  drawn — it never reflows the rest of the row, and neighbouring rows stay
  aligned with each other.
- The bar is no taller than the row it decorates: in the compact two-line form
  it grows to match the row rather than staying a fixed 30pt island.

## Acceptance criteria

**Layout decision is testable**

- [ ] The compact-vs-standard decision lives in a small pure helper (e.g. an
      enum plus a static function, next to `ServerSidebarStatus` /
      `ServerAccentColor` in `ServerSidebarView.swift`) that takes the row's
      available width plus the widths it needs and returns which layout to use.
- [ ] It is unit-tested in `macos/RepoOSHubTests/`, covering: wide enough →
      badges trailing on the name's line; too narrow → badges on their own line
      below the name; and a small allowance in the decision so a count crossing
      a digit (or becoming `9+`) does not flip the layout back and forth at the
      boundary.

**Badges**

- [ ] At a wide sidebar width the row renders as it does today: badges on the
      trailing edge, subtitle still shown.
- [ ] At a narrow sidebar width the badges render on a second line below the
      server name, left-aligned with the name, and the subtitle line is not
      rendered.
- [ ] In both layouts the server name is fully visible, or truncated with an
      ellipsis — never overlapped, clipped, or covered by a badge.
- [ ] Badge appearance is untouched: blue/orange/purple tints, `9+` above 9,
      monospaced digits, white text on a capsule, `.help(...)` labels.
- [ ] A server with no counts still shows the `info.circle` affordance in the
      compact form, in the position the badges would occupy.
- [ ] Hovering the badges (or the `info.circle`) in either layout still opens
      the existing `ServerDetailsPopover`; the `.help("Server details")` text and
      the `isShowingDetails` behavior are preserved.
- [ ] Dragging the sidebar continuously from wide to narrow and back produces
      no flicker and no rapid layout toggling.

**Accent bar**

- [ ] The bar no longer participates in the row's `HStack` layout — it is drawn
      as a decoration (overlay/background) so its siblings' positions are
      identical with and without a color.
- [ ] With two rows side by side, one with an accent color and one without, the
      server icons share the same horizontal position, and the name/badge
      columns begin at the same x, at the same sidebar width.
- [ ] The bar keeps its current look otherwise: 4pt wide, `cornerRadius: 2`,
      filled with the entry's accent color, `accessibilityHidden(true)`.
- [ ] The bar's height follows the row (stretching to the row height in the
      compact two-line form) instead of being fixed at 30pt.
- [ ] A server with a custom `iconSymbolName` is positioned identically to one
      using the default `server.rack`.

**Behavior preserved**

- [ ] Row selection (`List(selection:)`), the `.contextMenu` server actions, the
      icon button's hover + `Menu` behavior, the row accessibility label/hint,
      and the sidebar empty-state hint are unchanged.
- [ ] Both `xcodebuild` commands in `macos/README.md` pass (build, then test —
      the new tests plus the existing Swift suite):

```sh
xcodebuild -project macos/RepoOSHub.xcodeproj -scheme RepoOSHub \
  -configuration Debug -sdk macosx -derivedDataPath macos/.derived-data \
  CODE_SIGNING_ALLOWED=NO build

xcodebuild -project macos/RepoOSHub.xcodeproj -scheme RepoOSHub \
  -destination 'platform=macOS' -derivedDataPath macos/.derived-data \
  CODE_SIGNING_ALLOWED=NO test
```

## Notes for AI

- Both changes live in `macos/RepoOSHub/ServerSidebarView.swift`, in
  `ServerSidebarRow` and the helpers it composes: `sidebarSubtitle`,
  `InfoOrBadgesTrigger`, `AttentionSummaryBadges`, `AttentionBadge`,
  `ServerIconView`, `ServerAccentColor`.
- The row measures no width at all today. Add a measurement — `GeometryReader`
  in a `background`, or `ViewThatFits` — and drive the layout choice from the
  available width. **Do not** use `onGeometryChange` or any other newer API:
  `MACOSX_DEPLOYMENT_TARGET` is `13.0` in `macos/RepoOSHub.xcodeproj/project.pbxproj`
  and the app supports macOS 13.
  - `ViewThatFits` on its own will probably not work here: the name/subtitle
    `VStack` carries `.frame(maxWidth: .infinity)`, so it accepts any width and
    "fits" every time. Either measure the width explicitly, or drop the flexible
    frame in the layout being measured.
- For the accent bar, the simplest shape that satisfies the requirement is to
  take it out of the `HStack` and draw it as an `.overlay(alignment: .leading)`
  on the icon button (or on the row, in a frame that never feeds back into
  sibling layout). Either is acceptable — what matters is that no sibling's
  position depends on whether a color is set. Do not reintroduce a conditional
  `if` in the `HStack` that adds layout-affecting children.
- Assumptions I made, called out because the report was brief:
  - "Don't show the server url" is read as: in the compact form, drop the whole
    `sidebarSubtitle` line — the repository name, or the origin host when the
    repository name is missing or identical to the server name — not just the
    URL case. The name wins the space; the badges get the freed line. The
    address is still available on hover, in the details popover, and in
    `ServerSidebarStatus.tooltip`, so nothing becomes unreachable.
  - The compact form is entered by available width, not a magic number, and no
    new user setting is introduced for it.
  - Only the badge *position* changes. The `info.circle` fallback and the
    details popover stay available in both forms.
  - Letting the bar stretch to the row height is my reading of "the color bar is
    just added or removed". If a fixed 30pt height is preferred, keep it fixed
    but keep it vertically centered in the two-line row.
- SwiftUI layout itself is not unit-testable — which is exactly why the criteria
  ask for the width decision to be extracted as a pure function. Keep the
  `HStack`/`ZStack` composition out of the tests.
- The gate for this change is the two `xcodebuild` commands above. The root
  `repoos check` does not compile the macOS target (`macos/` is deliberately
  independent of the TypeScript package), so run both commands before handing
  off — CI (`.github/workflows/macos-hub.yml`) is what would otherwise catch a
  Swift compile error.
- Zero third-party dependencies in `macos/`; do not add one, and do not add a
  snapshot/preview-test harness for this. Verify the two widths by building and
  running the app, or with SwiftUI previews.

## Scope

Covers: the Hub sidebar's server row — badge placement at wide vs. narrow widths,
the compact two-line form, and the accent bar's effect on sibling positions.
Includes the width-decision unit tests.

Deferred / out of scope:

- The pinned-task rows (`PinnedContextSidebarRow`) keep their current layout.
- What the badges count, the `GET /api/hub/v1/summary` contract, summary refresh
  policy, notifications, and the Dock badge total.
- Sidebar column width defaults/min/max and the `NavigationSplitView`
  configuration in `ContentView.swift` — the fix must work at whatever widths
  the user can drag to, not by constraining the range.
- The per-server details popover, the editor sheet, and the ⌘K command palette.
- The RepoOS web UI's own sidebar in `src/ui-app` — unrelated surface, untouched.

## Related

- `macos/RepoOSHub/ServerSidebarView.swift` — `ServerSidebarRow`,
  `InfoOrBadgesTrigger`, `AttentionSummaryBadges`, `AttentionBadge`,
  `ServerIconView`, `ServerAccentColor`
- `macos/README.md` — the sidebar/attention-summary description and the
  `xcodebuild` build + test commands
- `docs/native-hub-capabilities.md` — the `GET /api/hub/v1/summary` contract
  behind the badge counts (unchanged by this task)
- `.github/workflows/macos-hub.yml` — the macOS CI that runs both `xcodebuild`
  commands
- `work/0508-let-s-add-a-settings-button-to-the-new-r.md` — precedent for
  treating the two `xcodebuild` commands as the gate on a macOS-only change

## Original prompt

2 things:
- when the sidebar is wide enough the current alert counts are fine on the right side, not overlapping the server name/title, but when it becomes narrow they cover the server name, instead I'd like it to move to below the server name (and  don't show the server url), so that way we should always be able to see the server name and alert circles
- when a server has a color selected (vertical color bar on the left) don't add so much padding / spacing between the color bar and the green/red server icon, ideally the server icon (or other icon if changed) should always be in the same position and the color bar is just added or removed but not changing the position of the other items in it's item/block

## Screenshots

![Screenshot-2026-09-26-at-13.34.29](/api/tasks/0518/attachments/screenshot-1.png)
![Screenshot-2026-09-26-at-13.34.55](/api/tasks/0518/attachments/screenshot-2.png)
![Screenshot-2026-09-26-at-13.34.22](/api/tasks/0518/attachments/screenshot-3.png)

## Activity

- 2026-09-26T09:41:44Z · created · hello@repoos.org
- 2026-09-26T09:41:45Z · screenshots
- 2026-09-26T09:41:45Z · screenshots
- 2026-09-26T09:41:45Z · screenshots
- 2026-09-26T09:43:33Z · status draft→inbox, title, area, type, body
