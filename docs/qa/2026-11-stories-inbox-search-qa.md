# Stories, Inbox and Search QA with many items — November 2026 (#1237)

## Scope and setup

QA pass over the three surfaces the task names — the Stories page (list, side
panel and its empty states), the Inbox queue (desktop filtered board and the
phone queue), and the Search palette — rendered with **fixtures, not live
data**: 32 registered stories built from 256 tagged tasks for Stories, 220
inbox-status tasks for both Inbox compositions, and the same 220 tasks as the
Search source. Every fixture includes ordinary long multi-word titles plus one
~170-character unbroken token, the worst case for CSS wrapping.

All rendering was headless: the real components are mounted in jsdom against
seeded stores and a real memory router, the serialized markup is injected into
headless WebKit (no visible browser, no focus stealing) with the built global
stylesheet plus scoped CSS compiled against the markup's own `data-v` scope
ids, and every width (375 / 768 / 1280) must pass an audit in which every
visible element sits inside the viewport, every button, link, select and input
is fully visible (including inside a scroller, since a clipped filter is one the
reader cannot find), and every internal link resolves to a real route rather
than the app's catch-all redirect to `/`. Controls inside a `position: fixed`
drawer are judged against the viewport, not their scrolling ancestors. The
regression test lives in
`src/ui-app/tests/stories-inbox-search-qa-browser.test.ts` and runs as part of
the normal suite; it prints full-page and fold screenshots per fixture and
width when run with `QA_SHOTS=<dir>`.

One harness lesson from this pass, recorded because it cost the first round:
injecting the built per-view chunk CSS alongside jsdom-captured markup silently
leaves every scoped rule unmatched (the builds and the test runner disagree
about `data-v` scope ids), and a plain `<button>` then sizes to its longest
unbroken token and looks like a page-breaking overflow that does not exist in
the product. The committed test therefore compiles each SFC's style blocks
against the scope ids read from the captured markup itself.

## Results

| Surface / state | 375px | 768px | 1280px | Result |
| --- | --- | --- | --- | --- |
| Stories list (32 cards, long names/excerpts, live rows) | No overflow; names, chips and progress wrap inside the card | Pass | Pass | Pass |
| Story side panel open over the list | Full-screen phone drawer; title wraps, tabs readable | Side drawer | Side drawer | Pass |
| Stories zero state ("No stories yet") | Fits, plain English | — | Fits | Pass |
| Stories all-complete state ("32 completed stories are hidden. Uncheck Hide Completed Stories to see them.") | Fits | — | Fits | Pass |
| Inbox desktop filtered board (220 cards) | — | No overflow; header wraps to two rows | No overflow | Pass |
| Inbox phone queue (220 tasks, "Show more" paging) | Fixed: the Area and Story filters were clipped or off-screen; they now wrap and are fully visible. Count label "24 of 220 tasks" after paging | — | — | Fixed |
| Inbox phone queue, search matching nothing | "No matching tasks" + "Clear the filters to see the full queue." Area filter now fully visible | — | — | Fixed |
| Inbox phone queue, empty project | "No tasks yet" + "Create a task to start building your queue." Area filter now fully visible | — | — | Fixed |
| Search palette with a full result page | Fits; result page capped at 8 rows, dialog inside the gutters | Pass | Pass | Pass |
| Search palette zero results ("No results") | Fits | Pass | Pass | Pass |
| Horizontal page overflow (document scrollWidth) | None on any fixture | None | None | Pass |

## Findings

- **Phone filter row clipped out of reach (fixed).** The phone queue's quick
  filters (Priority, Area, Story) shared one `overflow-x: auto` strip in
  `MobileWorkQueue.vue`. At 375px the Area select was cut off mid-label ("Any a")
  and the Story select sat past the right edge, with no scroll cue, so a reader
  could not reach it. The earlier pass called the strip an intentional scroll
  region; the screenshot shows it is not discoverable. The strip now wraps
  (`flex-wrap: wrap`) and all three filters are visible at 375px.
- **The audit had a blind spot (fixed).** It excluded every horizontal scroller
  wholesale, so a control inside one was never checked. That is why the first
  version of the test passed on the unfixed build. It now checks each control
  against every clipping ancestor, and it asserts the phone Area and Story
  filters are in view. Red check: restoring the old scrolling CSS fails the
  phone inbox case with `clips a control`.
- **Story panel close button (not a defect).** The new control check first
  flagged the × in the story drawer as clipped by the Vue mount container. The
  drawer is `position: fixed`, so no ancestor's scroll box clips it, and the
  fold screenshot shows the × fully visible. The control check now stops at a
  fixed box.
- **Long titles** wrap in story names, excerpts and inbox cards at every width,
  and the unbroken ~170-character token wraps inside its card without widening
  the page. The search palette keeps each result on one line and truncates it
  with an ellipsis; that is intentional for a compact list.
- **Dead links:** none found. Every internal link on the audited pages resolves
  to a real route, and the test now checks this on every case.
- **Links and copy affordances are live:** the filtered board's "Show all
  statuses" (`/work`) and "Client board" (`/client-board`) links are real
  router links, and each story card leads with a labelled copy-link number
  chip (`aria-label="Copy link to story 0001"`). The search palette keeps its
  keyboard legend (↑↓ Navigate / Enter Open / Esc Close) at every width.
- **Empty and no-result copy is plain English** everywhere it is reachable:
  "No stories yet", "All stories are complete … Uncheck Hide Completed Stories
  to see them.", "No matching tasks", "No tasks yet", and the palette's
  context-free "No results".

## Follow-up

One source fix: the phone queue's quick-filter row now wraps instead of
scrolling (`src/ui-app/src/components/MobileWorkQueue.vue`). The regression
test pins the fit of all three surfaces at 375/768/1280 against 200+-item
fixtures. It fails if a future change overflows the page, clips a control,
dead-links a route, breaks an audited empty state, or drops the copy-link and
router-link affordances checked here.

Not verified in this pass, and left for a human or a later pass:

- Real devices, real browsers beyond WebKit, a live `repoos serve`, and real project data.
- The dark theme and the other UI themes. The fixtures render the default theme only.
- A visual review of the 1280 Stories list. It passed the audit; its screenshot was not inspected.
- The "Hide Completed Stories" checkbox sits on its own line in the all-complete state at 375px and inline in the default state. The markup is the same in both, so this is probably the checked-state styling. It was not investigated.
