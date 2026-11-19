# Work board drag, status moves and bulk actions with failures — QA pass, November 2026

Task #1235. Scope: the Work board's status changes (drag/drop, the drawer
dropdown and the card action buttons), the close-out drag to Done, and the
board's one bulk control ("Collapse empty columns") when the server rejects
the move — a blocked transition, a dirty `main`, a worktree conflict, or a
slow/hung request. Method: fixtures and mocked rejections only, headless
Playwright WebKit; no visible browser was opened, no real task was moved, and
`repoos.toml` was not touched.

## Method

- Interaction assertions run on the real `BoardColumn`, `TaskCard`,
  `ToastPanel`, `DirtyCheckoutDialog`, `WorktreeHandoffConflictDialog` and
  store in jsdom with a stubbed `fetch`/`EventSource`
  (`src/ui-app/tests/work-board-moves-qa-browser.test.ts`).
- The same failing states are then serialized and rendered in headless WebKit
  with the real built global stylesheet inside a minimal app shell, and audited
  at 375, 768 and 1280 px: every visible element must stay inside the viewport,
  the document must not widen, and each rejection must read as plain English
  with the next step. `QA_SHOTS=<dir>` saves screenshots.
- Existing suites (`board-column-drop`, `board-keyboard-nav`,
  `mobile-work-queue`, `start-work-pending`, `board-agent-safety`,
  `stop-work-confirm`, `worktree-handoff-conflict-dialog`) re-ran green after
  the changes below.

## Findings and fixes

1. **A drag to Done refused for a dirty checkout was completely silent (fixed).**
   `BoardColumn.onDrop` caught the rejection and called `repo.onError`, which
   deliberately swallows `DirtyCheckoutError` and
   `WorktreeHandoffConflictError` because the card and drawer answer them with
   confirmation dialogs — but the board column mounted neither dialog, so a
   drag-to-done that hit a dirty `main` (0204/#0512) or a
   worktree-changed-after-handoff conflict (#0598/#0834) showed nothing at all:
   no dialog, no toast, task still in Review. BoardColumn now opens the same
   `DirtyCheckoutDialog` / `WorktreeHandoffConflictDialog` the card and drawer
   open, with commit/discard/send-back/cancel handlers, a `closeOutBusy` guard
   against double drops, and a fallback toast if the task left the board while
   the request was in flight. Regression tests cover dirty `main`, dirty task
   worktree, handoff conflict, commit-and-retry, and cancel-keeps-in-review.
2. **A forced drop could bypass the dragover refusal (fixed).** The hover cue
   (`dropCheck`) and the drop path duplicated but slightly diverged checks, so
   a drop event that slipped past `dragover` (programmatic drops, drag-source
   quirks) fell through to a bare `setStatus` and only the server's technical
   400 surfaced. Both now share one `moveRejection(task, toColId)`; the drop
   throws the same plain-English reason the cue shows, and the existing
   toasts-on-error path surfaces it.
3. **Everything else already met the bar** and is now pinned by tests:
   - Blocked moves: hovering an invalid column toasts the reason the moment
     the drag enters, with the next step ("use Stop work instead"); the column
     refuses the drop natively (`dropEffect: none`, no `preventDefault`).
   - Failed moves: the server's reason is toasted verbatim, the task object is
     never locally moved (snap-back is structural — no optimistic writes on
     the board), and the review column's card keeps rendering in place.
   - Unreachable server: "Can't reach the RepoOS server — it may be offline.
     Start the server, then reload." — not the browser's "Failed to fetch".
   - Slow moves: a Start that hangs leaves the card in place, blocks a second
     start (no double request), and once the server answers without the board
     updating, the 45 s watchdog says "refresh the board if the task did not
     move". A hung request that never answers is itself a finding — see Limits.
   - Close-out failures: generic failures land as the inline `DoneErrorCard`
     with cause + next step (hint inside the expanded panel), never a toast.

## Rendered checks (WebKit, 375 / 768 / 1280 px)

- Rejection toast over the board: fits at all three widths (the panel is
  `min(360px, 100vw − 28px)`), message readable, both cards still in their
  original column — nothing half-moved.
- Dirty-`main` dialog: title, file count, file list and the
  "Commit them and continue, or cancel to stay in review." tail all fit at
  375 px; the file list scrolls rather than overflowing.
- Failed close-out on the card: clamped headline at every width; the expanded
  panel carries the full reason and the "Fix the failure … then retry" step.
- Mobile queue (touch alternative): rows and status pills fit at 375 px; taps
  open the shared drawer, whose status dropdown routes through the same store
  actions the failures above cover.

Keyboard and touch alternatives to drag were reviewed by path rather than by a
new UI: j/k/l/h + Enter (board keyboard nav) opens the shared drawer, whose
status dropdown and card action buttons call the same store actions as drag —
so every rejection UX above applies identically. The keyboard-nav composable
keeps its own suite, and the card action button's failure path (busy cleared,
reason toasted, no stuck state) is now covered directly.

## Bulk actions

The board's only bulk control is "Collapse empty columns", which is
local-only (column collapse state) and touches no endpoint; it was confirmed
unaffected by move failures (the failed task stays visible in its column). As
recorded in the earlier #1217 QA pass, the Work board has no multi-select or
bulk status-change control, so there is no server-backed bulk action to
exercise.

## Limits

- No real task status was changed and no real server was started; all
  rejections are mocked at the HTTP boundary with representative payloads.
- A start request that never settles currently waits without any feedback
  until the socket fails — the watchdog only arms after a response. Coverage
  documents the observable behavior; changing it (a client-side timeout for
  non-GET requests) would affect every mutating endpoint and is out of scope
  for this pass. Filed here as a note, not a defect claim.
- Real-device touch input and screen-reader output were not exercised; the
  touch path is covered as far as tap-to-open-drawer plus the shared failure
  paths.
