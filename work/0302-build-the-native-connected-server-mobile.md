---
id: "0302"
title: Build the native connected-server mobile shell and four-item navigation
type: feature
status: active
priority: p1
area: mobile
assigned_to: ai
created_by: ""
branch: feat/build-the-native-connected-server-mobile
model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-26T16:39:04Z"
updated_at: "2026-08-27T02:20:14Z"
review_passes: 1
check_retry_count: 2
handoff_signal_retry_count: 1
---
## Problem

The native mobile app has a server picker, but the connected server still needs a purpose-built mobile shell. The desktop topbar/sidebar and five-item navigation do not provide the intended iOS/Android experience.

## Desired outcome

Selecting a server enters a native-feeling server-scoped shell with a compact back/server header and exactly four bottom destinations: Work, Search, More, and Settings. More opens an action sheet containing Agents, Context, Activity, and Server connections.

## Mandatory: use real Ionic Vue components & primitives

This shell MUST be built with the genuine Ionic Vue component library (`@ionic/vue` + its core styles), NOT hand-rolled custom HTML/CSS that merely looks native. Hand-rolled custom components fail the acceptance criteria. Concretely, use Ionic primitives for the parts where native platform behavior matters:

- **`ion-tab-bar` / `ion-tab-button`** for the four bottom destinations (Work, Search, More, Settings) — real Ionic tab bar with native labels/icons and the `ionTabsWillChange`/`ionTabsDidChange` events.
- **`ion-action-sheet`** (or `ion-actionsheet-controller`) for the More sheet — must support native dismissal (swipe down, tapping the backdrop, and hardware/Android back), and the `didDismiss` event. Do not hand-build a fake bottom sheet with a clickaway overlay.
- **`ion-header` / `ion-toolbar` / `ion-back-button`** for the connected-server header — real back button behavior wired to the picker, with the server name/status and a server switcher affordance in the toolbar.
- **`ion-router` / `ion-router-outlet`** (or Vue Router's Ionic integration) so page transitions get native mobile navigation gestures.
- **`ion-content`**, **`ion-page` / `ion-router-view`** for scroll/safe-area handling, and preserve platform safe areas, touch targets, and keyboard behavior via Ionic's built-in handling.

The rule of thumb: if Ionic ships a primitive that provides native platform behavior (tabs, action sheets, headers, back navigation, gestures, safe areas, keyboard), USE THE IONIC component. Use RepoOS custom CSS tokens only for visual styling on top of Ionic primitives — not to reimplement them.

## Acceptance criteria

- [ ] Add `@ionic/vue` and the required `@ionic/core` assets as dependencies and register Ionic in `main.ts` (e.g. `app.use(IonicVue)` + `import '@ionic/vue/css/...'`).
- [ ] Hide desktop-only topbar, sidebar, integration chrome, and five-item mobile navigation in the native mobile shell.
- [ ] Add a native connected-server header using `ion-header`/`ion-toolbar`/`ion-back-button` with back-to-picker behavior, server name, status, and a server switcher affordance.
- [ ] Add exactly four bottom destinations using `ion-tab-bar`/`ion-tab-button`: Work, Search, More, Settings.
- [ ] Implement More as a dismissible `ion-action-sheet` (swipe-down + backdrop + Android-back dismissal, `didDismiss` handled) with Agents, Context, Activity, and Server connections.
- [ ] Wire native mobile navigation gestures/page transitions via Ionic routing (ion-router / router integrations).
- [ ] Preserve platform safe areas, touch targets, keyboard behavior, and Android back navigation via Ionic lifecycle primitives.
- [ ] Keep the mobile app as its own build and reuse shared auth, API, and connection services.
- [ ] Add component/browser coverage for navigation, server switching, action-sheet dismissal, and back behavior.

## Notes

Follow docs/mobile-ux-strategy.md and docs/mobile-architecture.md. Ionic Vue primitives are REQUIRED (not optional) wherever they provide native behavior; this is the whole point of the task — the previous implementation used custom components and needs to be reworked onto real Ionic components. Keep Shell-specific RepoOS custom styling on top.

## Activity

- 2026-08-27T02:19:50Z · body
- 2026-08-27T02:20:14Z · status review→active
