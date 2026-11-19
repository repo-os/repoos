# Toasts, banners and dialogs stacking and dismissal — November 2026 (#1225)

## Scope and method

This pass checked the app's three transient surfaces *together* — the shared toast
stack (`ToastPanel`), page-level error/recovery banners, and modal dialogs — for
stacking overlaps, dismissal and keyboard use at 375, 768 and 1280 px. It extends
the earlier toast-only pass (`2026-11-notifications-banners.md`) from a11y
semantics to layout, z-order and dismissal behaviour across screen sizes.

Everything ran headless Playwright WebKit; no visible browser was opened and no
focus was stolen. The app under test is the freshly built `dist/ui` served from a
throwaway empty fixture root through the shared UI harness
(`src/commands/ui-harness.ts` — the same server path `repoos check`'s smoke gate
uses), so the QA never touches the live board. `REPOOS_PREVIEW_CHILD=1` makes
`/api/health` report a preview build, which is what lets `?shotState=` preview
fixtures apply.

A new registered fixture, `toast:stack`, pins the maximum five-toast stack
(error, success and info, one multi-line) *without* `pushToast`'s 6 s auto-expiry
timers, so probes and captures always see the same stack. State that fixtures
cannot model was produced with route interception: failing `/api/board` before
page load creates a real board load-error banner (the fixture-pinned
`work:failedLoad` state cannot model "retry works", because `refresh()`
re-applies the capture fixture at the end of every successful reload by design,
#0782), and aborting `/api/*` after load plus a focus event drives the
`UiRecoveryBanner` offline state over a seeded toast stack.

The scripted pass is `docs/qa/measure-toasts-banners-dialogs.mjs`
(`bun docs/qa/measure-toasts-banners-dialogs.mjs [--shots dir]`); it prints one
JSON finding per check and exits non-zero on failure. Its 63 checks cover:

| Scenario | Checks |
| --- | --- |
| Full `toast:stack` on `/work` at each width | every toast fully in the viewport, no toast-to-toast overlap, no overlap with topbar or mobile tab-bar controls, stack starts below the topbar, bottom-most toast dismisses by real click, a close button dismisses by keyboard (focus + Enter), and every remaining close button is the hit-test target at its own center |
| Board load-error banner (real failed fetch) | the desktop `work-load-error` banner at 768/1280 and the mobile queue's `mobile-work-load-error` state at 375 both fit their viewport, expose a live Retry control, and Retry clears the banner once the failure is lifted |
| `release:updateAvailable` dialog | the update modal fits the viewport at 375 px (it is 370 px wide there), Escape dismisses it, and the Close × dismisses it |
| Task drawer over the seeded toast stack (`/work?task=9001&shotState=toast:stack`) | the drawer's "Close task detail" control is the hit-test target at its center and Escape closes the drawer |
| `UiRecoveryBanner` offline state over the seeded stack | the banner's Dismiss is live and clears it, and no toast close button is dead underneath |
| Notice-bell popover over the seeded stack | with the popover deliberately opened, no toast overlaps it and its controls are live, and closing it (Escape) returns the corner to the stack's default top |

## Findings and fixes

| Finding | Impact | Fix |
| --- | --- | --- |
| The `UiRecoveryBanner` (fixed, top-centered, `z-index: 1000`, width `min(560px, 100vw - 32px)`) covered the entire toast stack at 375 px. All five toasts sat underneath it and every dismiss button failed the hit-test probe — a dead dismiss control behind a banner that can stay up until the server recovers. At 768/1280 the buttons escaped only because the banner is narrower than the stack. | The toasts were unreadable and undismissible for as long as the offline/stale banner stayed up. | `UiRecoveryBanner` now publishes its bottom edge as `--toast-panel-drop-banner` (via `uiRecovery.setToastPanelDrop`, tracked with a `ResizeObserver` so reflow keeps it honest) and clears the var on dismiss and unmount. `ToastPanel`'s top becomes its default plus the larger published drop, so the stack moves below whichever surface is covering it. |
| The notice-bell popover (`.notice-pop`, deliberately opened, top-right) was overlapped by toasts at every width — toasts painted over the popover's header controls. | A user-opened panel was partially covered by transient toasts. | `NoticeBell` publishes the open popover's bottom edge as `--toast-panel-drop-notice` (republished by a `ResizeObserver` because async notice content can grow the popover after the first measure) and clears it on every close path (toggle, outside mousedown, Escape, following a notice) and on unmount. The toast panel takes the `max()` of the two drops, so the banner and popover compose. |
| New fixture `toast:stack` did not exist, so the stacked-toasts case could only be produced one toast at a time. | Stacking could not be reviewed or QA'd. | Registered `toast:stack` in `SHOT_PREVIEW_FIXTURE_IDS` and applied it in `shot-preview-fixtures.ts`, seeding five pinned toasts (no auto-expiry), with a fixture regression test. |
| The dialog scenario's Escape check raced the post-refresh fixture re-application (#0782): `refresh()` re-applies `release:updateAvailable` at the end of every board rebuild, and that re-run sets the dialog's `open` back to true, undoing an Escape pressed inside the initial refresh window (a ~20 ms close→reopen blink the polling wait can miss); a second defect — `page.waitForFunction(fn, { timeout })` passing options as the `arg` parameter — silently made every wait use the 30 s default instead of the intended 5 s. | The scripted pass failed intermittently at the dialog scenario's first Escape press (dialog never observed gone), and real failures would have waited 6× longer than designed. | The script now settles 1.5 s before every keyboard dismissal (dialog Escape, dialog Close ×, drawer Escape) so the press lands after the fixture re-application has settled — the dismissal is then the last state change — with one guarded retry against a lost key event, and every `waitForFunction` passes `undefined` for `arg` so the intended timeouts actually apply. Escape itself was never broken: probes confirmed the dialog closes on Escape and the Close × in the quiescent state. |
| Two more probe-timing races surfaced when the pass was re-run after merging a newer main. The drawer's close button read as "dead" at 375/1280 because the probe fired during the drawer's slide-in animation, while the button's centre was still outside the viewport (`elementFromPoint` → null, the same signature as a real dead control); and the recovery-banner scenario's single focus nudge could join the still-in-flight startup health check, be consumed without a fresh probe ever seeing the aborted API, and leave the banner unraised. | Two scenarios could fail intermittently (or never raise the state they were meant to test), independent of app behaviour. | The drawer scenario now waits for the close button's centre to be inside the viewport before hit-testing it; the recovery scenario nudges focus in a bounded loop until the banner is up (extra nudges are harmless — `showOffline` is idempotent). Verified with instrumented probes that logged the button rect and `elementFromPoint` result frame by frame. |

## Accepted behaviour (checked, not changed)

- **Toast stack under an open task drawer or modal dialog.** The drawer and
  shared dialogs are body-teleported layers painted above the toast stack; with
  the drawer open the toasts are covered, and the drawer's own close control
  stays live (verified). A modal owning the interaction is the intended layering;
  a toast should not paint over a modal.
- **Board banner Retry against a fixture-pinned error.** With `work:failedLoad`
  in the URL, Retry cannot clear the banner because `refresh()` re-applies the
  capture fixture on success (#0782). That is capture-bookkeeping, not app
  behaviour; against a *real* failed fetch (route interception), Retry clears the
  banner on both the desktop and mobile surfaces. The same bookkeeping applies to
  the update dialog: a fixture re-application re-opens it, so the scripted
  Escape/× dismissal checks settle past the initial refresh window first.
- **Toast dismiss buttons are always reachable otherwise.** The stack never
  covers topbar or mobile tab-bar controls, sits 10 px below the topbar at all
  three widths, and toasts never overlap each other.

## Component-level regression tests

`src/ui-app/tests/toast-panel-drop.test.ts` pins the CSS-var contract at the
component level: `setToastPanelDrop` publishes the drop relative to the stack's
default top and clears on `null`, the two vars are independent (clearing one
leaves the other), `UiRecoveryBanner` publishes while visible and clears on
dismiss and unmount, and `NoticeBell` publishes while its popover is open and
clears it when the popover closes through any path and on unmount. The fixture
test in `shot-preview-fixtures.test.ts` asserts the seeded stack survives timer
advance (no auto-expiry was armed).

## Verification

- `bun run build` (including `vue-tsc` and the UI build) — passed, re-run after
  merging main into the branch (main had moved 157 commits; the merge was
  conflict-free and touched none of this task's files beyond bookkeeping).
- `bun docs/qa/measure-toasts-banners-dialogs.mjs` — 63 checks, 0 failed across
  375 / 768 / 1280 px, twice consecutively on the final tree (after the two
  harness-race fixes above; before them the same script reproduced the dialog
  Escape failure twice in a row).
- `bun run test -- src/ui-app/tests/toast-panel-drop.test.ts
  src/ui-app/tests/toast-panel-a11y.test.ts src/ui-app/tests/shot-preview-fixtures.test.ts
  src/ui-app/tests/ui-recovery-banner.test.ts` — 97 tests passed.
- `REPOOS_CHECK_CHANGED=main repoos check` — passed (format, lint, build, CSS
  and contrast guards, branch tests, UI smoke).
