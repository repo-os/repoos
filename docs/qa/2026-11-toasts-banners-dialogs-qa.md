# QA pass: toasts, banners and dialogs — stacking and dismissal at all screen sizes

Date: 2026-11-19 · Task #1225 · Area: web

## Scope and method

This pass checked the web app's three floating surfaces **together** for the
first time: the toast stack (`ToastPanel.vue`), the recovery banner
(`UiRecoveryBanner.vue`), the notice-bell popover (`NoticeBell.vue`), the board
load-error banners, the release-update dialog and the task drawer. The question
was not whether each works alone, but whether they stack, dismiss and read
correctly when several are up at once, at phone (375 px), tablet (768 px) and
desktop (1280 px) widths.

Method: headless WebKit (Playwright) only, against a throwaway fixture server
started by `docs/qa/measure-toasts-banners-dialogs.mjs`. No visible browser was
opened and no desktop focus was taken. State comes from preview-board fixtures
(primarily the new `toast:stack` fixture, which pins a five-deep stack of
error/success/info toasts without auto-expiry timers, so probes and captures
always see the same stack) plus real pointer and keyboard events.

Re-run with:

```sh
bun run build            # the script serves the built SPA from dist/ui
bun docs/qa/measure-toasts-banners-dialogs.mjs
```

Output is JSON findings on stdout; it exits 1 when any check fails.

## What the checks measure

Every scenario runs at all three widths and asserts:

- **Overlap** — toast-to-toast overlap, toasts covering topbar/nav controls,
  toasts running off-viewport, and hit-testing (`elementFromPoint`) on every
  dismiss control to prove nothing floats over it.
- **Dismissal** — real clicks and keyboard (focus + Enter on a close button,
  Escape) actually remove the right surface; Retry/Dismiss controls clear their
  banner instead of leaving it stuck.
- **Fit** — banners and dialogs stay inside the viewport at each width.

## Findings and fixes

1. **Recovery banner covered the toast stack (fixed).** The banner floats
   top-centered at `z-index: 1000` while the toasts sit at `z-index: 100`; at
   phone widths the banner could sit over the stack and leave the toasts'
   close buttons dead underneath. Fix: the banner publishes its bottom edge as
   a CSS custom property (`--toast-panel-drop-banner`, via
   `setToastPanelDrop` in `uiRecovery.ts`) kept current by a
   `ResizeObserver`, and `ToastPanel.vue` takes the largest published drop as
   extra `top`. Dismissing or unmounting the banner clears the var and the
   stack returns to its default position below the topbar.
2. **Notice-bell popover covered the toast stack (fixed).** Same corner, same
   problem, including popover content that grows after the first measure
   (async notice fetches). Fix: the popover publishes its bottom edge as
   `--toast-panel-drop-notice` and re-measures through a `ResizeObserver`;
   every close path (toggle, outside mousedown, Escape, following a notice)
   clears the var via a `watch` on the open state and on unmount.
3. **No pinning fixture for a full stack (added).** `toast:stack` seeds five
   toasts (mixed severities, one multi-line) directly into the store without
   arming `pushToast`'s 6-second expiry, so QA and screenshots are
   deterministic. Covered by `shot-preview-fixtures.test.ts`.
4. **Board load-error banners** (desktop banner and mobile queue error) fit
   their viewports, their Retry control is live, and Retry clears the banner
   once the failure is lifted (tested by intercepting `/api/board`, since the
   pinned `work:failedLoad` state cannot model recovery by design).
5. **Release-update dialog** fits the viewport at all widths and both Escape
   and the X button dismiss it.
6. **Task drawer over a full toast stack** — the drawer's close button is the
   hit-test target at its own center and Escape closes the drawer.

## Results

Final run: **63 checks, 0 failed** across 6 scenarios × 3 widths
(toast stack layout/dismiss, board banner, release dialog, drawer-over-toasts,
recovery banner over toasts, notice popover over toasts). Notable measured
values: toast panel top gap below the topbar is 10 px at every width; with the
notice popover open the first toast drops to y≈342 at 375 px and returns to
y=64 when the popover closes, confirming the drop var both applies and clears.
No page errors were recorded in any scenario.

## Follow-up notes

The native-app (Hub) surfaces were out of scope for this pass — this task's
area is web. The `setToastPanelDrop` mechanism is generic: any future floating
surface that shares the top-right corner can reuse it instead of hard-coding
z-index workarounds. Auto-expiry timing of toasts was intentionally not
asserted here beyond the fixture's no-expiry behavior.
