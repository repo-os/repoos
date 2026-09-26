---
id: "0517"
title: Add Escape-to-back with a visible hint in the fullscreen diff view
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-26T09:26:37Z"
updated_at: "2026-09-26T09:28:36Z"
---
## Problem

The fullscreen diff view is only escapable with the mouse. Both fullscreen routes — `/tasks/:taskId/diff` and `/repo/commits/:sha`, both rendered by `src/ui-app/src/views/DiffView.vue` with `meta: { fullscreen: true }` — put a single "Back" button at the left of `.diff-page-topbar` and nothing else. Every other "you are in a sub-view" surface in the app already treats <kbd>Esc</kbd> as close (dialogs, the task drawer, dropdowns, the board's two-stage Escape), so the diff view is the one place a keyboard user has to stop and hunt for a 40px-wide target.

## Desired UX

- Pressing <kbd>Esc</kbd> while the fullscreen diff view is open leaves the view, landing on exactly the same place the Back button lands on.
- The Back button stays put, with its existing arrow icon and "Back" label. It remains a first-class way out, not a fallback for a keyboard shortcut.
- A visible hint tells the user the shortcut exists: a small `esc` chip beside (or inside) the Back button, styled as a keyboard key so it reads as a hint rather than a second button.
- The hint is always present and visually secondary — the control still reads as "Back" at a glance.
- Nothing else about the screen changes. Scrolling, panning, file switching, the minimap, and full-file expansion all behave as they do today; <kbd>Esc</kbd> is the only newly bound key.

## Acceptance criteria

- [ ] Pressing <kbd>Esc</kbd> anywhere in the fullscreen diff view navigates back via the same code path as the button (the existing `goBack()` → `router.back()`), producing an identical destination.
- [ ] The keydown listener is added on mount and removed on unmount, so it does not fire after the user has left the view or stack up across navigations.
- [ ] The Back button is still rendered, still in the same position, and still works on click — unchanged label, icon, and styling.
- [ ] An `esc` hint is visible next to the Back button, styled as a key chip: monospace, faint text, subtle border — visually consistent with the existing `kbd` chip treatment in the app rather than a new bespoke colour.
- [ ] <kbd>Esc</kbd> does not navigate back when an editable element (input, textarea, or `contenteditable`) holds focus, so typing is never interrupted by a surprise navigation.
- [ ] No other key navigates away. In particular the existing file-navigation keys keep their current behaviour.
- [ ] `repoos check` passes, and a UI test asserts both that <kbd>Esc</kbd> goes back and that the hint is present.

## Notes for AI

**Files to touch**

- `src/ui-app/src/views/DiffView.vue` — the listener and the hint markup. The back handler already exists as `goBack()`; the Escape path should call it rather than re-implementing `router.back()`, so button and key can never drift apart. The chip belongs inside `.diff-page-topbar`, next to `.diff-back-btn`.
- `src/ui-app/src/style.css` — reference only. The existing `.search-input kbd` chip (mono font, faint colour, 1px `--border`, 4px radius) is the visual precedent to match; do not modify that rule. The chip's own styling can live in DiffView's existing `<style scoped>` block, where `.diff-back-btn` and `.diff-page-topbar` already are.

**Conventions to follow**

- Match the established Escape pattern in this codebase: a named handler plus `onMounted(() => window.addEventListener("keydown", onKey))` / `onBeforeUnmount(() => window.removeEventListener("keydown", onKey))`. See `src/ui-app/src/components/DirtyMainDialog.vue` and `src/ui-app/src/components/StopWorkConfirmModal.vue`. `DiffView.vue` will need `onBeforeUnmount` added to its existing `vue` import.
- Gate on an interactive-focus check before navigating — reuse the idea of `isInteractiveTarget` from `src/ui-app/src/composables/useBoardKeyboardNav.ts` (a local check is fine; do not import the whole composable).
- The `AGENTS.md` dropdown / shared-form-class / Teleport conventions are not in play here: this is a fullscreen page, not a drawer, and there is no overlay being added.
- The commit diff route (`/repo/commits/:sha`) shares this component, so it inherits the behaviour for free. That is intended — no extra work, but call it out in the PR description so the reviewer knows it was deliberate.

**Assumptions** (pick these defaults rather than asking)

- "Go back" means the same destination the Back button gives: `router.back()`. Do not add a hardcoded fallback route for a missing history entry — the button has no fallback today, and matching it exactly is the requirement.
- The hint is static, plain text, and always visible. Not hover-only, not first-visit-only, not dismissible.
- Copy: lowercase `esc`, as the user phrased it. Keep it to that one word — the surrounding button label stays "Back".
- Run `bun run build:ui` afterwards so the worktree build is fresh. Do not request a preview as part of finishing.

**Not in scope**

Do not add other shortcuts (`j`/`k`, arrow keys, `q`). Do not add a global Escape handler to `useBoardKeyboardNav` — that composable drives the board and is not the surface mounted on a fullscreen route. Do not change the router, the `fullscreen` route meta, or the Back button's destination.

## Scope

This task covers the Escape key binding in the fullscreen diff view, the visible `esc` hint beside the Back button, and test coverage for both.

Deferred: a repo-wide Escape convention (so every fullscreen view and panel follows one documented rule), and any hint or shortcut surface for the other keys the diff view will eventually bind.

## Related

- `src/ui-app/src/router.ts` — the two `fullscreen: true` routes this component serves.
- `src/ui-app/tests/diff-view-syntax.test.ts` — existing DiffView test; the natural neighbour for this coverage (or a sibling `diff-view-escape.test.ts` if it keeps things tidier).
- `src/ui-app/src/composables/useBoardKeyboardNav.ts` — the app's existing Escape semantics and the interactive-target check to mirror.
- `AGENTS.md` — the "after ANY UI change, rebuild" rule, and the runtime/test commands (`bun run build:ui`, `bun run test`).

## Original prompt

When I'm in the fullscreen diff view I'd like to be able click escape key to go back instead of needing to click the "back" button, but keep the back button and also show a hint that `esc` also goes back.

## Screenshots

![Screenshot-2026-09-26-at-17.25.28](/api/tasks/0517/attachments/screenshot-1.png)

## Activity

- 2026-09-26T09:26:37Z · created · hello@repoos.org
- 2026-09-26T09:26:40Z · screenshots
- 2026-09-26T09:27:36Z · status draft→inbox, title, area, body
- 2026-09-26T09:28:36Z · status inbox→ready
