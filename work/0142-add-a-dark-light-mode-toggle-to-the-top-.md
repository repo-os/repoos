---
id: "0142"
title: Add a dark/light mode toggle to the top bar
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/add-a-dark-light-mode-toggle-to-the-top-
created_at: "2026-08-12T12:48:49Z"
updated_at: "2026-08-12T22:30:00Z"
---
## Problem

The dark/light mode toggle is buried in the Settings page. Users must navigate away from their work just to switch color schemes. A lightweight, always-visible toggle in the app chrome would make this a one-click action from anywhere in the UI.

## Desired UX

A compact moon/sun icon button in the TopBar's upper-right corner. It shows the current effective theme as an icon (moon = dark, sun = light) and toggles to the opposite on click. The switch is instant and animated, matching the existing theme transition cross-fade. The button is subtle and minimal — an icon-only toggle that doesn't compete with the search bar or connection indicator.

## Acceptance criteria

- [ ] A moon/sun icon button appears in the TopBar, near the search bar and connection indicator
- [ ] The icon reflects the current effective (resolved) theme: moon when dark, sun when light
- [ ] Clicking the icon toggles to the opposite explicit theme (dark ↔ light) and persists the choice via `PATCH /api/config`
- [ ] If the stored theme is `"system"`, the first click resolves the effective mode and stores the opposite explicit mode (e.g. if system resolves to dark, clicking stores `"light"`)
- [ ] The toggle animates the theme transition the same way the Settings page does (reuse `animateTheme`)
- [ ] Works from every page (dashboard, work, repo, settings, agents) — the TopBar is always visible
- [ ] No new runtime dependency; uses lucide icons already in the project
- [ ] `repoos check` passes

## Notes for AI

- Files to touch:
  - `src/ui-app/src/stores/config.ts` — add a `setTheme(t)` method modeled on `setUiTheme()`: apply with animation, PATCH `/api/config`, rollback on failure
  - `src/ui-app/src/components/TopBar.vue` — import `{ Moon, Sun }` from `lucide-vue-next`, add the toggle button between the `.spacer` and `SearchBar` (or after `SearchBar` before the connection indicator), use `config.applyTheme` / `config.setTheme` from the `useConfigStore`
- Store the explicit dark/light value; do not toggle back to `"system"` — once the user clicks the toggle they are making an explicit choice
- The `theme` config key already exists in the schema (`"dark" | "light" | "system"`); no server-side changes needed
- The `repoos check` smoke test runs a headless browser; the toggle must render without console errors

## Scope

- In this task: the icon toggle in the TopBar, store method for persisting theme, icon reflecting effective mode
- Out of scope: changing the Settings page theme picker, adding a three-way toggle (system/dark/light), keyboard shortcuts

## Related

- 0007: create-a-light-mode-and-set-theme-in-tom
- 0032: add-a-clear-design-theme-and-a-classic-clear-theme-toggle

## Activity

- 2026-08-12T12:48:49Z · created · unknown
- 2026-08-12T12:49:04Z · status inbox→ready
- 2026-08-12T13:10:44Z · status ready→active, branch
- 2026-08-12T13:21:36Z · status active→review
- 2026-08-12T22:30:00Z · status review→done
