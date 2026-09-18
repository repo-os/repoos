---
id: "0402"
title: "The settings page is getting very long, let's add tabs"
type: feature
status: review
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/0402-settings-tabs
created_at: "2026-09-18T04:37:15Z"
updated_at: "2026-09-18T05:41:48Z"
---
## Problem

The Settings page (`src/ui-app/src/views/SettingsView.vue`) is getting very long with many sections:
- General
- Themes
- Service Settings (publishing, remote validation)
- ntfy Notifications
- Authentication
- Voice transcription
- Attention Notifications
- Board
- Advanced (collapsible)
- Raw repoos.toml

This creates excessive scrolling and visual clutter. Users need a way to organize and quickly navigate to their relevant settings.

## Desired UX

- Settings page has a tabbed interface at the top
- Each logical group of settings is in its own tab
- Tabs work via deep-link URLs like `/settings?tab=general` or `/settings?tab=advanced`
- The active tab is persisted in the URL query string
- Users can jump to specific settings sections directly from links/bookmarks

## Proposed tab structure

1. **General** — Theme swatches, general config fields, service settings
2. **Notifications** — ntfy, attention notifications (sound/push, event types)
3. **Security** — Authentication, Voice transcription
4. **Advanced** — Guarded fields, raw repoos.toml editor

## Acceptance criteria

- [ ] Settings page has tabbed navigation at the top
- [ ] Each tab contains the relevant settings groups
- [ ] Tab selection updates the URL query string: `/settings?tab=<name>`
- [ ] URL query string persists the active tab on reload
- [ ] Deep-links like `/settings?tab=general` open the correct tab
- [ ] Tab names are consistent with the new groupings
- [ ] UI is responsive and accessible (keyboard navigation, ARIA labels)
- [ ] `repoos check` passes

## Notes for AI

**Files to modify:**
- `src/ui-app/src/views/SettingsView.vue` — main file to refactor
- `src/ui-app/src/router.ts` — add route parameter support for tab deep-links

**Design approach:**
- Use a simple tab component (can be custom or borrow from existing UI patterns)
- Each tab renders a subset of the current settings cards
- Tab selection is driven by `route.query.tab` with `general` as default
- URL update should use `router.replace()` to avoid polluting history

**Tab groupings suggested:**
| Tab | Contents |
|-----|----------|
| General | Themes, Service Settings (tunnel, remote validation) |
| Notifications | ntfy, Attention Notifications (sound/push/events) |
| Security | Authentication, Voice transcription |
| Advanced | Guarded fields, Raw repoos.toml |

**Implementation tips:**
- Keep the existing `form` reactive object and auto-save logic unchanged
- Maintain existing deep-link `?focus=<key>` behavior alongside `?tab=<name>`
- Ensure tab names are stable IDs (no user-facing text that might change)
- Consider accessibility: `role="tablist"`, `role="tab"`, keyboard navigation (arrow keys)

## Activity

- 2026-09-18T04:37:15Z · created · hello@repoos.org
- 2026-09-18T13:26:00Z · status draft→ready
- 2026-09-18T05:36:36Z · status ready→active
- 2026-09-18T05:41:48Z · status active→review
