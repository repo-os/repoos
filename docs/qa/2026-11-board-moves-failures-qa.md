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
  `CloseOutDialogs` (the single presenter for the close-out confirmation
  rejections), `ToastPanel`, `DirtyCheckoutDialog`,
  `WorktreeHandoffConflictDialog` and the store in jsdom with a stubbed
  `fetch`/`EventSource` (`src/ui-app/tests/work-board-moves-qa-browser.test.ts`,
  plus `close-out-dialogs.test.ts` for the record-driven dialog contract).
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

1. **A drag to Done refused for a dirty `main` was completely silent (fixed);
   the same drag refused for a worktree conflict stacked two dialogs (fixed).**
   The close-out endpoint writes its decision record before it throws, and
   `repo.onError` deliberately swallows the two marker error types because they
   are supposed to be answered by dialogs. Of the three Move-to-done surfaces,
   TaskCard opened the handoff-conflict dialog from that record via a watcher,
   but no surface watched dirty-checkout records — so a dirty-`main` drag to
   Done showed nothing at all — and TaskCard's watcher never closed on a
   cleared record, while BoardColumn's round-1 catch opened a second copy, so
   the same rejection could stack two body-teleported overlays whose Escape
   both closed at once. The fix removes per-surface presentation entirely:
   **`CloseOutDialogs`** (mounted app-wide in `App.vue`, next to the toast
   panel) is now the single presenter for both dialogs, derived from the store
   records. This also covers every other caller of `completeTask` that routes
   rejections to `repo.onError` — `Keep review & merge` on the card, the drawer
   and the Debug panel, and the stalled-pipeline retry in the integration bar —
   which were silent for the dirty-checkout type the same way. The records are
   one-pending-decision-per-task (a new record supersedes the other type for
   the same task), cleared on cancel/discard/send-back, on a successful retry,
   and by the store when the task leaves `review`. The presenter covers even
   the task-left-the-board case (a refresh raced the drop): it renders the
   dialog from a minimal id-only stand-in so the retry actions still work,
   instead of a duplicated toast alongside the dialog.
2. **A forced drop could bypass the dragover refusal (fixed in round 1).** The
   hover cue (`dropCheck`) and the drop path duplicated but slightly diverged
   checks, so a drop event that slipped past `dragover` (programmatic drops,
   drag-source quirks) fell through to a bare `setStatus` and only the server's
   technical 400 surfaced. Both now share one `moveRejection(task, toColId)`;
   the drop throws the same plain-English reason the cue shows, and the existing
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
- Human-assignee drags are validated client-side by the permissive
  `isValidHumanBoardMove` (any column to any column), mirroring the server's
  own rule for human tasks; a server-side refusal toasts verbatim. Pre-existing
  behavior, unchanged by this pass.
- Real-device touch input and screen-reader output were not exercised; the
  touch path is covered as far as tap-to-open-drawer plus the shared failure
  paths.

## Rendered evidence

Screenshots of the failing states rendered by the WebKit pass are committed
under `assets/board-moves-qa/` as `.jpg` (JPEG has no zlib stream, so the
staged-artifact guard's 4 MiB decompression scan cannot trip on them;
regenerate with
`QA_SHOTS=docs/qa/assets/board-moves-qa bunx vitest run --config
src/ui-app/vite.config.ts src/ui-app/tests/work-board-moves-qa-browser.test.ts`):
the rejection toast over the board, the dirty-`main` dialog and the failed
close-out card at 375 and 1280 px, plus the mobile queue at 375 px.
