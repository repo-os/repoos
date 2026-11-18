## TL;DR

Task 1194 was a p2 QA pass over the Work board's filters, sort, held/human toggles and column views at desktop width and 375px. The engineer drove the auth-less dev server with headless Playwright at both widths, verified that filtering, toggles, sort and persistence behaved correctly, and found no reproducible defect — so no code fix shipped. The deliverable is the QA evidence document `docs/qa/2026-11-work-board-filters.md`, which records the live observations separately from the behaviors already covered by existing repo tests, and explicitly notes that live drag-and-drop was not exercised because a drop would mutate real task data in the worktree. Review passed on the first pass and the task closed out cleanly.

## Outcome

What shipped:

- `docs/qa/2026-11-work-board-filters.md` (+38 lines), the QA record for this pass.
- No source-code changes: the existing implementation and test suites were found to cover the behaviors under scrutiny (status-filter counts, independent Human/Held filters with visibility persistence across reload, sort persistence, collapse behavior, and board-column drag/drop semantics via `src/ui-app/tests/board-column-drop.test.ts`).

Live verification performed (headless Playwright, WebKit, auth-less dev server from the task worktree):

- At 1440px: board, sort selector, board/pipeline switch and Human/Held controls rendered; each visibility control was clicked, its `aria-pressed` state asserted, and the page reloaded to confirm both off states were restored. Document width equaled viewport width.
- At 375px: the dedicated mobile queue rendered with search and the Show/Updated/priority/area/story/assignment filters; the filter strip scrolls horizontally while the page itself stays within the 375px viewport. No page errors during initial rendering.

Final verdict: **good to go** (review pass 1), closed out successfully (release:success).

## Process stats

| Metric | Value |
| --- | --- |
| Engineering rounds | 1 |
| Review passes | 1 (verdict: good to go) |
| Wall-clock, created → done | 7 minutes (2026-11-18T18:47:40Z → 2026-11-18T18:54:40Z) |
| Engineer agent | `engineer`, model gpt-6-luna, 205s elapsed, 1,107,496 tokens |
| Reviewer agent | `reviewer`, model gpt-6-luna, 16s elapsed, 94,857 tokens |
| Routing sessions | 2 (openrouter model router; model "unknown", 0s each) |
| Restarts / agent swaps | None recorded |
| Cost | Not recorded (sessions table shows no cost figures) |
| Close-out gate | Completed in 79s |

Total recorded agent tokens: 1,202,353 (engineer + reviewer; routing sessions had no token figures).

## What went wrong

Nothing failed. Specifically:

- No crashes, stalls, failed handoffs, or flaky checks are recorded. The task went created → active → review → done in a single uneventful run, with review passing on pass 1 and the close-out gate completing on its own in 79s.
- One deliberate limitation, not a failure: live drag-and-drop was **not** exercised. Dropping a card against the repository-backed server would have written a real task status change into the engineer's worktree. This was resolved by relying on the existing `board-column-drop` test suite and recording the limitation explicitly in the QA doc.

## Learnings

- **Responsive regression target:** at phone width the Work view intentionally switches to the task queue, and its filter panel scrolls horizontally by design. The regression to guard is *page-level* overflow (document width > viewport), not internal horizontal scrolling of the filter strip. Worth a line in `docs/agent-ui-and-preview-conventions.md` if not already covered.
- **Live QA vs. repo-backed data:** board interactions that mutate state (drag/drop, status changes) shouldn't be driven against a worktree's real repository. Use repo tests or a disposable fixture-backed server for isolated live drag testing. This belongs in `docs/agent-ui-and-preview-conventions.md` (or a debugging/QA doc) as a standing convention for QA passes.
- **Existing test coverage can make a QA pass a no-code-change outcome** — and that's a valid result. The QA doc's separation of "observed live" vs. "verified by repo tests" is a good template for future QA tasks.
- **Filter-count consistency:** the status-filter chip count uses the same filtered list as the visible cards (Human/Held hidden IDs composed before rendering), avoiding count/card mismatch. Useful context for anyone touching `WorkView`.

## Follow-ups

None — no linked tasks were recorded for this task.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
