---
task: "1235"
pass: 2
at: "2026-11-19T18:11:44.010Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-work-board-drag-status-moves-and
state: ok
tree_identity: "b397ddf3f:b397ddf3f9"
---
## Verdict

`good to go` — round-1's three findings are fixed structurally; the diff is sound and the QA evidence renders correctly.

## Relevance

`still relevant` — the QA premise (board rejection UX under server failures) holds, and round 2 completed the fix the first pass demanded.

## Evidence

None

## Bugs

None found

Round 1 findings, verified fixed: the duplicate-dialog class (`BoardColumn` + `TaskCard` watchers stacking two overlays) is resolved by the new app-level `CloseOutDialogs.vue` — the store record is now the sole open-dialog signal, TaskCard/TaskDrawer open nothing, records clear on cancel/discard/send-back, on a successful retry, and when the task leaves `review` (repo.ts:1796–1801), so no stale dialog can linger. The silent-swallow-sibling-caller class (`keepReviewAndMerge` on card/drawer/DebugPanel/IntegrationBar) is covered by the same presenter, with a test pinning it (`work-board-moves-qa-browser.test.ts:833`) and a no-stacked-overlays test (line 792). The docs-claim-vs-code mismatch is rewritten to match the actual mechanism. The one-pending-decision rule (each record type supersedes the other, repo.ts:3284/3311) and the success-path record clearing are consumer-safe: no other code reads `dirtyCheckouts` beyond the presenter and `dirtyFilesFor`/`dirtyScopeFor`.

No further findings of this class were found after grepping: BoardColumn.vue, TaskCard.vue, TaskDrawer.vue, CloseOutDialogs.vue, App.vue, stores/repo.ts (`onError`, `completeTask`, `keepReviewAndMerge`, `dirtyCheckouts`, `worktreeHandoffConflicts`), shot-preview-fixtures.ts (`card:handoffConflict` #0810), close-out-dialogs.test.ts, work-board-moves-qa-browser.test.ts, board-column-drop.test.ts.

## Edge cases

- Human-assignee drags still bypass `moveRejection` via the early human branch in `onDrop` (server 400 toasts verbatim) — pre-existing behavior, unchanged by this diff.
- Task-left-the-board race: the presenter's id-only `Task` stand-in is safe — both dialogs read only `task.id`.
- Two tasks with simultaneous pending conflicts render one at a time; documented and acceptable.
- The commit-dirty retry lacks a visible busy state on the dialog buttons, but `withBusy` guards double-submission; cosmetic only.
- QA captures verified non-blank and legible (dirty-main dialog and rejection toast at 375 px render as described); the single auto handoff shot is the app home, a documented shot-vocabulary limitation accepted in pass 1, with `QA_SHOTS` jpgs committed as the real evidence.

## Suggestions

None

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T17:57:56.043Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

