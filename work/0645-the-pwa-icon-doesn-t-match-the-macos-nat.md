---
id: "0645"
title: Sync PWA icon with macOS native dock icon (light/dark)
type: feature
status: active
priority: p2
area: [web, macos]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/sync-pwa-icon-with-macos-native-dock-ico
created_at: "2026-10-04T07:30:08Z"
updated_at: "2026-10-04T07:52:02Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem
The web PWA icon does not match the macOS native application dock icon. The macOS icon also provides separate light and dark variants, while the PWA currently lacks that parity.

## Desired UX
The PWA manifest/icon assets should match the macOS native dock icon styling, with both a light and a dark version available just like the macOS icon.

## Acceptance criteria
- [ ] PWA icon matches the macOS native dock icon design
- [ ] PWA includes both light and dark icon variants
- [ ] The light/dark variants are used appropriately in the PWA manifest

## Notes for AI
- Assumption: "match" means visual/style parity with the macOS dock icon, not necessarily identical pixel dimensions.
- Do not change the macOS native app icon itself unless required for parity.
- Touch PWA manifest/assets (e.g. manifest, icon files) rather than macOS app bundle unless needed.
- If a new area is needed beyond web/macos, note it here; proposed area fits.

## Scope
- In scope: PWA icon assets and manifest updates for light/dark parity with macOS.
- Deferred: Any redesign of the macOS dock icon itself; broader branding updates outside PWA/macOS.

## Related
- macOS native app icon assets (reference for design parity)

## Original prompt

The PWA icon doesn't match the macos native app dock icon. Can you fix it so they match? (and ideally have both a light and dark version just like the macos icon does).

## Screenshots

![Screenshot-2026-10-04-at-12.59.44](/api/tasks/0645/attachments/screenshot-1.png)

## Shots
```json
[
  {
    "label": "PWA app icon — light variant, matching the macOS dock light artwork",
    "target": "default",
    "route": "/icons/icon-512.png?theme=light"
  },
  {
    "label": "PWA app icon — dark variant, matching the macOS dock dark artwork",
    "target": "default",
    "route": "/icons/icon-512.png?theme=dark"
  }
]
```

## Activity

- 2026-10-04T07:30:08Z · created · hello@repoos.org
- 2026-10-04T07:30:09Z · screenshots
- 2026-10-04T07:30:21Z · status draft→inbox, title, area, body
- 2026-10-04T07:30:35Z · status inbox→ready
- 2026-10-04T07:30:48Z · status ready→active, branch
- 2026-10-04T07:40:10Z · body: section Shots
- 2026-10-04T07:51:12Z · status active→review
- 2026-10-04T07:52:02Z · status review→active
