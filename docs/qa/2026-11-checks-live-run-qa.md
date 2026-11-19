# Checks page live run view QA

Date: 2026-11-20

## Coverage

Checked the Checks page live run view (the Now tab, its Running checks, Local
check slots and Close-out pipeline sections) and the Test suite output box, at
375, 768 and 1280 px, with headless WebKit. The real `ChecksView` and its live
components mount against four seeded states: **running**, **queued**,
**stalled** and **failed**. The test mocks every API call, and the repo store is
swapped for a seeded stand-in. No check run was started, no visible browser was
opened, and no user browser profile was used.

The test is `src/ui-app/tests/checks-live-run-responsive.test.ts`. Its fixture
data lives in `src/ui-app/tests/fixtures/checks-live-run-states.ts`, and the
page entry is `checks-live-run-responsive.ts` beside it.

## Findings and changes

1. **Running check overflowed its box at phone and tablet widths.** The heading
   row (`Task #id · Handoff · on <machine>`) had no wrap rule and the grid had no
   `min-width: 0`. A machine name with no break point widened the box past the
   viewport, and the progress line escaped the section. The heading now wraps,
   the machine name wraps with `overflow-wrap: anywhere`, and the section grid
   is `minmax(0, 1fr)`.
2. **A failed slot release was silent on the Now tab.** The error from
   "Release slot" only rendered on the Check plan tab, so on the Now tab the dialog
   closed and nothing else changed. A failure now closes the dialog and shows the
   server's message in an alert inside the Local check slots section.
3. **A successful slot release did not say what it did.** The page only refreshed
   the slot list. It now shows a status line naming the slot and PID and saying the
   check process group it held was stopped.

## What passed without change

- All four states stay inside the viewport and inside their own boxes at the
  three widths, with no page-level horizontal scroll.
- The Test suite output box keeps its text inside its own box at all three
  widths, for a long running log and a failed run with a long error path.
- Each state's wording is plain English: "step 3 of 6 · tests 40/120 files",
  "Queue 1 · position 1 · waiting", "No recent heartbeat" with a Release slot
  control, and "#1190 failed" with the error text.

## Cancel and retry on this page

The Checks page has no cancel or retry control for a live check run. The only
action on a live run here is **Release slot** for a wedged local slot, which asks
for confirmation first. Cancelling a stalled check is on the task card ("Cancel
stalled check"). Cancelling or retrying a close-out is in the bottom integration
status bar. Neither is on this page, so this QA did not test them here. Adding
them to the Checks page would be a product change and is not part of this fix.

## Verification

- `bunx vitest run src/ui-app/tests/checks-live-run-responsive.test.ts` — 9 tests
  pass in headless WebKit: four states at three widths, output boxes at three
  widths, plain-English labels, the release confirmation and the release failure.
- The layout test failed before the fix at 375 and 768 px with the overflow above,
  so it catches the problem it is meant to catch.

## Limits

Everything is synthetic. The states come from fixture data, not a live RepoOS
server, so this does not show what a real stalled check or real failing close-out
looks like on a real machine. The machine name and error path are deliberately
unbroken to test the worst case; real hostnames are usually shorter. Screenshots
were not taken; the assertions are on measured boxes and text.
