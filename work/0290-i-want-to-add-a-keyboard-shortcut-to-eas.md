---
id: "0290"
title: Add keyboard shortcuts to navigate task list (j/k) and open a task (Enter)
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-08-24T21:39:20Z"
updated_at: "2026-08-25T01:16:12Z"
---
## Goal

Make it fast to move through tasks in a list view using only the keyboard and then open a task, without reaching for the mouse.

## Suggested shortcuts

To keep it familiar (Gmail/GitHub-style), use **j / k** with optional **Shift** for faster movement, and **Enter** to open the highlighted task.

-  — move highlight down one task
-  — move highlight up one task
-  /  — move a page (chunk) at a time
-  — open the currently highlighted task
-  — clear the current highlight / close the open task and return focus to the list

Keep the arrows (/) as an equivalent to / for users who prefer them.

> If the board has global command-palette shortcuts already, prefer reusing/extending those rather than inventing a parallel system. This spec is deliberately arrow/vi-oriented, but the core requirement is: up/down moves focus in the list, Enter opens.

## Requirements

1. The list gains a single, visible highlight (a keyboard focus row), distinct from the hover style.
2. Key handling covers the two task:list views that exist — pick the primary list(s) to wire up and note the others as follow-ups, or implement across all list surfaces if the support is shared.
3. Highlight is constrained to the tasks currently on screen (moves within the visible/loaded list, not into virtualized gaps). Pagination-aware: scrolling or paging updates what is reachable.
4.  opens the highlighted task (same behavior as clicking it).
5.  clears the highlight without opening anything.
6. Shortcuts are ignored when focus is in an input/textarea/contenteditable, so typing task notes is unaffected.
7. The highlighted row is revealed/scrolled into view if it goes off-screen.
8. No change to existing single-key interactions (e.g. any shortcut the app already binds).

## Acceptance criteria

- Focusing a list and pressing / moves a visible highlight; arrows do the same.
- / moves by a larger step.
- Pressing  opens the highlighted task.
- Pressing  clears the highlight.
- Typing inside any text field does not trigger navigation.
- 
  ◆ Build staleness check
  ✔ Build is fresh

  ◆ Lockfile sync check
  ✔ bun.lock matches package.json

  ◆ Full build
copy-assets: dist/.build-info.json → 39daf5d8864a…
vite v8.2.0 building client environment for production...
[2Ktransforming...✓ 1930 modules transformed.
rendering chunks...
computing gzip size...
dist/ui/sw.js                                1.84 kB
dist/ui/index.html                           2.44 kB │ gzip:  0.99 kB
dist/ui/assets/AgentsView-BVi3A_Ug.css       1.91 kB │ gzip:  0.60 kB
dist/ui/assets/SettingsView-roLbzUaK.css     2.26 kB │ gzip:  0.65 kB
dist/ui/assets/ContextView-CNAg6AA9.css      3.59 kB │ gzip:  1.00 kB
dist/ui/assets/LoginView-BaD-twx4.css        4.57 kB │ gzip:  1.36 kB
dist/ui/assets/WorkView-DmwUNrqq.css         5.38 kB │ gzip:  1.34 kB
dist/ui/assets/DashboardView-DRpQdIEJ.css   10.92 kB │ gzip:  2.42 kB
dist/ui/assets/index-Da6NLCGh.css          168.96 kB │ gzip: 29.59 kB
dist/ui/assets/card-CQuuqCMM.js              0.44 kB │ gzip:  0.33 kB
dist/ui/assets/switch-jjww4-p0.js            1.19 kB │ gzip:  0.62 kB
dist/ui/assets/LoginView-C0tw2iqq.js         6.39 kB │ gzip:  2.57 kB
dist/ui/assets/ContextView-BTAJwDe-.js      14.20 kB │ gzip:  5.25 kB
dist/ui/assets/SettingsView-NrmBlKaC.js     18.23 kB │ gzip:  5.84 kB
dist/ui/assets/AgentsView-Dyz5_W69.js       20.84 kB │ gzip:  6.72 kB
dist/ui/assets/DashboardView-DdxYJqZ5.js    23.26 kB │ gzip:  7.37 kB
dist/ui/assets/WorkView-97hkeeuq.js         25.72 kB │ gzip:  8.96 kB
dist/ui/assets/button-D-FBIpyv.js           29.86 kB │ gzip:  9.77 kB
dist/ui/assets/vendor-ui-OqQT_fXJ.js       104.63 kB │ gzip: 34.74 kB
dist/ui/assets/vendor-vue-CobgyEJp.js      107.76 kB │ gzip: 41.83 kB
dist/ui/assets/index-yn551hCa.js           181.30 kB │ gzip: 53.44 kB

✓ built in 625ms
  ✔ Build succeeded

  ◆ CSS layering guard
  ✔ No unlayered universal/bare-element selectors

  ◆ Theme contrast guard
  ✔ Theme tokens have valid button gradients and ≥3:1 contrast

  ◆ Tests

 RUN  v4.1.10 /Users/nick/code/nick/repoos/src/ui-app


 Test Files  99 passed (99)
      Tests  1070 passed | 1 skipped (1071)
   Start at  09:14:40
   Duration  82.82s (transform 1.98s, setup 301ms, import 5.42s, tests 116.36s, environment 35.00s)

  ✔ Tests passed

  ◆ UI smoke test
  ✔ UI smoke test passed

  ── Results ──
  ✔ staleness
  ✔ lockfile-sync
  ✔ build
  ✔ css-layers
  ✔ theme-contrast
  ✔ tests
  ✔ ui-smoke

  All checks passed. passes (build, typecheck, tests, UI smoke test).
- Update UI smoke test or add a focused keyboard test if the harness supports dispatching key events.

## Out of scope / deferred

- Keyboard support in command palette (if separate) unless trivially shared.
- Global shortcuts that work when focus is outside the app/list.
- Mobile/touch (keyboard-driven lists are a desktop affordance).

## Notes

- Area: ui (this is a UI interaction change).
- Confirm the exact list component(s) and whether they share a common keyboard/focus layer before implementing, to avoid duplicating handlers.

## Activity

- 2026-08-25T01:16:12Z · title, body
