---
id: "0482"
title: Ship real brand dock icon with light and dark variants
type: feature
status: inbox
priority: p2
area: macos
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-22T14:34:23Z"
updated_at: "2026-09-22T14:35:34Z"
---
## Problem

The macOS app's dock icon doesn't use the real RepoOS brand mark. The border
around the mark renders **white** instead of the colored gradient border the
brand uses, and the ring is not as thick as it should be. The reference for
both is the web app's top-left logo mark (`.logo-mark` in
`src/ui-app/src/components/TopBar.vue` / `src/ui-app/src/style.css`): a rounded
square wrapped in a cyan→violet conic-gradient ring, inset 3px on a 30px mark.

Additionally, `AppIcon.appiconset` ships only a single "any appearance" image
pair (`AppIcon-512.png`, `AppIcon-1024.png`), so the same icon shows in the
Dock regardless of the macOS light/dark theme setting.

## Desired UX

- The Dock icon is the real RepoOS mark: the colored cyan→violet gradient
  border, at the same proportional thickness as the web app's top-left icon —
  not white.
- When the Mac's appearance is set to Light, the Dock shows the light variant;
  when set to Dark, it shows the dark variant. The switch happens
  automatically when macOS appearance changes, while the app is running — no
  restart, no manual toggle.

## Acceptance criteria

- [ ] `AppIcon.appiconset` contains distinct light and dark (luminosity
      appearance) variants at the required sizes (512@1x and 512@2x/1024).
- [ ] The Dock icon switches automatically between the light and dark variants
      when macOS appearance changes while the app is running.
- [ ] The icon artwork uses the real brand mark with the colored gradient
      border — the white border is gone.
- [ ] The colored border's thickness proportionally matches the web app's
      top-left `.logo-mark` ring, verified visually against the web app icon.
- [ ] The icon remains legible at small Dock sizes in both variants.
- [ ] `xcodebuild -project macos/RepoOSHub.xcodeproj -scheme RepoOSHub
      -configuration Debug -sdk macosx -derivedDataPath macos/.derived-data
      CODE_SIGNING_ALLOWED=NO build` passes.

## Notes for AI

- Primary files: `macos/RepoOSHub/Assets.xcassets/AppIcon.appiconset/Contents.json`
  plus the icon PNGs. The `Contents.json` needs `appearances`
  (`luminosity: any/light` and `luminosity: dark`) entries.
- macOS automatically swaps the Dock icon when a dark variant is declared in
  the asset catalog (supported since macOS 11; this app targets macOS 14+).
  Prefer this declarative catalog approach; only fall back to runtime switching
  (observing `NSApp.effectiveAppearance` and setting
  `NSApp.applicationIconImage`) if the catalog route demonstrably fails to
  update the live Dock icon.
- Reference artwork source: the `.logo-mark` SVG cube in
  `src/ui-app/src/components/TopBar.vue` and its styles in
  `src/ui-app/src/style.css` (conic-gradient from 200deg, cyan→violet→cyan;
  `::after` inset 3px on a 30px mark → ring ≈ 10% of the mark's edge). The
  login screen's `.login-logo` is the same mark.
- **Assumptions made (from ambiguous details in the request):**
  - "As thick as it's supposed to be" is interpreted as proportional to the
    web `.logo-mark` ring (3px on a 30px mark, i.e. ~10% of the mark's edge
    length); final call is a visual match against the web app's icon.
  - Light and dark variants share the brand mark and gradient border colors;
    what differs is the inner fill/contrast so the mark reads well against
    light and dark Dock backgrounds.
- `macos/` is a standalone target — `repoos check` does not cover it. Verify
  with the `xcodebuild` build/test commands in `macos/README.md`, not
  `repoos check`.
- Do not touch the web UI's logo or its styles; the web icon is only the
  visual reference.

## Scope

**Covers:** dock icon artwork (light + dark variants) and dynamic appearance
switching for the macOS Hub app only.

**Deferred:** in-app icons, window/document icons, iOS or other targets, and
any change to the web app's icon rendering.

## Related

- `macos/README.md` — build/test commands for the macOS target
- `src/ui-app/src/style.css` `.logo-mark` — reference border gradient and
  thickness

## Original prompt

for the macos app, have both light and dark app icons for the dock (set it dynamically based on the mac theme settings - dark/light). Also make sure to use the real icon, there’s a colored border, not white as it is now, and make sure the colored border is as thick as it’s supposed to be (see the web app top left app icon, use that)

## Screenshots

![Screenshot-2026-09-22-at-12.59.57](/api/tasks/0482/attachments/screenshot-1.png)
![Screenshot-2026-09-22-at-12.56.52](/api/tasks/0482/attachments/screenshot-2.png)
![Screenshot-2026-09-22-at-12.56.43](/api/tasks/0482/attachments/screenshot-3.png)

## Activity

- 2026-09-22T14:34:23Z · created · hello@repoos.org
- 2026-09-22T14:34:24Z · screenshots
- 2026-09-22T14:34:24Z · screenshots
- 2026-09-22T14:34:24Z · screenshots
- 2026-09-22T14:35:34Z · status draft→inbox, title, area, body
