---
id: "0255"
title: User can have up to 3 favorite themes
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/user-can-have-up-to-3-favorite-themes
model_override: deepinfra/deepseek-ai/DeepSeek-V4-Pro-0813
created_at: "2026-08-19T07:46:22Z"
updated_at: "2026-08-31T04:15:55Z"
---
**Goal**

Let users star up to 3 favorite design themes in Settings; starred themes appear in the sidebar quick theme switcher instead of the current hardcoded list.

**Context (current behavior)**

- Design themes are `classic | clear | gen z | jelly`, applied via `config.uiTheme` (`src/ui-app/src/stores/config.ts`, persisted to `localStorage["repoos.uiTheme"]`).
- The sidebar (`Sidebar.vue` `.theme-switch`) hardcodes all 4 themes as buttons — there is no favorites concept and no theme list in Settings (`SettingsView.vue` has no theme section today).

**Requirements**

1. Settings page gains a "Themes" section listing all 4 themes with a live preview or swatch, the active one marked.
2. Each theme row has a star toggle. Starring a 4th theme is rejected with inline feedback ("Up to 3 favorites"); un-starring always works.
3. Favorites persist per browser in `localStorage` (e.g. `repoos.favoriteThemes`), consistent with how `repoos.uiTheme` is stored — no server API change.
4. Sidebar quick switcher shows ONLY the starred themes (in star order); if fewer than 1 starred, fall back to showing all themes as today.
5. The active theme always remains switchable; starring/unstarring never changes the currently applied theme.
6. State syncs through the existing config store; both Settings and Sidebar stay reactive to the same favorites array.

**Acceptance criteria**

- Starring 3 themes shows exactly those 3 in the sidebar switcher.
- A 4th star attempt is blocked with visible feedback; nothing silently dropped.
- Un-starring a theme removes it from the switcher; reloading the page preserves favorites.
- Empty-favorites state falls back to the current 4-button behavior.
- `repoos check` passes with existing tests plus new store/UI tests for the favorites cap.

## Original prompt

User can have up to 3 favorite themes that they can star from settings page theme list, these 3  will show in the quick switcher on the sidebar.

## Activity

- 2026-08-19T07:46:22Z · created · unknown
- 2026-08-19T07:46:33Z · model_override
- 2026-08-31T02:56:00Z · body
- 2026-08-31T02:57:34Z · title, branch
- 2026-08-31T02:57:52Z · status draft→inbox
- 2026-08-31T02:58:04Z · status inbox→ready
- 2026-08-31T03:01:09Z · model_override
- 2026-08-31T03:02:11Z · status ready→active
- 2026-08-31T03:10:30Z · status active→review
- 2026-08-31T04:15:55Z · status review→done, release:success
