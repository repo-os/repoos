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
ids, and every width (375 / 768 / 1280) must pass a no-overflow audit in which
every visible element sits inside the viewport. The regression test lives in
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
| Inbox phone queue (220 tasks, "Show more" paging) | Fits; count label "24 of 220 tasks" after paging | — | — | Pass |
| Inbox phone queue, search matching nothing | "No matching tasks" + "Clear the filters to see the full queue." | — | — | Pass |
| Inbox phone queue, empty project | "No tasks yet" + "Create a task to start building your queue." | — | — | Pass |
| Search palette with a full result page | Fits; result page capped at 8 rows, dialog inside the gutters | Pass | Pass | Pass |
| Search palette zero results ("No results") | Fits | Pass | Pass | Pass |
| Horizontal page overflow (document scrollWidth) | None on any fixture | None | None | Pass |

## Findings

- **No product defect was found in the three surfaces.** Long titles ellipsize
  or wrap where the design wraps (story names, task-card titles are
  line-clamped; excerpts clamp at two lines), the unbroken token never widens
  any card, column or palette row beyond its container, and no control is
  clipped out of reach at any tested width.
- **Intentional scroll regions:** the phone queue's quick-filter strip
  (`.mobile-chip-row`) is an `overflow-x: auto` chip row by design, exactly
  like the desktop queue's quick-filter strip before it; content beyond the
  right edge is one swipe away and does not widen the page. The audit's
  scroller exclusion matches that intent.
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

No source fix was required; the deliverable from this pass is the committed
regression test, which pins the fit of all three surfaces at 375/768/1280
against 200+-item fixtures and will fail if a future change re-introduces
overflow, breaks one of the audited empty states, or drops the copy-link /
router-link affordances checked here.
