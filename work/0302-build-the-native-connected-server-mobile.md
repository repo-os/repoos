---
id: "0302"
title: Build the native connected-server mobile shell and four-item navigation
type: feature
status: ready
priority: p1
area: mobile
assigned_to: ai
created_by: ""
branch: ""
model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-26T16:39:04Z"
updated_at: "2026-08-26T18:14:43Z"
---
## Problem

The native mobile app has a server picker, but the connected server still needs a purpose-built mobile shell. The desktop topbar/sidebar and five-item navigation do not provide the intended iOS/Android experience.

## Desired outcome

Selecting a server enters a native-feeling server-scoped shell with a compact back/server header and exactly four bottom destinations: Work, Search, More, and Settings. More opens an action sheet containing Agents, Context, Activity, and Server connections.

## Acceptance criteria

- [ ] Hide desktop-only topbar, sidebar, integration chrome, and five-item mobile navigation in the native mobile shell.
- [ ] Add a native connected-server header with back-to-picker behavior, server name, status, and server switcher affordance.
- [ ] Add exactly four bottom destinations: Work, Search, More, Settings.
- [ ] Implement More as a dismissible native action sheet with Agents, Context, Activity, and Server connections.
- [ ] Preserve platform safe areas, touch targets, keyboard behavior, and Android back navigation.
- [ ] Keep the mobile app as its own build and reuse shared auth, API, and connection services.
- [ ] Add component/browser coverage for navigation, server switching, action-sheet dismissal, and back behavior.

## Notes

Follow docs/mobile-ux-strategy.md and docs/mobile-architecture.md. Use Ionic Vue primitives where they provide native behavior, with RepoOS custom styling.

## Activity

- 2026-08-26T16:39:04Z · created · unknown
- 2026-08-26T18:14:02Z · status inbox→ready
- 2026-08-26T18:14:34Z · model_override
- 2026-08-26T18:14:43Z · review_model_override
