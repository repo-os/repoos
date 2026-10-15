---
id: "0800"
title: "Settings: split General into sections, each searchable with its own URL"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/settings-split-general-into-sections-eac
created_at: "2026-10-15T15:15:17Z"
updated_at: "2026-10-15T17:22:55Z"
---
## Problem
The General settings tab is too long to find things quickly. Model routing (Jev / Clef-Flash), for example, sits among unrelated options. Sections are not searchable on their own and have no URL, so you can't link to one the way task URLs work.

## Desired UX
- Split General into focused sections, each with a clear name. Model routing (Jev and Clef-Flash) gets its own section.
- Each section has a unique URL parameter, the same way task URLs work (for example /settings?tab=general&section=model-routing).
- Settings search finds a section by name and by the keys inside it, and opening a result goes to that section's URL.
- The sections are a navigation aid, not a schema change: every setting keeps its key and its existing Settings control.

## Acceptance criteria
- Each section has a stable id and URL parameter; loading the URL opens that section directly.
- Search results link to the section that holds the setting.
- No setting moves out of Settings, and existing settings keep working.
- Tests: section URLs resolve, search maps a key to its section, General and the other tabs still render.
- Light and dark themes checked; keyboard navigable.

## Notes for AI
Start from src/ui-app/src/settings-location.ts (SETTINGS_TABS and location mapping) and src/ui-app/src/views/SettingsView.vue (the General group and section rendering). Source: user request 2026-10-15.

## Activity

- 2026-10-15T15:15:17Z · created · njachowski@gmail.com
- 2026-10-15T17:17:49Z · status inbox→ready
- 2026-10-15T17:17:54Z · status ready→active, branch
- 2026-10-15T17:22:55Z · message_queued at 2026-10-15T17:22:55.051Z
