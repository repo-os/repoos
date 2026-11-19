---
task: "1235"
pass: 1
at: "2026-11-19T17:14:29.869Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-work-board-drag-status-moves-and
state: ok
tree_identity: "781229aa3:a4e4c9a679"
---
## Verdict

`needs some work` — one drag rejection now opens the handoff-conflict dialog twice (BoardColumn + the task card's store-seeded watcher), and the sibling callers of `completeTask`/`keepReviewAndMerge` still swallow the two confirmation rejections silently.

## Relevance

`still relevant` — the QA premise holds: the board's rejection UX is real, mostly verified, and the fixes are worth landing once the class-level gaps below are closed.

## Evidence

None

## Bugs

- **Class: duplicate-dialog mounting (uncoordinated store-seeded watchers)** — `src/ui-app/src/components/BoardColumn.vue` + `src/ui-app/src/components/TaskCard.vue`. When a drag-to-done is refused with `WorktreeHandoffConflictError`, the store record is written before the store throws, so TaskCard's `immediate` watcher on `worktreeHandoffConflictFor` (TaskCard.vue:1583) opens the card's dialog **and** `onDraggedMoveError` opens BoardColumn's own — two stacked body-teleported overlays for the same rejection; after BoardColumn's dialog discards/send-backs/cancels (clearing the store record), TaskCard's dialog stays open with stale empty content because its watcher never closes on `null`. The new tests stub TaskCard (`mountColumn` default), so the double is untested. A drag with the drawer open on the same task can stack all three (drawer watch + card watch + column catch).
- **Class: silent-swallow sibling callers of completeTask (the whole class the diff fixes one instance of)** — the engineer's own report says the invariant is "every caller of `completeTask` must render the two dialog error types itself"; these callers route to `repo.onError`, which early-returns without a toast, so the rejection is still silent: `TaskCard.keepReviewAndMerge` (825), `TaskCard.retryStalledPipeline` (817), `DebugPanel.keepReviewAndMerge` (78), `TaskDrawer.keepReviewAndMerge` (2483), `IntegrationStatusBar.retryStalledPipeline` (308), and `keepReviewAndMerge` in `stores/repo.ts` (3828) whose callers are all of the above.
- **Class: docs-claim-vs-code mismatch** — `docs/qa/2026-11-board-moves-failures-qa.md` says the task-left-the-board fallback is "a fallback toast", but `repo.onError` early-returns for `DirtyCheckoutError`/`WorktreeHandoffConflictError` without toasting; only a feed line surfaces. Align doc (and the TL;DR's "completely silent" claim — the card's watcher already opened the handoff dialog before this change; only the dirty-checkout rejection was truly silent).

No further findings of this class were found after grepping: TaskCard.vue, TaskDrawer.vue, DebugPanel.vue, IntegrationStatusBar.vue, BoardColumn.vue, WorkView.vue, stores/repo.ts (onError, completeTask, keepReviewAndMerge), work-board-moves-qa-browser.test.ts, board-column-drop.test.ts.

## Edge cases

- Task deleted/refreshed mid-request: the fallback surfaces as a feed line only, no toast — degraded but not silent; consider a real toast here.
- Escape with stacked dialogs closes both at once (both listen on `window`).
- Human-assignee drags bypass `moveRejection` and stay on the cue's permissive `isValidHumanBoardMove`; server 400s toast verbatim (pre-existing).

## Suggestions

- Sync dialog state with the store record in one owner (e.g. card watcher opens and closes on the record; BoardColumn reuses it) rather than three independent refs.
- The single handoff shot is the app home (`auto` capture), acceptable given the documented shot-vocabulary limitation — a `QA_SHOTS` dir link in the QA doc would make the rendered evidence reachable from the report.

## Verdict

`needs some work`

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T17:10:44.596Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

